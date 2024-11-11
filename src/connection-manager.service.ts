import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { $ } from "bun";
import { Duration } from "luxon";
import { PinoLogger } from "nestjs-pino";
import { AppConfig } from "./app.config";

export enum ConnectionState {
  NONE = "NONE",
  PRIMARY = "PRIMARY",
  BACKUP = "BACKUP",
}

@Injectable()
export class ConnectionManagerService implements OnModuleDestroy {
  private readonly appConfig: AppConfig;
  private readonly currentState = { state: ConnectionState.NONE };
  private setIntervalTimeout: Timer | null;
  constructor(
    private readonly logger: PinoLogger,
    private readonly configService: ConfigService,
  ) {
    this.appConfig = this.configService.get<AppConfig>(
      "_PROCESS_ENV_VALIDATED",
    );

    console.log({ conf: this.appConfig });
  }

  async checkConnectivityByInterface(
    interfaceName: string,
    monitoringUrl: string,
  ) {
    return $`curl --interface ${interfaceName} -sI --max-time 2 ${monitoringUrl}`.quiet();
  }

  async getUUIDFromDevice(device: string) {
    const result =
      await $`nmcli -t -f UUID,DEVICE connection show --active | grep "${device}" | cut -d: -f1`.quiet();
    return result.text().trim();
  }

  async setRoutePriority({
    connectionName,
    routeMetrics,
    autoconnectPriority,
  }: {
    connectionName: string;
    routeMetrics: number;
    autoconnectPriority: number;
  }) {
    const deviceUUID = await this.getUUIDFromDevice(connectionName);

    const updateLinkPriority =
      $`nmcli connection modify ${deviceUUID} ipv4.route-metric ${routeMetrics}`.quiet();
    const updateLinkPriorityV6 =
      $`nmcli connection modify ${deviceUUID} ipv6.route-metric ${routeMetrics}`.quiet();
    const updateLinkAutoConnect =
      $`nmcli connection modify ${deviceUUID} connection.autoconnect-priority ${autoconnectPriority}`.quiet();

    const [metricParam, metricParamV6, autoconnect] = (
      await Promise.allSettled([
        updateLinkPriority,
        updateLinkPriorityV6,
        updateLinkAutoConnect,
      ])
    ).map((promise) => promise.status === "fulfilled");

    const up = $`nmcli connection down ${connectionName}`;
    const down = $`nmcli connection down ${connectionName}`;

    await Promise.allSettled([up, down]);

    this.logger.info(
      `Connection (${connectionName}) ipv4.route-metric=${routeMetrics} ${metricParam ? "✅" : "❌"}`,
    );
    this.logger.info(
      `Connection (${connectionName}) ipv6.route-metric=${routeMetrics} ${metricParamV6 ? "✅" : "❌"}`,
    );
    this.logger.info(
      `Connection (${connectionName}) connection.autoconnect-priority=${autoconnectPriority} ${autoconnect ? "✅" : "❌"}`,
    );
  }

  async setConnectionState({
    from,
    to,
  }: { from: ConnectionState; to: ConnectionState }) {
    const { PRIMARY_CONNECTION, FAILOVER_CONNECTION } = this.appConfig;
    //The Linux kernel uses metrics to prioritize routes; a lower metric means a higher priority
    switch (to) {
      case ConnectionState.NONE:
        await this.setRoutePriority({
          connectionName: PRIMARY_CONNECTION,
          routeMetrics: 0,
          autoconnectPriority: 0,
        });
        await this.setRoutePriority({
          connectionName: FAILOVER_CONNECTION,
          routeMetrics: 0,
          autoconnectPriority: 0,
        });
        this.logger.info(
          `Changing from ${from} to ${to} connection is active.`,
        );
        break;
      case ConnectionState.PRIMARY:
        await this.setRoutePriority({
          connectionName: PRIMARY_CONNECTION,
          routeMetrics: 200,
          autoconnectPriority: 300,
        });
        await this.setRoutePriority({
          connectionName: FAILOVER_CONNECTION,
          routeMetrics: 300,
          autoconnectPriority: 200,
        });
        this.logger.info(
          `Changing from ${from} to ${to} connection is active.`,
        );
        break;
      case ConnectionState.BACKUP:
        await this.setRoutePriority({
          connectionName: PRIMARY_CONNECTION,
          routeMetrics: 300,
          autoconnectPriority: 200,
        });
        await this.setRoutePriority({
          connectionName: FAILOVER_CONNECTION,
          routeMetrics: 100,
          autoconnectPriority: 400,
        });
        this.logger.info(
          `Changing from ${from} to ${to} connection is active.`,
        );
        break;
    }

    this.currentState.state = to;
  }

  async connexionManager() {
    const { PRIMARY_CONNECTION, FAILOVER_CONNECTION, MONITORING_URL } =
      this.appConfig;

    const [primary, failover] = (
      await Promise.allSettled([
        this.checkConnectivityByInterface(PRIMARY_CONNECTION, MONITORING_URL),
        this.checkConnectivityByInterface(FAILOVER_CONNECTION, MONITORING_URL),
      ])
    ).map((promise: { status: string }) => promise.status === "fulfilled");

    this.logger.info(`Primary connection is ${primary ? "up ✅" : "down ❌"}`);
    this.logger.info(
      `Failover connection is ${failover ? "up ✅" : "down ❌"}`,
    );

    if (!primary && !failover) {
      this.logger.info("Both connections are disabled. Nothing to do. 🙅");
      await this.setConnectionState({
        from: this.currentState.state,
        to: ConnectionState.NONE,
      });
      return;
    }

    switch (this.currentState.state) {
      case ConnectionState.NONE:
        if (!primary) {
          await this.setConnectionState({
            from: this.currentState.state,
            to: ConnectionState.BACKUP,
          });
          return;
        }
        // Primary connection is up and running setting it as the current connection
        await this.setConnectionState({
          from: this.currentState.state,
          to: ConnectionState.PRIMARY,
        });

        break;

      case ConnectionState.PRIMARY:
        if (!primary) {
          await this.setConnectionState({
            from: this.currentState.state,
            to: ConnectionState.BACKUP,
          });
          this.logger.info(
            "Primary connection is down ❌ - Activating backup 🔄",
          );
        }
        break;

      case ConnectionState.BACKUP:
        if (primary) {
          await this.setConnectionState({
            from: this.currentState.state,
            to: ConnectionState.PRIMARY,
          });
          this.logger.info(
            "Primary connection is back up ✅ - Switching back to primary.",
          );
        }
        this.logger.info(
          "Primary connection is still down ❌ - Backup is already active, keeping it up.",
        );
        break;
    }
  }

  async start() {
    const runIntervalDuration = Duration.fromObject({
      seconds: this.appConfig.CHECK_INTERVAL_IN_SECONDS,
    }).toMillis();

    this.setIntervalTimeout = setInterval(
      async () => this.connexionManager(),
      runIntervalDuration,
    );
  }

  onModuleDestroy(): any {
    clearInterval(this.setIntervalTimeout);
    this.setIntervalTimeout = null;
  }
}

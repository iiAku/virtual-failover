import { setTimeout } from "node:timers/promises";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { $ } from "bun";
import { DateTime, Duration } from "luxon";
import { PinoLogger } from "nestjs-pino";
import { AppConfig, MONITORING_URL } from "./app.config";
import { LogLevel } from "./app.module";

export enum ConnectionState {
  NONE = "NONE",
  PRIMARY = "PRIMARY",
  BACKUP = "BACKUP",
}

@Injectable()
export class ConnectionManagerService {
  private readonly appConfig: AppConfig;
  private readonly currentState = { state: ConnectionState.NONE };
  private readonly monitoringUrl: string[] = MONITORING_URL;
  private checkInterval: Duration;
  constructor(
    private readonly logger: PinoLogger,
    private readonly configService: ConfigService,
  ) {
    this.appConfig = this.configService.get<AppConfig>(
      "_PROCESS_ENV_VALIDATED",
    );
    console.log({ conf: this.appConfig });
  }

  getCheckInterval() {
    this.checkInterval = [
      ConnectionState.NONE,
      ConnectionState.PRIMARY,
    ].includes(this.currentState.state)
      ? Duration.fromObject({
          seconds: this.appConfig.PRIMARY_CHECK_INTERVAL_IN_SECONDS,
        })
      : Duration.fromObject({
          seconds: this.appConfig.BACKUP_CHECK_INTERVAL_IN_SECONDS,
        });
    return this.checkInterval;
  }

  async getUUIDFromDevice(device: string) {
    const result =
      await $`nmcli -t -f UUID,DEVICE connection show --active | grep "${device}" | cut -d: -f1`.quiet();
    return result.text().trim();
  }

  async checkConnectivityByInterface(
    interfaceName: string,
    monitoringUrl: string,
  ) {
    this.logger.info(
      {
        interfaceName,
        monitoringUrl,
      },
      "Checking connectivity against",
    );
    return $`curl --interface ${interfaceName} -sI --max-time 1 --connect-timeout 1 ${monitoringUrl}`.quiet();
  }

  async reconnect(connectionName: string) {
    await $`nmcli device disconnect ${connectionName}`.quiet();
    await $`nmcli device connect ${connectionName}`.quiet();
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

    this.logger.info(`Setting route priority for connection ${connectionName}`);

    const start = DateTime.now();
    await this.reconnect(connectionName);
    const diff = start.diffNow().as("milliseconds") * -1;

    this.logger.info(
      `Connection (${connectionName}) took ${diff}ms to restart.`,
    );

    this.logger[metricParam ? LogLevel.Info : LogLevel.Warn](
      `Connection (${connectionName}) ipv4.route-metric=${routeMetrics} ${metricParam ? "✅" : "❌"}`,
    );
    this.logger[metricParamV6 ? LogLevel.Info : LogLevel.Warn](
      `Connection (${connectionName}) ipv6.route-metric=${routeMetrics} ${metricParamV6 ? "✅" : "❌"}`,
    );
    this.logger[autoconnect ? LogLevel.Info : LogLevel.Warn](
      `Connection (${connectionName}) connection.autoconnect-priority=${autoconnectPriority} ${autoconnect ? "✅" : "❌"}`,
    );
  }

  async setConnectionState({
    from,
    to,
  }: { from: ConnectionState; to: ConnectionState }) {
    const { PRIMARY_CONNECTION, BACKUP_CONNECTION } = this.appConfig;
    //The Linux kernel uses metrics to prioritize routes; a lower metric means a higher priority
    switch (to) {
      case ConnectionState.NONE:
        await Promise.all([
          this.setRoutePriority({
            connectionName: PRIMARY_CONNECTION,
            routeMetrics: 0,
            autoconnectPriority: 0,
          }),
          this.setRoutePriority({
            connectionName: BACKUP_CONNECTION,
            routeMetrics: 0,
            autoconnectPriority: 0,
          }),
        ]);
        this.logger.info(
          `Changing from ${from} to ${to} connection is active.`,
        );
        break;
      case ConnectionState.PRIMARY:
        await Promise.all([
          this.setRoutePriority({
            connectionName: PRIMARY_CONNECTION,
            routeMetrics: 200,
            autoconnectPriority: 300,
          }),
          this.setRoutePriority({
            connectionName: BACKUP_CONNECTION,
            routeMetrics: 300,
            autoconnectPriority: 200,
          }),
        ]);
        this.logger.info(
          `Changing from ${from} to ${to} connection is active.`,
        );
        break;
      case ConnectionState.BACKUP:
        await Promise.all([
          this.setRoutePriority({
            connectionName: PRIMARY_CONNECTION,
            routeMetrics: 300,
            autoconnectPriority: 200,
          }),
          this.setRoutePriority({
            connectionName: BACKUP_CONNECTION,
            routeMetrics: 100,
            autoconnectPriority: 400,
          }),
        ]);
        this.logger.info(
          `Changing from ${from} to ${to} connection is active.`,
        );
        break;
    }

    this.currentState.state = to;
  }

  getRandomUrl() {
    return this.monitoringUrl[
      Math.floor(Math.random() * this.monitoringUrl.length)
    ];
  }

  async checkLinks(primaryConnection, backupConnection) {
    return (
      await Promise.allSettled([
        this.checkConnectivityByInterface(
          primaryConnection,
          this.getRandomUrl(),
        ),
        this.checkConnectivityByInterface(
          backupConnection,
          this.getRandomUrl(),
        ),
      ])
    ).map((promise: { status: string }) => promise.status === "fulfilled");
  }

  async connexionManager() {
    const { PRIMARY_CONNECTION, BACKUP_CONNECTION } = this.appConfig;

    let [primary, backup] = await this.checkLinks(
      PRIMARY_CONNECTION,
      BACKUP_CONNECTION,
    );

    if (!primary) {
      //check a second time
      this.logger.warn("Primary connection seems to be down, checking again");
      [primary, backup] = await this.checkLinks(
        PRIMARY_CONNECTION,
        BACKUP_CONNECTION,
      );
    }
    this.logger.info(
      `Current check interval is ${this.getCheckInterval().as("seconds")} seconds`,
    );
    this.logger[primary ? LogLevel.Info : LogLevel.Warn](
      `Primary connection is ${primary ? "up ✅" : "down ❌"}`,
    );
    this.logger[backup ? LogLevel.Info : LogLevel.Warn](
      `Backup connection is ${backup ? "up ✅" : "down ❌"}`,
    );

    if (!primary && !backup) {
      this.logger.info("Both connections are disabled. Nothing to do. 🙅");
      await this.setConnectionState({
        from: this.currentState.state,
        to: ConnectionState.NONE,
      });
      return;
    }

    this.logger.info(`Connection state is ${this.currentState.state}`);

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
          this.logger.error(
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
          break;
        }
        this.logger.info(
          "Primary connection is still down ❌ - Backup is already active, keeping it up.",
        );
        break;
    }
  }

  async start() {
    while (true) {
      this.connexionManager();
      await setTimeout(this.getCheckInterval().as("milliseconds"));
    }
  }
}

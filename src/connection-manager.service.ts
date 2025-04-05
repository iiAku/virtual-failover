import { setTimeout } from "node:timers/promises";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { $ } from "bun";
import { DateTime, Duration } from "luxon";
import { AppConfig, MONITORING_URL } from "./app.config";
import {
  Connection,
  ConnectionState,
} from "./domain/feature/connection/connection.type";
import { retryPolicy } from "./retry.policy";
import { IRetryContext } from "cockatiel";
import { CustomError, ErrorCode } from "./system/error/custom.error";
import { Logger } from "./domain/logger.port";

@Injectable()
export class ConnectionManagerService {
  private readonly appConfig: AppConfig;
  private readonly currentState = { state: ConnectionState.NONE };
  private readonly monitoringUrl: string[] = MONITORING_URL;
  private checkInterval: Duration;
  private readonly connections: Connection;
  constructor(
    private readonly logger: Logger,
    private readonly configService: ConfigService,
  ) {
    this.appConfig = this.configService.get<AppConfig>(
      "_PROCESS_ENV_VALIDATED",
    );
    this.connections = {
      PRIMARY_CONNECTION: this.appConfig.PRIMARY_CONNECTION,
      BACKUP_CONNECTION: this.appConfig.BACKUP_CONNECTION,
    };
    console.log({ conf: this.appConfig });
  }

  getCheckInterval() {
    this.checkInterval =
      ConnectionState.BACKUP === this.currentState.state
        ? Duration.fromObject({
            seconds: this.appConfig.BACKUP_CHECK_INTERVAL_IN_SECONDS,
          })
        : Duration.fromObject({
            seconds: this.appConfig.PRIMARY_CHECK_INTERVAL_IN_SECONDS,
          });
    return this.checkInterval;
  }

  async getUUID(connectionName: string) {
    const result =
      await $`nmcli -t -f UUID,DEVICE connection show --active | grep "${connectionName}" | cut -d: -f1`.quiet();
    return result.text().trim();
  }

  async checkConnectivityByInterface(
    interfaceName: string,
    ctx: IRetryContext,
  ) {
    const monitoringUrl = this.getRandomUrl();
    this.logger.info("Checking connectivity against", {
      attempt: ctx.attempt,
      interfaceName,
      monitoringUrl,
    });
    return $`curl --interface ${interfaceName} -sI --max-time 1 --connect-timeout 1 ${monitoringUrl}`.quiet();
  }

  async bringUpAllInterfaces() {
    try {
      this.logger.info("Trying to bring up all interfaces");
      const up = [
        this.connections.PRIMARY_CONNECTION,
        this.connections.BACKUP_CONNECTION,
      ].map((connection) => $`nmcli device connect ${connection}`.quiet());
      const [primaryConnection, backupConnection] =
        await Promise.allSettled(up);

      this.logger.info(
        "Because something went wrong at last resort we tried to bring back all interfaces up",
        {
          primary: primaryConnection.status === "fulfilled" ? "✅" : "❌",
          backup: backupConnection.status === "fulfilled" ? "✅" : "❌",
        },
      );
    } catch (e) {
      this.logger.error("Failed to bring up all interfaces", e);
    }
  }

  async reconnect(connectionName: string) {
    try {
      await $`nmcli device disconnect ${connectionName}`.quiet();
      await $`nmcli device connect ${connectionName}`.quiet();
    } catch (e) {
      //This is fine even if we fail to reconnect interfaces, routing (prios through metrics) should be reflected
      this.logger.error(`Failed to reconnect ${connectionName}`, e);
      await this.bringUpAllInterfaces();
    }
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
    const deviceUUID = await this.getUUID(connectionName);

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

  async checkLinks(connection: string[]) {
    const checks = connection.map((connection) =>
      retryPolicy.execute((ctx) =>
        this.checkConnectivityByInterface(connection, ctx),
      ),
    );
    return (await Promise.allSettled(checks)).map(
      (promise: { status: string }) => promise.status === "fulfilled",
    );
  }

  async checkConnectionState(connections: Connection) {
    const { PRIMARY_CONNECTION, BACKUP_CONNECTION, FALLBACK_CONNECTION } =
      this.appConfig;

    const linksToCheck = [
      PRIMARY_CONNECTION,
      BACKUP_CONNECTION,
      ...(FALLBACK_CONNECTION ? [FALLBACK_CONNECTION] : []),
    ];

    const areConnectionManaged = (
      await Promise.all(linksToCheck.map((device) => this.getUUID(device)))
    ).filter((value) => !!value);

    if (linksToCheck.length != areConnectionManaged.length) {
      throw new CustomError(ErrorCode.UNKNOWN_CONNECTION_LINK, linksToCheck);
    }

    const checks = await this.checkLinks(linksToCheck);

    const [isPrimaryUp, isBackupUp, isFallbackUp] = checks;

    const primary = isPrimaryUp;

    const backup = isBackupUp || isFallbackUp || false;

    const before = structuredClone(connections).BACKUP_CONNECTION;

    connections.BACKUP_CONNECTION = isBackupUp
      ? BACKUP_CONNECTION
      : isFallbackUp
        ? FALLBACK_CONNECTION
        : BACKUP_CONNECTION;

    this.logger.info("Connectivity state", {
      primary: isPrimaryUp ? "✅" : "❌",
      backup: isBackupUp ? "✅" : "❌",
      ...(FALLBACK_CONNECTION ? { fallback: isFallbackUp ? "✅" : "❌" } : {}),
    });

    const after = structuredClone(connections).BACKUP_CONNECTION;

    if (before !== after) {
      this.logger.info(
        `Switching backup connection from ${before} to ${after}`,
      );
    }

    return { isPrimaryUp: primary, isBackupUp: backup };
  }

  async connexionManager(connections: Connection) {
    const { isPrimaryUp, isBackupUp } =
      await this.checkConnectionState(connections);

    this.logger.info(
      `Current check interval is ${this.getCheckInterval().as("seconds")} seconds`,
    );

    this.logger[isPrimaryUp ? LogLevel.Info : LogLevel.Warn](
      `Primary connection is ${isPrimaryUp ? "up ✅" : "down ❌"}`,
      { name: connections.PRIMARY_CONNECTION },
    );

    this.logger[isBackupUp ? LogLevel.Info : LogLevel.Warn](
      `Backup connection is ${isBackupUp ? "up ✅" : "down ❌"}`,
      { name: connections.BACKUP_CONNECTION },
    );

    if (!isPrimaryUp && !isBackupUp) {
      this.logger.info("Both connections are disabled. Nothing to do. 🙅");
      return;
    }

    this.logger.info(`Connection state is ${this.currentState.state}`);

    switch (this.currentState.state) {
      case ConnectionState.NONE:
        if (!isPrimaryUp) {
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
        if (!isPrimaryUp) {
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
        if (isPrimaryUp) {
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
      await this.connexionManager(this.connections);
      await setTimeout(this.getCheckInterval().as("milliseconds"));
    }
  }
}

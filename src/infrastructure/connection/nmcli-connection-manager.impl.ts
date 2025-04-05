import {
  ConnectionHealthyResult,
  ConnectionManager,
  ConnectionPriority,
} from "../../domain/feature/connection/connection-manager.port";
import { ConnectionType } from "../../domain/feature/workflow/workflow.state.model";
import { Logger, LogLevel } from "../../domain/logger.port";
import { ConfigService } from "@nestjs/config";
import { AppConfig, MONITORING_URL } from "../../app.config";
import { IRetryContext } from "cockatiel";
import { $ } from "bun";
import { retryPolicy } from "../../retry.policy";

export class NmcliConnectionManager implements ConnectionManager {
  private readonly appConfig: AppConfig;
  private readonly monitoringUrl: string[] = MONITORING_URL;
  private readonly connectionMapper: {
    [key in ConnectionType]?: { name: string };
  };

  constructor(
    private readonly logger: Logger,
    config: ConfigService,
  ) {
    this.appConfig = config.get<AppConfig>("_PROCESS_ENV_VALIDATED");
    this.connectionMapper = {
      [ConnectionType.PRIMARY]: { name: this.appConfig.PRIMARY_CONNECTION },
      [ConnectionType.BACKUP]: { name: this.appConfig.BACKUP_CONNECTION },
      [ConnectionType.FALLBACK]: { name: this.appConfig.FALLBACK_CONNECTION },
    };
  }

  private getRandomUrl() {
    return this.monitoringUrl[
      Math.floor(Math.random() * this.monitoringUrl.length)
    ];
  }

  private async checkConnectivity(interfaceName: string, ctx: IRetryContext) {
    const monitoringUrl = this.getRandomUrl();
    this.logger.info("Checking connectivity against", {
      attempt: ctx.attempt,
      interfaceName,
      monitoringUrl,
    });
    return $`curl --interface ${interfaceName} -sI --max-time 1 --connect-timeout 1 ${monitoringUrl}`.quiet();
  }

  async isConnectionHealthy(
    connectionType: ConnectionType,
  ): Promise<ConnectionHealthyResult> {
    const now = performance.now();
    const interfaceName = this.connectionMapper[connectionType]?.name;
    const check = await retryPolicy.execute((ctx) =>
      this.checkConnectivity(interfaceName, ctx),
    );
    const end = performance.now();

    return {
      healthy: check.exitCode === 0,
      connectionType,
      checkResolvedInMilisseconds: end - now,
    };
  }

  private async getUUID(connectionName: string) {
    const result =
      await $`nmcli -t -f UUID,DEVICE connection show --active | grep "${connectionName}" | cut -d: -f1`.quiet();
    return result.text().trim();
  }

  private async reloadNmcli(connectionName: string) {
    try {
      await $`nmcli device disconnect ${connectionName}`.quiet();
      await $`nmcli device connect ${connectionName}`.quiet();
    } catch (e) {
      //This is fine even if we fail to reconnect interfaces, routing (prios through metrics) should be reflected
      this.logger.error(`Failed to reconnect ${connectionName}`, e);
      await this.bringUpAllInterfaces();
    }
  }

  private async bringUpAllInterfaces() {
    try {
      this.logger.info("Trying to bring up all interfaces");
      const up = Object.values(this.connectionMapper).map(({ name }) =>
        $`nmcli device connect ${name}`.quiet(),
      );

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

  async setPriority({ connectionType }: ConnectionPriority): Promise<void> {
    const interfaceName = this.connectionMapper[connectionType]?.name;
    const routeMetrics = 100;
    const autoconnectPriority = 100;
    const deviceUUID = await this.getUUID(interfaceName);

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

    this.logger.info(`Setting route priority for connection ${interfaceName}`);

    this.logger[metricParam ? LogLevel.Info : LogLevel.Warn](
      `Connection (${interfaceName}) ipv4.route-metric=${routeMetrics} ${metricParam ? "✅" : "❌"}`,
    );

    this.logger[metricParamV6 ? LogLevel.Info : LogLevel.Warn](
      `Connection (${interfaceName}) ipv6.route-metric=${routeMetrics} ${metricParamV6 ? "✅" : "❌"}`,
    );

    this.logger[autoconnect ? LogLevel.Info : LogLevel.Warn](
      `Connection (${interfaceName}) connection.autoconnect-priority=${autoconnectPriority} ${autoconnect ? "✅" : "❌"}`,
    );
  }

  async reconnect(connectionType: ConnectionType) {
    const start = performance.now();
    const interfaceName = this.connectionMapper[connectionType]?.name;
    await this.reloadNmcli(interfaceName);
    const end = performance.now();
    const diff = Math.round(end - start);
    this.logger.info(
      `Connection (${interfaceName}) took ${diff}ms to restart.`,
    );
  }
}

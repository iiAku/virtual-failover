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
import {
  retryPolicy,
} from "../../system/resiliency/retry.policy";
import { CustomError, ErrorCode } from "../../system/error/custom.error";
import { z } from "zod";
import {toMetric} from "./metric.mapper";

export class NmcliConnectionManager implements ConnectionManager {
  private readonly appConfig: AppConfig;
  private readonly monitoringUrl: string[] = MONITORING_URL;
  private readonly connectionMapper: {
    [key in ConnectionType]?: {
      type: ConnectionType;
      interfaceName: string;
      fullName: string;
    };
  };

  constructor(
    private readonly logger: Logger,
    config: ConfigService,
  ) {
    this.appConfig = config.get<AppConfig>("_PROCESS_ENV_VALIDATED");
    console.log({ conf: this.appConfig });
    this.connectionMapper = {
      [ConnectionType.PRIMARY]: {
        type: ConnectionType.PRIMARY,
        interfaceName: this.appConfig.PRIMARY_CONNECTION,
        get fullName() {
          return `${this.type} (${this.interfaceName})`;
        },
      },
      [ConnectionType.BACKUP]: {
        type: ConnectionType.BACKUP,
        interfaceName: this.appConfig.BACKUP_CONNECTION,
        get fullName() {
          return `${this.type} (${this.interfaceName})`;
        },
      },
      [ConnectionType.FALLBACK]: {
        type: ConnectionType.FALLBACK,
        interfaceName: this.appConfig.FALLBACK_CONNECTION,
        get fullName() {
          return `${this.type} (${this.interfaceName})`;
        },
      },
    };
  }

  private getRandomUrl() {
    return this.monitoringUrl[
      Math.floor(Math.random() * this.monitoringUrl.length)
    ];
  }

  private getInterface(connectionType: ConnectionType) {
    const interfaceName = this.connectionMapper[connectionType];
    if (!interfaceName) {
      this.logger.error(`Connection type ${connectionType} not found`);
      throw new CustomError(ErrorCode.UNKNOWN_CONNECTION_LINK, {
        connectionType,
        interfaceName,
      });
    }
    return interfaceName;
  }

  private async checkConnectivity(
    connectionType: ConnectionType,
    interfaceName: string,
    ctx: IRetryContext,
  ) {
    const monitoringUrl = this.getRandomUrl();
    this.logger.info("Checking connectivity against", {
      attempt: ctx.attempt,
      connectionType,
      interfaceName,
      monitoringUrl,
    });
    return $`curl --interface ${interfaceName} -sI --max-time 1 --connect-timeout 1 ${monitoringUrl}`
      .quiet()
      .nothrow();
  }

  private async getUUID(connectionName: string) {
    const result =
      await $`nmcli -t -f UUID,DEVICE connection show --active | grep "${connectionName}" | cut -d: -f1`.quiet();
    const resultAsText = result.text().trim();
    const isValid = z.string().uuid().safeParse(resultAsText);
    if (!isValid.success) {
      this.logger.error(`Failed to get UUID for connection ${connectionName}`, {
        result,
      });
      const stdoutToString = result.stdout.toString();
      const stderrToString = result.stderr.toString();
      throw new CustomError(ErrorCode.UNABLE_TO_GET_IFACE_UUID, {
        connectionName,
        stdout: stdoutToString,
        stderr: stderrToString,
      });
    }
    return isValid.data;
  }

  async isConnectionHealthy(
    connectionType: ConnectionType,
  ): Promise<ConnectionHealthyResult> {
    const now = performance.now();

    const { interfaceName } = this.getInterface(connectionType);
    const check = await retryPolicy.execute((ctx) =>
      this.checkConnectivity(connectionType, interfaceName, ctx),
    );

    const end = performance.now();

    return {
      healthy: check.exitCode === 0,
      connectionType,
      checkResolvedInMilisseconds: end - now,
    };
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

  async setPriority({
    connectionType,
    priority,
  }: ConnectionPriority): Promise<void> {
    const {interfaceName, fullName} = this.connectionMapper[connectionType];
    const metric = toMetric(priority);
    const routeMetrics = metric;
    const autoconnectPriority = metric;

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

    this.logger.info(
      `Setting route priority for connection  ${connectionType} ${interfaceName}`,
    );

    this.logger[metricParam ? LogLevel.Info : LogLevel.Warn](
      `Connection ${fullName} ipv4.route-metric=${routeMetrics} ${metricParam ? "✅" : "❌"}`,
    );

    this.logger[metricParamV6 ? LogLevel.Info : LogLevel.Warn](
      `Connection ${fullName} ipv6.route-metric=${routeMetrics} ${metricParamV6 ? "✅" : "❌"}`,
    );

    this.logger[autoconnect ? LogLevel.Info : LogLevel.Warn](
      `Connection ${fullName} connection.autoconnect-priority=${autoconnectPriority} ${autoconnect ? "✅" : "❌"}`,
    );
    await this.reconnect(connectionType);
  }

  async reconnect(connectionType: ConnectionType) {
    const start = performance.now();
    const { interfaceName, fullName } = this.getInterface(connectionType);

    //See what is the best option reconnect / vs up/down
    await this.reloadNmcli(interfaceName);
    //const deviceUUID = await this.getUUID(interfaceName);
    //await $`nmcli connection down uuid ${deviceUUID}`;
    //await $`nmcli connection up uuid ${deviceUUID}`;

    this.logger.info(`Connection ${fullName} reconnected successfully`);

    const end = performance.now();
    const diff = Math.round(end - start);
    this.logger.info(`Connection ${fullName}) took ${diff}ms to restart.`);
  }
}

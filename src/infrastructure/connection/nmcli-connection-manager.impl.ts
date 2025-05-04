import {
  ConnectionHealthyResult,
  ConnectionManager,
  ConnectionPriority,
} from "../../domain/feature/connection/connection-manager.port";
import { ConnectionType } from "../../domain/feature/workflow/workflow.state.model";
import { Logger } from "../../domain/logger.port";
import { ConfigService } from "@nestjs/config";
import { AppConfig, MONITORING_URL } from "../../app.config";
import { IRetryContext } from "cockatiel";
import { $ } from "bun";
import { MAX_RETRIES, retryPolicy } from "../../system/resiliency/retry.policy";
import { CustomError, ErrorCode } from "../../system/error/custom.error";
import { z } from "zod";
import { setTimeout } from "node:timers/promises";
import { Duration } from "luxon";

export class NmcliConnectionManager implements ConnectionManager {
  private readonly appConfig: AppConfig;
  private readonly monitoringUrl: string[] = MONITORING_URL;
  private readonly connectionMapper: {
    [key in ConnectionType]?: {
      type: ConnectionType;
      interfaceName: string;
      hasDisabledDhcpRouteRule: boolean;
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
        hasDisabledDhcpRouteRule: false,
        get fullName() {
          return `${this.type} (${this.interfaceName})`;
        },
      },
      [ConnectionType.BACKUP]: {
        type: ConnectionType.BACKUP,
        interfaceName: this.appConfig.BACKUP_CONNECTION,
        hasDisabledDhcpRouteRule: false,
        get fullName() {
          return `${this.type} (${this.interfaceName})`;
        },
      },
      [ConnectionType.FALLBACK]: {
        type: ConnectionType.FALLBACK,
        interfaceName: this.appConfig.FALLBACK_CONNECTION,
        hasDisabledDhcpRouteRule: false,
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
    const hasConnectivity =
      await $`curl --interface ${interfaceName} -sI --max-time 1 --connect-timeout 1 ${monitoringUrl}`
        .quiet()
        .nothrow();
    if (hasConnectivity.exitCode !== 0 && ctx.attempt < MAX_RETRIES) {
      throw new CustomError(ErrorCode.CONNECTIVITY_CHECK_FAILED);
    }
    return hasConnectivity;
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

  async setPriority({
    connectionType,
    priority,
  }: ConnectionPriority): Promise<void> {
    const { interfaceName } = this.connectionMapper[connectionType];

    const metric = (priority + 1) * 100;

    const deviceUUID = await this.getUUID(interfaceName);

    const updateLinkPriority = $`nmcli connection modify ${deviceUUID} ipv4.route-metric ${metric}`;
    const updateLinkPriorityV6 = $`nmcli connection modify ${deviceUUID} ipv6.route-metric ${metric}`;

    await Promise.all([updateLinkPriority, updateLinkPriorityV6]);

    await this.reconnect(connectionType);

    this.logger.info(
      `Connection ${connectionType} (${interfaceName}) priority set to ${metric}`,
    );
  }

  async reconnect(connectionType: ConnectionType) {
    const start = performance.now();
    const { interfaceName, fullName } = this.getInterface(connectionType);

    await $`nmcli device reapply ${interfaceName}`.quiet();

    this.logger.info(`Connection ${fullName} applied changes successfully`);

    const end = performance.now();
    const diff = Math.round(end - start);
    this.logger.info(`Connection ${fullName}) took ${diff}ms to apply changes`);
    await setTimeout(
      Duration.fromObject({ milliseconds: 250 }).as("milliseconds"),
    );
  }
}

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
import { retryPolicy } from "../../system/resiliency/retry.policy";
import { CustomError, ErrorCode } from "../../system/error/custom.error";
import { z } from "zod";
import { route, RouteInfo, RouteRoutingTables } from "iproute";

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

  private async handleHasNoRoutes(interfaceName: string) {
    const routeInfos = await route.show({
      dev: interfaceName,
    });
    if (!routeInfos) {
      const interfaceNmcliUUid = await this.getUUID(interfaceName);
      await $`nmcli connection modify ${interfaceNmcliUUid} ipv4.never-default no`;
      const routeInfos = await route.show({
        dev: interfaceName,
      });
    }
  }

  async setPriority({
    connectionType,
    priority,
  }: ConnectionPriority): Promise<void> {
    const { interfaceName } = this.connectionMapper[connectionType];

    const metric = (priority + 1) * 100;

    let routeInfos = await route.show({
      dev: interfaceName,
    });

    if (!this.connectionMapper[connectionType].hasDisabledDhcpRouteRule) {
      const interfaceNmcliUUid = await this.getUUID(interfaceName);
      await this.toggleDhcpRouteRule(interfaceNmcliUUid, false);
      this.logger.info("Modifying connection to avoid dhcp route generation", {
        connectionType,
        interfaceName,
      });
    }

    if (!routeInfos) {
      await this.reconnect(connectionType);
    }

    routeInfos = routeInfos
      ? routeInfos
      : await route.show({ dev: interfaceName });

    for (const routeInfo of routeInfos as RouteInfo[]) {
      this.logger.info(
        `Setting route priority for connection  ${connectionType} ${interfaceName}`,
        routeInfo,
      );
      const via = routeInfo.gateway
        ? { via: { address: routeInfo.gateway } }
        : {};

      const d = await route.del({ to: routeInfo.dst, dev: interfaceName });
      await route.flush({ table: RouteRoutingTables.Cache });

      this.logger.info(
        `Deleting route for connection  ${connectionType} ${interfaceName}`,
      );

      await route.flush({ table: RouteRoutingTables.Cache });

      await route.replace({
        table: RouteRoutingTables.Default,
        to: routeInfo.dst,
        dev: interfaceName,
        ...via,
        metric: metric,
      });
      await route.flush({ table: RouteRoutingTables.Cache });

      this.logger.info(
        `Adding route for connection  ${connectionType} ${interfaceName}`,
      );
    }
  }

  private toggleDhcpRouteRule(interfaceNmcliUUid: string, enable: boolean) {
    const toggle = enable ? "yes" : "no";
    return $`nmcli connection modify ${interfaceNmcliUUid} ipv4.never-default ${toggle}`;
  }

  async reconnect(connectionType: ConnectionType) {
    const start = performance.now();
    const { interfaceName, fullName } = this.getInterface(connectionType);

    const deviceUUID = await this.getUUID(interfaceName);
    await this.toggleDhcpRouteRule(deviceUUID, true);
    await $`nmcli connection down uuid ${deviceUUID}`;
    await $`nmcli connection up uuid ${deviceUUID}`;

    this.logger.info(`Connection ${fullName} reconnected successfully`);

    const end = performance.now();
    const diff = Math.round(end - start);
    this.logger.info(`Connection ${fullName}) took ${diff}ms to restart.`);
  }
}

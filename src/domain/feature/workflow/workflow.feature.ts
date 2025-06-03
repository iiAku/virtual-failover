import { Logger, LogLevel } from "src/domain/logger.port";
import {
  ConnectionHealthyResult,
  ConnectionManager,
} from "../connection/connection-manager.port";
import { ConnectionState } from "../connection/connection.type";
import { ConnectionType, WorkflowState } from "./workflow.state.model";
import { sortedConnectionCheck } from "./sort.helper";
import { setTimeout } from "node:timers/promises";
import { Duration } from "luxon";
import { isDefined } from "./is-defined";

export class Workflow {
  constructor(
    private readonly connectionManager: ConnectionManager,
    private readonly state: WorkflowState,
    private readonly logger: Logger,
  ) {}

  private async setConnectionPriority(
    connectionHealthyResult:
      | ConnectionHealthyResult
      | ConnectionHealthyResult[],
  ) {
    const connectionHealthyResults = Array.isArray(connectionHealthyResult)
      ? connectionHealthyResult
      : [connectionHealthyResult];

    const sortedConnectionHealthyResults = sortedConnectionCheck(
      connectionHealthyResults,
    ).filter(isDefined);

    if (sortedConnectionHealthyResults.length === 0) {
      this.logger.info("No healthy connections available - nothing to do.");
      return;
    }

    await Promise.all(
      sortedConnectionHealthyResults.map(
        (sortedConnectionHealthyResults, priority) => {
          this.logger.info(
            `Connection ${sortedConnectionHealthyResults.connectionType} is set to priority ${priority}`,
          );
          return this.connectionManager.setPriority({
            priority,
            connectionType: sortedConnectionHealthyResults.connectionType,
          });
        },
      ),
    );

    const eligibleConnection = sortedConnectionHealthyResults.find(
      (connectionHealthyResult) => connectionHealthyResult?.healthy === true,
    );

    if (eligibleConnection) {
      this.state.setMainConnection(eligibleConnection.connectionType);
    }
  }

  private async noneStrategy([
    primaryCheckResult,
    backupCheckResult,
    fallbackCheckResult,
  ]: ConnectionHealthyResult[]) {
    if (primaryCheckResult.healthy) {
      await this.setConnectionPriority([
        primaryCheckResult,
        backupCheckResult,
        fallbackCheckResult,
      ]);
    }

    if (
      !primaryCheckResult.healthy &&
      (backupCheckResult.healthy || fallbackCheckResult?.healthy)
    ) {
      await this.setConnectionPriority([
        backupCheckResult,
        fallbackCheckResult,
        primaryCheckResult,
      ]);
    }
  }

  private async primaryStrategy([
    primaryCheckResult,
    backupCheckResult,
    fallbackCheckResult,
  ]: ConnectionHealthyResult[]) {
    if (
      !primaryCheckResult.healthy &&
      (backupCheckResult.healthy || fallbackCheckResult?.healthy)
    ) {
      await this.setConnectionPriority([
        backupCheckResult,
        fallbackCheckResult,
        primaryCheckResult,
      ]);
      this.logger.error(
        "Primary connection is down ❌ - Activating backup/fallback 🔄",
      );
    }
  }

  private async backupStrategy([
    primaryCheckResult,
    backupCheckResult,
    fallbackCheckResult,
  ]: ConnectionHealthyResult[]) {
    if (primaryCheckResult.healthy) {
      await this.setConnectionPriority([
        primaryCheckResult,
        backupCheckResult,
        fallbackCheckResult,
      ]);
      this.logger.info(
        "Primary connection is back up ✅ - Switching back to primary.",
      );
      return;
    }

    if (!backupCheckResult.healthy && fallbackCheckResult?.healthy) {
      await this.setConnectionPriority([
        fallbackCheckResult,
        backupCheckResult,
        primaryCheckResult,
      ]);
      this.logger.error(
        "Backup connection is down ❌ - Activating fallback 🔄",
      );
      return;
    }

    this.logger.info(
      "Primary connection is still down ❌ - Backup/fallback is already active, keeping it up.",
    );
  }

  private async fallbackStrategy([
    primaryCheckResult,
    backupCheckResult,
    fallbackCheckResult,
  ]: ConnectionHealthyResult[]) {
    if (primaryCheckResult.healthy) {
      await this.setConnectionPriority([
        primaryCheckResult,
        backupCheckResult,
        fallbackCheckResult,
      ]);
      this.logger.info(
        "Primary connection is back up ✅ - Switching back to primary.",
      );
      return;
    }

    if (!fallbackCheckResult?.healthy && backupCheckResult.healthy) {
      await this.setConnectionPriority([
        backupCheckResult,
        primaryCheckResult,
        fallbackCheckResult,
      ]);
      this.logger.error(
        "Fallback connection is down ❌ - Activating backup 🔄",
      );
      return;
    }
    this.logger.info(
      "Primary connection is still down ❌ - fallback is already active, keeping it up.",
    );
  }

  async handler(
    primary: ConnectionType,
    backup: ConnectionType,
    fallback?: ConnectionType,
  ) {
    const connectionChecks = await Promise.all([
      this.connectionManager.isConnectionHealthy(primary),
      this.connectionManager.isConnectionHealthy(backup),
      ...(fallback
        ? [this.connectionManager.isConnectionHealthy(fallback)]
        : []),
    ]);

    for (const { connectionType, healthy } of connectionChecks) {
      this.logger[connectionType ? LogLevel.Info : LogLevel.Warn](
        `${connectionType} connection is ${healthy ? "up ✅" : "down ❌"}`,
      );
    }

    if (
      connectionChecks.every(
        (connectionCheck) => connectionCheck && !connectionCheck.healthy,
      )
    ) {
      this.logger.info("All connections are disabled. Nothing to do. 🙅");
      return;
    }

    switch (this.state.getCurrentConnectionState()) {
      case ConnectionState.NONE:
        return this.noneStrategy(connectionChecks);
      case ConnectionState.PRIMARY:
        return this.primaryStrategy(connectionChecks);
      case ConnectionState.BACKUP:
        return this.backupStrategy(connectionChecks);
      case ConnectionState.FALLBACK:
        return this.fallbackStrategy(connectionChecks);
    }
  }
}

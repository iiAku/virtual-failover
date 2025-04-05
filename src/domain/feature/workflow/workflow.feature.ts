import {
  ConnectionHealthyResult,
  ConnectionManager,
} from "../connection/connection-manager.port";
import { ConnectionState } from "../connection/connection.type";
import { Logger, LogLevel } from "../../logger.port";
import { ConnectionType, WorkflowState } from "./workflow.state.model";
import { sortedConnectionCheck } from "./sort.helper";

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
    ).filter(
      (connectionHealthyResult) => connectionHealthyResult?.healthy === true,
    );

    await Promise.all(
      sortedConnectionHealthyResults.map((connectionHealthyResult, priority) =>
        this.connectionManager.setPriority({
          priority,
          connectionType: connectionHealthyResult.connectionType,
        }),
      ),
    );
    this.state.setMainConnection(
      sortedConnectionHealthyResults[0].connectionType,
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

    const [primaryCheckResult, backupCheckResult, fallbackCheckResult] =
      connectionChecks;

    switch (this.state.getCurrentConnectionState()) {
      case ConnectionState.NONE:
        if (primaryCheckResult.healthy) {
          await this.setConnectionPriority(connectionChecks);
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
        break;

      case ConnectionState.PRIMARY:
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
        break;

      case ConnectionState.FALLBACK:
        if (primaryCheckResult.healthy) {
          await this.setConnectionPriority(connectionChecks);
          this.logger.info(
            "Primary connection is back up ✅ - Switching back to primary.",
          );
          break;
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
          break;
        }
        this.logger.info(
          "Primary connection is still down ❌ - fallback is already active, keeping it up.",
        );
        break;

      case ConnectionState.BACKUP:
        if (primaryCheckResult.healthy) {
          await this.setConnectionPriority(connectionChecks);
          this.logger.info(
            "Primary connection is back up ✅ - Switching back to primary.",
          );
          break;
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
          break;
        }

        this.logger.info(
          "Primary connection is still down ❌ - Backup/fallback is already active, keeping it up.",
        );
        break;
    }
  }
}

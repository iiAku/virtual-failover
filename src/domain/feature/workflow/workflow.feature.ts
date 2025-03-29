import { ConnectionManager } from "../connection/connection-manager.port";
import { ConnectionState } from "../connection/connection.type";
import { Logger, LogLevel } from "../../logger.port";
import { ConnectionType, WorkflowState } from "./workflow.state.model";

export class Workflow {
  constructor(
    private readonly connectionManager: ConnectionManager,
    private readonly state: WorkflowState,
    private readonly logger: Logger,
  ) {}

  private async setPrimaryHigherPriority() {
    await Promise.all([
      this.connectionManager.setHigherPriorityTo(ConnectionType.PRIMARY),
      this.connectionManager.setLowerPriorityTo(ConnectionType.BACKUP),
    ]);
    this.state.setMainConnection(ConnectionType.PRIMARY);
  }

  private async setBackupHigherPriority() {
    await Promise.all([
      this.connectionManager.setHigherPriorityTo(ConnectionType.BACKUP),
      this.connectionManager.setLowerPriorityTo(ConnectionType.PRIMARY),
    ]);
    this.state.setMainConnection(ConnectionType.BACKUP);
  }

  async handler(
    primary: ConnectionType,
    backup: ConnectionType,
    fallback?: ConnectionType,
  ) {
    const backupPromise = fallback
      ? Promise.race([
          this.connectionManager.isConnectionHealthy(backup),
          this.connectionManager.isConnectionHealthy(fallback),
        ])
      : this.connectionManager.isConnectionHealthy(backup);

    const [primaryIsHealthy, backupIsHealthy] = await Promise.all([
      this.connectionManager.isConnectionHealthy(primary),
      backupPromise,
    ]);

    this.logger[primaryIsHealthy ? LogLevel.Info : LogLevel.Warn](
      `Primary connection is ${primaryIsHealthy ? "up ✅" : "down ❌"}`,
    );

    this.logger[backupIsHealthy ? LogLevel.Info : LogLevel.Warn](
      `Backup connection is ${backupIsHealthy ? "up ✅" : "down ❌"}`,
    );

    if (!primaryIsHealthy && !backupIsHealthy) {
      this.logger.info("Both connections are disabled. Nothing to do. 🙅");
      return;
    }

    switch (this.state.getCurrentConnection()) {
      case ConnectionState.NONE:
        if (primaryIsHealthy) {
          await this.setPrimaryHigherPriority();
        }

        if (!primaryIsHealthy && backupIsHealthy) {
          await this.setBackupHigherPriority();
        }
        break;

      case ConnectionState.PRIMARY:
        if (!primaryIsHealthy && backupIsHealthy) {
          await this.setBackupHigherPriority();
          this.logger.error(
            "Primary connection is down ❌ - Activating backup 🔄",
          );
        }
        break;

      case ConnectionState.BACKUP:
        if (primaryIsHealthy) {
          await this.setPrimaryHigherPriority();
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
}

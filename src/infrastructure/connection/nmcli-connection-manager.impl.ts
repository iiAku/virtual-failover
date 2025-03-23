import { ConnectionManager } from "../../domain/feature/connection/connection-manager.port";
import { ConnectionType } from "../../domain/feature/workflow/workflow.state.model";
import { Logger, LogLevel } from "../../domain/logger.port";

export class NmcliConnectionManager implements ConnectionManager {
  constructor(private readonly logger: Logger) {}
  isConnectionHealthy(connectionType: ConnectionType): Promise<boolean> {
    const primaryIsHealthy = Math.random() >= 0.5;
    return Promise.resolve(primaryIsHealthy);
  }

  setHigherPriorityTo(connectionType: ConnectionType): Promise<void> {
    this.logger.info(`Setting higher priority to connection ${connectionType}`);
    return Promise.resolve();
  }

  setLowerPriorityTo(connectionType: ConnectionType): Promise<void> {
    this.logger.info(`Setting lower priority to connection ${connectionType}`);
    return Promise.resolve();
  }
}

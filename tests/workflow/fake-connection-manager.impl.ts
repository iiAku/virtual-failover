import {ConnectionManager} from "../../src/domain/feature/connection/connection-manager.port";
import {ConnectionType} from "../../src/domain/feature/workflow/workflow.state.model";
import {Logger} from "../../src/domain/logger.port";

export class FakeConnectionManager implements ConnectionManager {
    private connectionType: ConnectionType = ConnectionType.PRIMARY;
    public connectionIsHealthy = false;

  constructor(private readonly logger: Logger) {}

  isConnectionHealthy(connectionType: ConnectionType): Promise<boolean> {
    return Promise.resolve(this.connectionIsHealthy);
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
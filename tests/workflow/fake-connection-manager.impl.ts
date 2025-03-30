import {ConnectionHealthyResult, ConnectionManager, ConnectionPriority} from "../../src/domain/feature/connection/connection-manager.port";
import {ConnectionType} from "../../src/domain/feature/workflow/workflow.state.model";
import {Logger} from "../../src/domain/logger.port";
import {undefined} from "zod";

export class FakeConnectionManager implements ConnectionManager {
  constructor(private readonly logger: Logger) {}

  public readonly connectionTestMapper: {[key in ConnectionType]: boolean} = {
      [ConnectionType.PRIMARY]: false,
      [ConnectionType.BACKUP]: false,
      [ConnectionType.NONE]: false,
      [ConnectionType.FALLBACK]: false
  }

  reset(){
      this.connectionTestMapper[ConnectionType.PRIMARY] = false;
      this.connectionTestMapper[ConnectionType.BACKUP] = false;
      this.connectionTestMapper[ConnectionType.NONE] = false;
      this.connectionTestMapper[ConnectionType.FALLBACK] = false;
  }

  isConnectionHealthy(connectionType: ConnectionType): Promise<ConnectionHealthyResult> {
    return Promise.resolve({healthy: this.connectionTestMapper[connectionType], connectionType});
  }

  setPriority(connectionPriority: ConnectionPriority): Promise<void> {
      this.logger.info(`Setting priority to connection ${connectionPriority.connectionType} with priority ${connectionPriority.priority}`);
      return Promise.resolve();
  }
}
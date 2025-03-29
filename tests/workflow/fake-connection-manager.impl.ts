import {ConnectionManager} from "../../src/domain/feature/connection/connection-manager.port";
import {ConnectionType} from "../../src/domain/feature/workflow/workflow.state.model";
import {Logger} from "../../src/domain/logger.port";

export class FakeConnectionManager implements ConnectionManager {
  constructor(private readonly logger: Logger) {}

  public readonly connectionTestMapper: {[key in ConnectionType]: boolean} = {
      [ConnectionType.PRIMARY]: false,
      [ConnectionType.BACKUP]: false,
      [ConnectionType.NONE]: false
  }

  reset(){
      this.connectionTestMapper[ConnectionType.PRIMARY] = false;
      this.connectionTestMapper[ConnectionType.BACKUP] = false;
  }

  isConnectionHealthy(connectionType: ConnectionType): Promise<boolean> {
    return Promise.resolve(this.connectionTestMapper[connectionType]);
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
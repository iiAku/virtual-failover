import {ConnectionHealthyResult, ConnectionManager, ConnectionPriority} from "../../src/domain/feature/connection/connection-manager.port";
import {ConnectionType} from "../../src/domain/feature/workflow/workflow.state.model";
import {Logger} from "../../src/domain/logger.port";
import {undefined} from "zod";

export class FakeConnectionManager implements ConnectionManager {
  constructor(private readonly logger: Logger) {}

  public readonly connectionTestMapper: {[key in ConnectionType]: Omit<ConnectionHealthyResult, "connectionType">} = {
      [ConnectionType.PRIMARY]: {healthy: false, checkResolvedInMilisseconds: 0},
      [ConnectionType.BACKUP]: {healthy: false, checkResolvedInMilisseconds: 0},
      [ConnectionType.NONE]: {healthy: false, checkResolvedInMilisseconds: 0},
      [ConnectionType.FALLBACK]: {healthy: false, checkResolvedInMilisseconds: 0}
  }

  reset(){
      this.connectionTestMapper[ConnectionType.PRIMARY] = {healthy: false, checkResolvedInMilisseconds: 0};
      this.connectionTestMapper[ConnectionType.BACKUP] = {healthy: false, checkResolvedInMilisseconds: 0};
      this.connectionTestMapper[ConnectionType.NONE] = {healthy: false, checkResolvedInMilisseconds: 0};
      this.connectionTestMapper[ConnectionType.FALLBACK] = {healthy: false, checkResolvedInMilisseconds: 0};
  }

  isConnectionHealthy(connectionType: ConnectionType): Promise<ConnectionHealthyResult> {
    return Promise.resolve({healthy: this.connectionTestMapper[connectionType].healthy, connectionType, checkResolvedInMilisseconds: this.connectionTestMapper[connectionType].checkResolvedInMilisseconds});
  }

  setPriority(connectionPriority: ConnectionPriority): Promise<void> {
      this.logger.info(`Setting priority to connection ${connectionPriority.connectionType} with priority ${connectionPriority.priority}`);
      return Promise.resolve();
  }
}
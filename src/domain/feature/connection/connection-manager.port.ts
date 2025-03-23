import { ConnectionType } from "../workflow/workflow.state.model";

export abstract class ConnectionManager {
  abstract isConnectionHealthy(
    connectionType: ConnectionType,
  ): Promise<boolean>;
  abstract setHigherPriorityTo(connectionType: ConnectionType): Promise<void>;
  abstract setLowerPriorityTo(connectionType: ConnectionType): Promise<void>;
}

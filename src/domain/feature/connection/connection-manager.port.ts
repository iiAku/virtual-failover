import { ConnectionType } from "../workflow/workflow.state.model";

export type ConnectionHealthyResult = {
  healthy: boolean;
  connectionType: ConnectionType;
};

export abstract class ConnectionManager {
  abstract isConnectionHealthy(
    connectionType: ConnectionType,
  ): Promise<ConnectionHealthyResult>;
  abstract setHigherPriorityTo(connectionType: ConnectionType): Promise<void>;
  abstract setLowerPriorityTo(connectionType: ConnectionType): Promise<void>;
}

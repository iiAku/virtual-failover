import { ConnectionType } from "../workflow/workflow.state.model";

export type ConnectionHealthyResult = {
  connectionType: ConnectionType;
  healthy: boolean;
};

export type ConnectionPriority = {
  connectionType: ConnectionType;
  priority: number;
};

export abstract class ConnectionManager {
  abstract isConnectionHealthy(
    connectionType: ConnectionType,
  ): Promise<ConnectionHealthyResult>;
  abstract setPriority(connectionPriority: ConnectionPriority): Promise<void>;
}

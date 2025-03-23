import { ConnectionState } from "../connection/connection.type";
import { Logger } from "../../logger.port";

export enum ConnectionType {
  PRIMARY = "PRIMARY",
  BACKUP = "BACKUP",
}

export class WorkflowState {
  private currentConnection: ConnectionState = ConnectionState.NONE;
  private readonly state: {
    [key in ConnectionType]: { healthy: boolean; name: string };
  } = {
    [ConnectionType.PRIMARY]: {
      healthy: false,
      name: "",
    },
    [ConnectionType.BACKUP]: {
      healthy: false,
      name: "",
    },
  };

  constructor(private readonly logger: Logger) {}

  setConnectionIsHealthy(connectionType: ConnectionType, isHealthy: boolean) {
    this.state[connectionType].healthy = isHealthy;
  }

  setMainConnection(connectionType: ConnectionType) {
    this.currentConnection = ConnectionState[connectionType];
    this.setConnectionIsHealthy(connectionType, true);
  }

  getCurrentConnection(): ConnectionState {
    return this.currentConnection;
  }
}

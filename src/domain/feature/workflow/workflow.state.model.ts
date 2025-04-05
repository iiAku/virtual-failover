import { ConnectionState } from "../connection/connection.type";
import { Logger } from "../../logger.port";

export enum ConnectionType {
  PRIMARY = "PRIMARY",
  BACKUP = "BACKUP",
  FALLBACK = "FALLBACK",
  NONE = "NONE",
}

export class WorkflowState {
  private currentConnectionState: ConnectionState = ConnectionState.NONE;

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
    [ConnectionType.FALLBACK]: {
      healthy: false,
      name: "",
    },
    [ConnectionState.NONE]: {
      healthy: false,
      name: "",
    },
  };

  constructor(private readonly logger: Logger) {}

  setConnectionIsHealthy(connectionType: ConnectionType, isHealthy: boolean) {
    this.state[connectionType].healthy = isHealthy;
  }

  setMainConnection(connectionType: ConnectionType) {
    this.currentConnectionState = ConnectionState[connectionType];
    this.setConnectionIsHealthy(connectionType, true);
  }

  getConnectionTypeState(connectionType: ConnectionType) {
    return this.state[connectionType];
  }

  getCurrentConnectionState(): ConnectionState {
    return this.currentConnectionState;
  }
}

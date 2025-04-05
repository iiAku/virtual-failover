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
    [key in ConnectionType]: { healthy: boolean; };
  } = {
    [ConnectionType.PRIMARY]: {
      healthy: false,
    },
    [ConnectionType.BACKUP]: {
      healthy: false,
    },
    [ConnectionType.FALLBACK]: {
      healthy: false,
    },
    [ConnectionState.NONE]: {
      healthy: false,
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

  getCurrentConnectionState(): ConnectionState {
    return this.currentConnectionState;
  }
}

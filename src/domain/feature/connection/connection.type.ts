export type Connection = {
  PRIMARY_CONNECTION: string;
  BACKUP_CONNECTION: string;
  FALLBACK_CONNECTION?: string;
};

export enum ConnectionState {
  NONE = "NONE",
  PRIMARY = "PRIMARY",
  BACKUP = "BACKUP",
  FALLBACK = "FALLBACK",
}

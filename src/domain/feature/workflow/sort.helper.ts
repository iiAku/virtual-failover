import { ConnectionHealthyResult } from "../connection/connection-manager.port";
import { ConnectionType } from "./workflow.state.model";

export const sortSpecificElements = <T>(
  arr: T[],
  shouldSort: (el: T) => boolean,
  compareFn: (a: T, b: T) => number,
): T[] => {
  const elementsToSort = arr.filter(shouldSort).sort(compareFn);
  let index = 0;
  return arr.map((el) => (shouldSort(el) ? elementsToSort[index++] : el));
};

const isBackup = (connection: ConnectionHealthyResult) =>
  connection && connection.connectionType === ConnectionType.BACKUP;
const isFallback = (connection: ConnectionHealthyResult) =>
  connection && connection.connectionType === ConnectionType.FALLBACK;

export const sortedConnectionCheck = (
  connectionHealthyResult: ConnectionHealthyResult[],
) =>
  sortSpecificElements(
    connectionHealthyResult,
    (e) => isBackup(e) || isFallback(e),
    (a, b) => a.checkResolvedInMilisseconds - b.checkResolvedInMilisseconds,
  );

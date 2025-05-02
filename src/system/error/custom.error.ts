export type ErrorContext = Record<string, any>;

export enum ErrorCode {
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
  UNKNOWN_CONNECTION_LINK = "UNKNOWN_CONNECTION_LINK",
  UNABLE_TO_GET_IFACE_UUID = "UNABLE_TO_GET_IFACE_UUID",
}

export const CustomErrorToMessage: { [key in ErrorCode]: string } = {
  [ErrorCode.UNKNOWN_ERROR]: "Unknown error",
  [ErrorCode.UNABLE_TO_GET_IFACE_UUID]:
    "We couldn't get the UUID for the provided connection",
  [ErrorCode.UNKNOWN_CONNECTION_LINK]:
    "Check the provided connection. Some connections are not enabled or managed through nmcli.",
};

export class CustomError extends Error {
  public readonly errorCode: ErrorCode;
  public readonly context: ErrorContext;

  constructor(errorCode: ErrorCode, context: ErrorContext) {
    super(
      CustomErrorToMessage[errorCode] ??
        CustomErrorToMessage[ErrorCode.UNKNOWN_ERROR],
    );
    this.errorCode = errorCode;
    this.context = context;
    this.name = CustomError.name;
  }
}

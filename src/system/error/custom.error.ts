export type ErrorContext = Record<string, any>;

export enum ErrorCode {
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
  UNKNOWN_CONNECTION_LINK = "UNKNOWN_CONNECTION_LINK",
}

export const customErrorToMessage: { [key in ErrorCode]: string } = {
  [ErrorCode.UNKNOWN_ERROR]: "Unknown error",
  [ErrorCode.UNKNOWN_CONNECTION_LINK]:
    "Check the provided connection. Some connections are not enabled or managed through nmcli.",
};

export class CustomError extends Error {
  public readonly errorCode: ErrorCode;
  public readonly context: ErrorContext;

  constructor(errorCode: ErrorCode, context: ErrorContext) {
    super(
      customErrorToMessage[errorCode] ??
        customErrorToMessage[ErrorCode.UNKNOWN_ERROR],
    );
    this.errorCode = errorCode;
    this.context = context;
    this.name = CustomError.name;
  }
}

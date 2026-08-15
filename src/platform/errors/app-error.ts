export type AppErrorCode =
  | "AUTHENTICATION_REQUIRED"
  | "AUTHORIZATION_DENIED"
  | "CONFLICT"
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "PRECONDITION_FAILED";

export class AppError extends Error {
  constructor(
    readonly code: AppErrorCode,
    message: string,
    readonly status: number,
    readonly expose = false,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "AppError";
  }
}

export class AuthorizationError extends AppError {
  constructor(message = "The requested action is not permitted.") {
    super("AUTHORIZATION_DENIED", message, 403, true);
    this.name = "AuthorizationError";
  }
}

export class ConcurrencyError extends AppError {
  constructor(message = "The record changed before this action completed.") {
    super("CONFLICT", message, 409, true);
    this.name = "ConcurrencyError";
  }
}

export class ValidationError extends AppError {
  constructor(message = "The submitted data is not valid.") {
    super("INVALID_INPUT", message, 400, true);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "The requested record was not found.") {
    super("NOT_FOUND", message, 404, true);
    this.name = "NotFoundError";
  }
}

export class PreconditionError extends AppError {
  constructor(message = "The requested action is not valid for this record.") {
    super("PRECONDITION_FAILED", message, 412, true);
    this.name = "PreconditionError";
  }
}

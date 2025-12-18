export type ErrorCode =
  | 'invalid_request'
  | 'authentication_failed'
  | 'permission_denied'
  | 'not_found'
  | 'rate_limited'
  | 'internal_error'
  | 'service_unavailable'
  | 'timeout';

export type APIErrorResponse = {
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
};

export class SubconsciousError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, status: number, details?: Record<string, unknown>) {
    super(message);
    this.name = 'SubconsciousError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class AuthenticationError extends SubconsciousError {
  constructor(message: string = 'Invalid API key') {
    super('authentication_failed', message, 401);
    this.name = 'AuthenticationError';
  }
}

export class RateLimitError extends SubconsciousError {
  constructor(message: string = 'Rate limit exceeded') {
    super('rate_limited', message, 429);
    this.name = 'RateLimitError';
  }
}

export class NotFoundError extends SubconsciousError {
  constructor(message: string = 'Resource not found') {
    super('not_found', message, 404);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends SubconsciousError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('invalid_request', message, 400, details);
    this.name = 'ValidationError';
  }
}

import type { z, ZodError } from 'zod';
import {
  SubconsciousError,
  AuthenticationError,
  RateLimitError,
  NotFoundError,
  ValidationError,
  ResponseValidationError,
  type APIErrorResponse,
  type ErrorCode,
} from '../errors.js';

export type RequestOptions = RequestInit & {
  signal?: AbortSignal;
};

async function parseErrorResponse(res: Response): Promise<SubconsciousError> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // Non-JSON error body — fall through.
  }

  let code: ErrorCode = mapStatusToCode(res.status);
  let message: string = res.statusText || `HTTP ${res.status}`;
  let details: Record<string, unknown> | undefined;

  if (body && typeof body === 'object' && 'error' in body) {
    const errField = (body as APIErrorResponse).error as unknown;
    if (errField && typeof errField === 'object') {
      const e = errField as APIErrorResponse['error'];
      if (e.code) code = e.code;
      if (e.message) message = e.message;
      if (e.details) details = e.details;
    } else if (typeof errField === 'string') {
      message = errField;
    }
  }

  switch (code) {
    case 'authentication_failed':
      return new AuthenticationError(message);
    case 'rate_limited':
      return new RateLimitError(message);
    case 'not_found':
      return new NotFoundError(message);
    case 'invalid_request':
      return new ValidationError(message, details);
    default:
      return new SubconsciousError(code, message, res.status, details);
  }
}

function mapStatusToCode(status: number): ErrorCode {
  switch (status) {
    case 400:
      return 'invalid_request';
    case 401:
      return 'authentication_failed';
    case 403:
      return 'permission_denied';
    case 404:
      return 'not_found';
    case 429:
      return 'rate_limited';
    case 503:
      return 'service_unavailable';
    case 504:
      return 'timeout';
    default:
      return 'internal_error';
  }
}

/**
 * Run a parsed JSON body through a Zod schema. Mirrors Python's
 * `Run.model_validate()` — unknown keys are silently dropped (Zod object
 * default), missing/mismatched fields raise {@link ResponseValidationError}.
 */
export function validateResponse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ResponseValidationError(
      `Response did not match expected schema: ${result.error.message}`,
      result.error as ZodError,
    );
  }
  return result.data;
}

/** Issue a JSON request and validate the response body against `schema`. */
export async function request<T>(
  url: string,
  schema: z.ZodType<T>,
  opts: RequestOptions = {},
): Promise<T> {
  const res = await fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...opts.headers,
    },
  });

  if (!res.ok) {
    throw await parseErrorResponse(res);
  }

  const data = (await res.json()) as unknown;
  return validateResponse(schema, data);
}

export async function requestStream(url: string, opts: RequestOptions = {}): Promise<Response> {
  const res = await fetch(url, {
    ...opts,
    headers: {
      Accept: 'text/event-stream',
      ...opts.headers,
    },
  });

  if (!res.ok) {
    throw await parseErrorResponse(res);
  }

  return res;
}

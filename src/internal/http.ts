import {
  SubconsciousError,
  AuthenticationError,
  RateLimitError,
  NotFoundError,
  ValidationError,
  type APIErrorResponse,
  type ErrorCode,
} from '../types/error.js';

export type RequestOptions = RequestInit & {
  signal?: AbortSignal;
};

async function parseErrorResponse(res: Response): Promise<SubconsciousError> {
  try {
    const body = (await res.json()) as APIErrorResponse;
    const { code, message, details } = body.error;

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
  } catch {
    return new SubconsciousError(
      mapStatusToCode(res.status),
      res.statusText || `HTTP ${res.status}`,
      res.status,
    );
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

export async function request<T>(url: string, opts: RequestOptions = {}): Promise<T> {
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

  return res.json() as Promise<T>;
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

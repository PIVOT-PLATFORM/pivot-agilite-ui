import { HttpErrorResponse } from '@angular/common/http';
import { ProblemDetail } from '../models/wheel.model';

/**
 * Extracts the machine-readable `code` from a failed wheel-API HTTP response, if present.
 *
 * @param error the error thrown by an HttpClient call against the wheel API
 * @returns the `code` value (e.g. `INVALID_NAME`, `EMPTY_ENTRIES`), or `undefined` if the
 *          response carries no RFC 7807 `code` property (e.g. a 401/404/5xx)
 */
export function extractErrorCode(error: unknown): string | undefined {
  if (error instanceof HttpErrorResponse) {
    const body = error.error as ProblemDetail | undefined;
    return body?.code;
  }
  return undefined;
}

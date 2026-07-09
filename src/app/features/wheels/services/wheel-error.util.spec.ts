import { HttpErrorResponse } from '@angular/common/http';
import { extractErrorCode } from './wheel-error.util';

describe('extractErrorCode', () => {
  it('returns the code from an HttpErrorResponse RFC 7807 body', () => {
    const error = new HttpErrorResponse({ error: { title: 'Validation failed', code: 'INVALID_NAME' }, status: 400 });
    expect(extractErrorCode(error)).toBe('INVALID_NAME');
  });

  it('returns undefined when the body has no code (e.g. a plain 404/401/5xx)', () => {
    const error = new HttpErrorResponse({ error: { title: 'Not found' }, status: 404 });
    expect(extractErrorCode(error)).toBeUndefined();
  });

  it('returns undefined for a non-HttpErrorResponse value', () => {
    expect(extractErrorCode(new Error('boom'))).toBeUndefined();
  });
});

import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  CreateRetroSessionRequest,
  RetroSessionJoinResponse,
  RetroSessionResponse,
} from './retro.models';

/**
 * HTTP client for the retrospective session resource (`/retro/sessions`, US20.1.1).
 *
 * **Known auth gap (bootstrap, `EN17.3`):** `@pivot/ui-core` — the package meant to
 * provide `AuthService`/`AuthInterceptor` — is not yet published/consumable in this
 * repo (see `CLAUDE.md`, `TODO-SETUP.md`). No `HttpInterceptor` attaching an
 * `Authorization: Bearer …` header is registered anywhere in this app. As a direct
 * consequence, {@link create} requests leave without a bearer token today, and the
 * backend correctly rejects them with `401` until the shell wires real auth — this is
 * an accepted, documented gap (mirrors the identical precedent in
 * `pivot-collaboratif-ui`), not a bug for this service to work around. The method is
 * still built to the final, correct request/response shape so that wiring
 * `@pivot/ui-core`'s interceptor later requires zero changes here.
 *
 * {@link resolveByJoinCode} has no such gap — it calls an intentionally public,
 * unauthenticated backend endpoint and works end-to-end today.
 */
@Injectable({ providedIn: 'root' })
export class RetroApiService {
  private readonly http = inject(HttpClient);

  /**
   * Creates a retrospective session for `request.teamId`. The caller must be an
   * authenticated member of that team — enforced server-side, never re-checked or
   * filtered client-side (this repo never resolves tenant/team membership itself).
   *
   * See the class-level TSDoc for the current auth gap affecting this call.
   *
   * @throws HttpErrorResponse 400 invalid title/format/timer/voteCount (`ProblemDetail.code`
   *   e.g. `INVALID_TITLE`/`INVALID_FORMAT`/`INVALID_TIMER`), 401 no/invalid token
   *   (expected today, see class TSDoc), 403 caller not a team member, 404 team not
   *   found or belongs to another tenant.
   */
  create(request: CreateRetroSessionRequest): Observable<RetroSessionResponse> {
    return this.http.post<RetroSessionResponse>(`${environment.apiUrl}/retro/sessions`, request);
  }

  /**
   * Resolves a 6-character join code to public session metadata. Public
   * endpoint — no `Authorization` header is sent or required.
   *
   * @throws HttpErrorResponse 404 unknown join code, 410 session expired or closed.
   */
  resolveByJoinCode(joinCode: string): Observable<RetroSessionJoinResponse> {
    return this.http.get<RetroSessionJoinResponse>(
      `${environment.apiUrl}/retro/sessions/join/${joinCode}`,
    );
  }
}

import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  CreateRetroFormatRequest,
  CreateRetroSessionRequest,
  RetroFormatDefinition,
  RetroFormatsResponse,
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
 *
 * {@link listFormats} and {@link createFormat} (US20.2.1, `/retro/formats`) are subject to
 * the exact same auth gap as {@link create} — same reasoning, same fix once
 * `@pivot/ui-core` is wired in.
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
   * @throws HttpErrorResponse 400 invalid title/format/timer/voteCount/customFormatId
   *   (`ProblemDetail.code` e.g. `INVALID_TITLE`/`INVALID_FORMAT`/`INVALID_TIMER`/
   *   `CUSTOM_FORMAT_ID_REQUIRED`/`CUSTOM_FORMAT_ID_NOT_ALLOWED`, US20.2.1), 401 no/invalid
   *   token (expected today, see class TSDoc), 403 caller not a team member, 404 team not
   *   found or belongs to another tenant, or (US20.2.1) `customFormatId` not found /
   *   belongs to another tenant (`CUSTOM_FORMAT_NOT_FOUND`).
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

  /**
   * Lists the retrospective format catalogue (US20.2.1): the 4 system formats (fixed order),
   * followed by the caller's tenant's own custom formats, if any.
   *
   * See the class-level TSDoc for the current auth gap affecting this call.
   *
   * @throws HttpErrorResponse 401 no/invalid token (expected today, see class TSDoc).
   */
  listFormats(): Observable<RetroFormatsResponse> {
    return this.http.get<RetroFormatsResponse>(`${environment.apiUrl}/retro/formats`);
  }

  /**
   * Creates a tenant-scoped custom retrospective format (US20.2.1). The returned
   * {@link RetroFormatDefinition.key} (a server-generated UUID) is the value to send as
   * `customFormatId` in a subsequent {@link create} call with `format: 'CUSTOM'`.
   *
   * See the class-level TSDoc for the current auth gap affecting this call.
   *
   * @throws HttpErrorResponse 400 invalid label, invalid column count (0/1/>8 columns), or
   *   invalid column label (`ProblemDetail.code` `INVALID_FORMAT_LABEL` /
   *   `CUSTOM_FORMAT_INVALID_COLUMN_COUNT` / `INVALID_COLUMN_LABEL`), 401 no/invalid token
   *   (expected today, see class TSDoc).
   */
  createFormat(request: CreateRetroFormatRequest): Observable<RetroFormatDefinition> {
    return this.http.post<RetroFormatDefinition>(`${environment.apiUrl}/retro/formats`, request);
  }
}

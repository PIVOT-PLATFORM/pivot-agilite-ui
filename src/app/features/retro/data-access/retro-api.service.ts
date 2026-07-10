import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  CloseContributionResponse,
  CloseSessionResponse,
  CloseVoteResponse,
  CreateRetroActionRequest,
  CreateRetroFormatRequest,
  CreateRetroSessionRequest,
  OpenVoteResponse,
  RetroFormatDefinition,
  RetroFormatsResponse,
  RetroParticipantAccessResponse,
  RetroSessionJoinResponse,
  RetroSessionResponse,
  RevealResponse,
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
   * Fetches a session's full detail (any phase, including `CLOSED`) — requires the caller to be
   * an authenticated member of the session's tenant.
   *
   * See the class-level TSDoc for the current auth gap affecting this call: today this always
   * 401s (no bearer token is attached anywhere in this app yet), which the session room view
   * (US20.1.2a) treats as an expected, recoverable condition — falling back to whatever minimal
   * data it already has from the join flow — not a hard failure.
   *
   * @throws HttpErrorResponse 401 no/invalid token (expected today, see class TSDoc), 404 unknown
   *   session or belongs to another tenant.
   */
  getById(sessionId: string): Observable<RetroSessionResponse> {
    return this.http.get<RetroSessionResponse>(`${environment.apiUrl}/retro/sessions/${sessionId}`);
  }

  /**
   * Joins a session's realtime STOMP channel (US20.1.2a), minting a fresh access grant.
   *
   * Deliberately callable **without** an `Authorization` header — unlike {@link create}/{@link
   * getById} — mirroring US20.1.1's frictionless join-by-code design: an account-less
   * participant is still granted access, simply never marked `facilitator`. When a bearer token
   * *is* attached (once `@pivot/ui-core` is wired in) and resolves to the session's own
   * facilitator, the response is marked `facilitator: true`.
   *
   * @throws HttpErrorResponse 404 unknown session, 410 session expired or already closed.
   */
  joinRealtimeSession(sessionId: string): Observable<RetroParticipantAccessResponse> {
    return this.http.post<RetroParticipantAccessResponse>(
      `${environment.apiUrl}/retro/sessions/${sessionId}/participants`,
      {},
    );
  }

  /**
   * Manually closes the contribution phase (facilitator only), immediately transitioning to
   * `REVUE` before any configured timer would have expired it.
   *
   * See the class-level TSDoc for the current auth gap affecting this call.
   *
   * @throws HttpErrorResponse 401 no/invalid token, 403 caller is not the facilitator, 404 unknown
   *   session or belongs to another tenant, 409 session not currently in `CONTRIBUTION`.
   */
  closeContribution(sessionId: string): Observable<CloseContributionResponse> {
    return this.http.post<CloseContributionResponse>(
      `${environment.apiUrl}/retro/sessions/${sessionId}/contribution/close`,
      {},
    );
  }

  /**
   * Triggers the reveal (facilitator only): every submitted card is broadcast in clear, grouped
   * by column, to every participant on the session's realtime channel.
   *
   * See the class-level TSDoc for the current auth gap affecting this call.
   *
   * @throws HttpErrorResponse 401 no/invalid token, 403 caller is not the facilitator, 404 unknown
   *   session or belongs to another tenant, 409 session has not yet reached `REVUE`.
   */
  reveal(sessionId: string): Observable<RevealResponse> {
    return this.http.post<RevealResponse>(`${environment.apiUrl}/retro/sessions/${sessionId}/reveal`, {});
  }

  /**
   * Manually opens the vote phase (facilitator only, US20.1.2b), immediately transitioning to
   * `VOTE`.
   *
   * See the class-level TSDoc for the current auth gap affecting this call.
   *
   * @throws HttpErrorResponse 401 no/invalid token, 403 caller is not the facilitator, 404 unknown
   *   session or belongs to another tenant, 409 session has not yet reached `REVUE`.
   */
  openVote(sessionId: string): Observable<OpenVoteResponse> {
    return this.http.post<OpenVoteResponse>(`${environment.apiUrl}/retro/sessions/${sessionId}/vote/open`, {});
  }

  /**
   * Manually closes the vote phase (facilitator only, US20.1.2b), immediately transitioning to
   * `ACTION` — the vote-count ranking is broadcast separately, alongside `PHASE_CHANGED`, on the
   * realtime channel (not part of this response).
   *
   * See the class-level TSDoc for the current auth gap affecting this call.
   *
   * @throws HttpErrorResponse 401 no/invalid token, 403 caller is not the facilitator, 404 unknown
   *   session or belongs to another tenant, 409 session not currently in `VOTE`.
   */
  closeVote(sessionId: string): Observable<CloseVoteResponse> {
    return this.http.post<CloseVoteResponse>(`${environment.apiUrl}/retro/sessions/${sessionId}/vote/close`, {});
  }

  /**
   * Manually closes the session (facilitator only, US20.1.2c), immediately transitioning to the
   * terminal `CLOSED` phase — every participant receives `SESSION_CLOSED` on the realtime
   * channel and the session becomes read-only from then on.
   *
   * See the class-level TSDoc for the current auth gap affecting this call.
   *
   * @throws HttpErrorResponse 401 no/invalid token, 403 caller is not the facilitator, 404 unknown
   *   session or belongs to another tenant, 409 session not currently in `ACTION`.
   */
  closeSession(sessionId: string): Observable<CloseSessionResponse> {
    return this.http.post<CloseSessionResponse>(`${environment.apiUrl}/retro/sessions/${sessionId}/close`, {});
  }

  /**
   * Triggers action creation from a ranked card in the `ACTION` phase (US20.1.2c) — calls
   * US20.3.1's `POST /retro/sessions/{id}/actions` with the card as source.
   *
   * **US20.3.1 has not shipped yet** (next wave, dependent on this US): this endpoint does not
   * exist server-side today, so this call is expected to fail (404-equivalent) until it lands.
   * Built to the correct forward request shape now so wiring the real response requires no
   * change here later — the session room view already treats any failure of this call as a
   * recoverable, per-card error, never an unhandled exception.
   *
   * @param sessionId the session the card belongs to
   * @param request the action to create — see {@link CreateRetroActionRequest}'s TSDoc for why
   *   its shape is provisional
   */
  createAction(sessionId: string, request: CreateRetroActionRequest): Observable<unknown> {
    return this.http.post(`${environment.apiUrl}/retro/sessions/${sessionId}/actions`, request);
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

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AGILITE_API_URL } from '../../../core/config/tokens';
import {
  CloseContributionResponse,
  CloseSessionResponse,
  CloseVoteResponse,
  CreateRetroActionRequest,
  CreateRetroFormatRequest,
  CreateRetroSessionRequest,
  OpenVoteResponse,
  RetroActionResponse,
  RetroActionSort,
  RetroActionStatus,
  RetroFormatDefinition,
  RetroFormatsResponse,
  RetroParticipantAccessResponse,
  RetroSessionJoinResponse,
  RetroSessionResponse,
  RetroTeamMemberResponse,
  RevealResponse,
  UpdateRetroActionStatusRequest,
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
 *
 * {@link createAction}, {@link updateActionStatus}, {@link listTeamActions} and {@link
 * listTeamMembers} (US20.3.1, `/retro/sessions/{id}/actions`, `/retro/actions/{actionId}`,
 * `/retro/teams/{teamId}/actions`, `/teams/{teamId}/members`) are all subject to the exact same
 * auth gap as {@link create} — same reasoning, same fix once `@pivot/ui-core` is wired in.
 *
 * {@link listPendingActions} (US20.3.2, `/retro/teams/{teamId}/retro/pending-actions`) is subject
 * to the exact same auth gap as {@link create} — same reasoning, same fix once `@pivot/ui-core`
 * is wired in.
 */
@Injectable({ providedIn: 'root' })
export class RetroApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(AGILITE_API_URL);

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
    return this.http.post<RetroSessionResponse>(`${this.apiUrl}/retro/sessions`, request);
  }

  /**
   * Resolves a 6-character join code to public session metadata. Public
   * endpoint — no `Authorization` header is sent or required.
   *
   * @throws HttpErrorResponse 404 unknown join code, 410 session expired or closed.
   */
  resolveByJoinCode(joinCode: string): Observable<RetroSessionJoinResponse> {
    return this.http.get<RetroSessionJoinResponse>(
      `${this.apiUrl}/retro/sessions/join/${joinCode}`,
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
    return this.http.get<RetroSessionResponse>(`${this.apiUrl}/retro/sessions/${sessionId}`);
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
      `${this.apiUrl}/retro/sessions/${sessionId}/participants`,
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
      `${this.apiUrl}/retro/sessions/${sessionId}/contribution/close`,
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
    return this.http.post<RevealResponse>(`${this.apiUrl}/retro/sessions/${sessionId}/reveal`, {});
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
    return this.http.post<OpenVoteResponse>(`${this.apiUrl}/retro/sessions/${sessionId}/vote/open`, {});
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
    return this.http.post<CloseVoteResponse>(`${this.apiUrl}/retro/sessions/${sessionId}/vote/close`, {});
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
    return this.http.post<CloseSessionResponse>(`${this.apiUrl}/retro/sessions/${sessionId}/close`, {});
  }

  /**
   * Creates an action during a session's `ACTION` phase (US20.3.1) — either from the session
   * room's quick per-card trigger or from the full creation form. Every other participant sees
   * the new action appear via the realtime `ACTION_CREATED` event ({@link
   * RetroSessionWsService}, `RetroSessionTopicEvent`) broadcast on the session's own topic — this
   * call's response is only used to update the *caller's* own view immediately.
   *
   * See the class-level TSDoc for the current auth gap affecting this call.
   *
   * @param sessionId the session to create the action in
   * @param request the action to create
   * @throws HttpErrorResponse 400 `ownerUserId` is not a member of the session's team, or
   *   `sourceCardId` does not reference a card of this session, 401 no/invalid token (expected
   *   today, see class TSDoc), 404 unknown session or belongs to another tenant (generic — never
   *   distinguishes the two, to avoid confirming cross-tenant existence), 409 session not
   *   currently in `ACTION`.
   */
  createAction(sessionId: string, request: CreateRetroActionRequest): Observable<RetroActionResponse> {
    return this.http.post<RetroActionResponse>(`${this.apiUrl}/retro/sessions/${sessionId}/actions`, request);
  }

  /**
   * Changes an action's status (US20.3.1). No state machine enforced — every status is reachable
   * from every other one, including reopening an `ABANDONNEE` action. Not a realtime call: unlike
   * {@link createAction}, no event is broadcast anywhere — this is only ever driven from the
   * team-wide actions view (`TeamActionsComponent`), consulted outside any live session.
   *
   * See the class-level TSDoc for the current auth gap affecting this call.
   *
   * @param actionId the action's identifier
   * @param request the new status
   * @throws HttpErrorResponse 401 no/invalid token (expected today, see class TSDoc), 404 unknown
   *   action or belongs to another tenant.
   */
  updateActionStatus(actionId: string, request: UpdateRetroActionStatusRequest): Observable<RetroActionResponse> {
    return this.http.patch<RetroActionResponse>(`${this.apiUrl}/retro/actions/${actionId}`, request);
  }

  /**
   * Lists a team's retrospective actions across every session, past and present (US20.3.1) —
   * feeds `TeamActionsComponent`, the "outside any session" actions view.
   *
   * See the class-level TSDoc for the current auth gap affecting this call.
   *
   * @param teamId the team's identifier
   * @param filter optional status filter and/or due-date sort order
   * @throws HttpErrorResponse 401 no/invalid token (expected today, see class TSDoc), 403 caller
   *   not a team member, 404 team not found or belongs to another tenant.
   */
  listTeamActions(
    teamId: number,
    filter?: { status?: RetroActionStatus; sort?: RetroActionSort },
  ): Observable<RetroActionResponse[]> {
    let params = new HttpParams();
    if (filter?.status) {
      params = params.set('status', filter.status);
    }
    if (filter?.sort) {
      params = params.set('sort', filter.sort);
    }
    return this.http.get<RetroActionResponse[]>(`${this.apiUrl}/retro/teams/${teamId}/actions`, { params });
  }

  /**
   * Lists a team's currently open retrospective actions (`A_FAIRE`/`EN_COURS` only), across
   * every past session (US20.3.2) — feeds the "warm-up" panel shown when opening a retrospective
   * session, before the `CONTRIBUTION` phase's own interface is shown. Sorted by due date
   * ascending, actions with no due date last (server-side — no client-side re-sort needed).
   * Never 404s for a team the caller belongs to: 200 with an empty list when nothing is pending.
   *
   * See the class-level TSDoc for the current auth gap affecting this call.
   *
   * @param teamId the session's team, resolved from {@link RetroSessionResponse.teamId}
   * @throws HttpErrorResponse 401 no/invalid token (expected today, see class TSDoc), 404 caller
   *   not a member of `teamId` or team belongs to another tenant.
   */
  listPendingActions(teamId: number): Observable<RetroActionResponse[]> {
    return this.http.get<RetroActionResponse[]>(`${this.apiUrl}/retro/teams/${teamId}/retro/pending-actions`);
  }

  /**
   * Lists the members of a team the caller belongs to — feeds the action-owner picker (US20.3.1).
   * Calls the same, already-shipped `GET /teams/{teamId}/members` endpoint as
   * `WheelApiService.listTeamMembers` (see {@link RetroTeamMemberResponse}'s TSDoc for why this
   * is a deliberate small duplication rather than a cross-feature import).
   *
   * See the class-level TSDoc for the current auth gap affecting this call.
   *
   * @param teamId the team's identifier
   * @throws HttpErrorResponse 401 no/invalid token (expected today, see class TSDoc).
   */
  listTeamMembers(teamId: number): Observable<RetroTeamMemberResponse[]> {
    return this.http.get<RetroTeamMemberResponse[]>(`${this.apiUrl}/teams/${teamId}/members`);
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
    return this.http.get<RetroFormatsResponse>(`${this.apiUrl}/retro/formats`);
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
    return this.http.post<RetroFormatDefinition>(`${this.apiUrl}/retro/formats`, request);
  }
}

/**
 * Types for the retrospective session resource (`/retro/sessions`, US20.1.1).
 *
 * This contract is fixed and shared with the backend agent implementing
 * `pivot-agilite-core` in parallel — do not change field names/shapes here without
 * coordinating a matching backend change (see `pivot-docs`
 * `EPIC-retrospective/FEATURES/session/us-creer-retro.md`).
 */

/**
 * Retrospective format catalogue. The detailed per-format column/icon catalogue
 * (US20.2.1) is out of scope here — this US only references the enum value as-is.
 */
export type RetroFormat = 'START_STOP_CONTINUE' | 'KIF_KAF' | 'FOUR_L' | 'MAD_SAD_GLAD' | 'CUSTOM';

/** All valid {@link RetroFormat} values, in display order. */
export const RETRO_FORMATS: readonly RetroFormat[] = [
  'START_STOP_CONTINUE',
  'KIF_KAF',
  'FOUR_L',
  'MAD_SAD_GLAD',
  'CUSTOM',
];

/** Lifecycle phase of a retrospective session. */
export type RetroPhase = 'CONTRIBUTION' | 'REVUE' | 'VOTE' | 'ACTION' | 'CLOSED';

/** Request body for `POST /retro/sessions`. */
export interface CreateRetroSessionRequest {
  /** Required, 1-100 characters. */
  title: string;
  format: RetroFormat;
  /** Required — id of the team the session belongs to. */
  teamId: number;
  /** Optional, max 100 characters. */
  sprintRef?: string;
  /** Optional — must be > 0 if present. */
  contributionTimerSeconds?: number;
  /** Optional — must be > 0 if present. */
  voteTimerSeconds?: number;
  /** Optional — must be > 0 if present. */
  actionTimerSeconds?: number;
  /** Optional — must be > 0 if present. Defaults to 3 server-side. */
  voteCountPerParticipant?: number;
}

/** Response body for `POST /retro/sessions` (201 Created). */
export interface RetroSessionResponse {
  /** UUID. */
  id: string;
  title: string;
  format: string;
  teamId: number;
  facilitatorUserId: number;
  /** 6-character join code, e.g. `"A3F9K2"`. */
  joinCode: string;
  currentPhase: RetroPhase;
  contributionTimerSeconds: number | null;
  voteTimerSeconds: number | null;
  actionTimerSeconds: number | null;
  voteCountPerParticipant: number;
  sprintRef: string | null;
  /** ISO instant. */
  expiresAt: string;
  /** ISO instant. */
  createdAt: string;
}

/**
 * Response body for `GET /retro/sessions/join/{joinCode}` — the public,
 * unauthenticated join-code resolution endpoint. Intentionally minimal: no
 * `teamId`/`tenantId`, no facilitator identity, no card content.
 */
export interface RetroSessionJoinResponse {
  id: string;
  title: string;
  format: string;
  currentPhase: string;
  /** ISO instant. */
  expiresAt: string;
}

/**
 * RFC 7807 `ProblemDetail` error shape returned by `pivot-agilite-core` (Spring's
 * `ProblemDetail` with a `code` property added via `setProperties`).
 */
export interface RetroProblemDetail {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  /** Machine-readable error code, e.g. `INVALID_TITLE`, `INVALID_FORMAT`, `INVALID_TIMER`. */
  code?: string;
}

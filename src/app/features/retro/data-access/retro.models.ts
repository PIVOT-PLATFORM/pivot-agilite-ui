/**
 * Types for the retrospective session resource (`/retro/sessions`, US20.1.1).
 *
 * This contract is fixed and shared with the backend agent implementing
 * `pivot-agilite-core` in parallel — do not change field names/shapes here without
 * coordinating a matching backend change (see `pivot-docs`
 * `EPIC-retrospective/FEATURES/session/us-creer-retro.md`).
 */

/**
 * Retrospective format catalogue. The 4 system format enum values plus `'CUSTOM'` — the
 * detailed per-format column/icon catalogue (US20.2.1) lives in {@link RetroFormatDefinition}
 * / {@link RetroFormatColumn} below.
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
  /**
   * UUID of a tenant custom format (see {@link RetroFormatDefinition.key}), US20.2.1. Send
   * **only** when `format === 'CUSTOM'` — never alongside a system format value (backend
   * rejects that combination with `CUSTOM_FORMAT_ID_NOT_ALLOWED`).
   */
  customFormatId?: string;
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
  /** UUID of the tenant custom format used. Present when `format === 'CUSTOM'`, absent otherwise. */
  customFormatId?: string;
}

/**
 * A single column of a retrospective format (system or tenant custom), US20.2.1.
 */
export interface RetroFormatColumn {
  /** Stable machine key — a fixed slug (e.g. `START`) for system formats, a
   * server-generated slug for custom ones. */
  key: string;
  label: string;
  /** `null` when not set (always present for the 4 system formats; optional for custom ones). */
  color: string | null;
  description: string | null;
  icon: string | null;
}

/**
 * A retrospective format definition, as returned by `GET /retro/formats` (US20.2.1) — one of
 * the 4 fixed system formats, or a tenant-scoped custom format.
 */
export interface RetroFormatDefinition {
  /** One of the 4 {@link RetroFormat} system enum values, or a UUID for a custom format. */
  key: string;
  label: string;
  /** `true` for the 4 built-in system formats, `false` for a tenant custom format. */
  system: boolean;
  columns: RetroFormatColumn[];
}

/** Response body for `GET /retro/formats`. */
export interface RetroFormatsResponse {
  /** The 4 system formats (fixed order), followed by the caller's tenant's own custom
   * formats, if any. */
  formats: RetroFormatDefinition[];
}

/** A single column in a `POST /retro/formats` request. Only `label` is required. */
export interface CreateRetroFormatColumnRequest {
  /** Required, 1-40 characters. */
  label: string;
  color?: string;
  description?: string;
  icon?: string;
}

/** Request body for `POST /retro/formats` — creates a tenant-scoped custom format. */
export interface CreateRetroFormatRequest {
  /** Required, 1-60 characters. */
  label: string;
  /** 2 to 8 entries. */
  columns: CreateRetroFormatColumnRequest[];
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
  /**
   * Machine-readable error code, e.g. `INVALID_TITLE`, `INVALID_FORMAT`, `INVALID_TIMER`,
   * `INVALID_VOTE_COUNT` (`POST /retro/sessions`); `INVALID_FORMAT_LABEL`,
   * `CUSTOM_FORMAT_INVALID_COLUMN_COUNT`, `INVALID_COLUMN_LABEL` (`POST /retro/formats`,
   * US20.2.1); `CUSTOM_FORMAT_ID_REQUIRED`, `CUSTOM_FORMAT_NOT_FOUND` (404),
   * `CUSTOM_FORMAT_ID_NOT_ALLOWED` (`POST /retro/sessions` with a custom format, US20.2.1).
   */
  code?: string;
}

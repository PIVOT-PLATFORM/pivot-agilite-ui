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
 * Response returned by `POST /retro/sessions/{id}/participants` (US20.1.2a) — the access grant
 * needed to open the session's realtime STOMP channel ({@link RetroSessionWsService}).
 *
 * Deliberately callable without an `Authorization` header (unlike {@link
 * RetroApiService.create}/{@link RetroApiService.getById}) — mirrors US20.1.1's frictionless
 * join-by-code design: an account-less participant still gets a grant, simply never marked
 * {@link facilitator}.
 */
export interface RetroParticipantAccessResponse {
  /** Opaque token to present as the `access-token` native STOMP header on every SUBSCRIBE/SEND. */
  accessToken: string;
  ttlSeconds: number;
  /** Whether the caller was resolved as this session's facilitator (informational only). */
  facilitator: boolean;
  /** Destination to subscribe to for masked card counts / phase changes / revealed cards. */
  topicDestination: string;
  /** Facilitator-only destination (full, un-masked `CARD_ADDED`) — `null` unless {@link facilitator}. */
  facilitatorTopicDestination: string | null;
  /** Destination to SEND a new card submission to. */
  submitDestination: string;
  /** Destination to SEND a dot-vote cast to (US20.1.2b). */
  voteDestination: string;
  /** Destination to SEND a dot-vote removal to (US20.1.2b). */
  voteUncastDestination: string;
  /**
   * Destination to SEND an (empty-body) balance query to (US20.1.2b) — the answer arrives on
   * the caller's private `/user/queue/votes` as a {@link VoteBalanceEvent}.
   */
  voteBalanceDestination: string;
}

/** Payload sent over STOMP SEND to `submitDestination` to submit a new card (US20.1.2a). */
export interface SubmitCardRequest {
  content: string;
  columnKey: string;
  anonymous: boolean;
}

/**
 * `CARD_ADDED` event received on {@link RetroParticipantAccessResponse.topicDestination} —
 * masked: only a running count for the target column, never the content or card id (US20.1.2a
 * security AC — verified server-side by `RetroCardSubmissionIT`'s raw-payload inspection).
 */
export interface CardAddedMaskedEvent {
  type: 'CARD_ADDED';
  sessionId: string;
  columnKey: string;
  cardCount: number;
}

/**
 * `CARD_ADDED` event received on {@link RetroParticipantAccessResponse.facilitatorTopicDestination}
 * — full, un-masked content. Never rendered via `[innerHTML]` (US20.1.2a security AC).
 */
export interface CardAddedFacilitatorEvent {
  type: 'CARD_ADDED';
  sessionId: string;
  cardId: string;
  columnKey: string;
  content: string;
  anonymous: boolean;
}

/**
 * A single card's shape in the vote-count ranking carried by {@link PhaseChangedEvent.rankedCards}
 * (US20.1.2b), broadcast exclusively on the `VOTE` → `ACTION` transition.
 */
export interface RankedCard {
  cardId: string;
  columnKey: string;
  content: string;
  voteCount: number;
}

/**
 * `PHASE_CHANGED` event received on the regular session topic (US20.1.2a; {@link rankedCards}
 * added US20.1.2b).
 */
export interface PhaseChangedEvent {
  type: 'PHASE_CHANGED';
  sessionId: string;
  previousPhase: RetroPhase;
  currentPhase: RetroPhase;
  /** ISO instant. */
  changedAt: string;
  /**
   * Every card, ranked by vote count descending — populated only for the `VOTE` → `ACTION`
   * transition (US20.1.2b), `null` for every other phase transition.
   */
  rankedCards: RankedCard[] | null;
}

/** A single revealed card — content in clear, deliberately never authorship (US20.1.2a). */
export interface RevealedCard {
  id: string;
  content: string;
}

/** `CARDS_REVEALED` event received on the regular session topic (US20.1.2a). */
export interface CardsRevealedEvent {
  type: 'CARDS_REVEALED';
  sessionId: string;
  columns: Record<string, RevealedCard[]>;
}

/**
 * `VOTE_CAST` event received on the regular session topic whenever any participant successfully
 * casts a dot-vote (US20.1.2b). Never carries voter identity — only the card's new aggregate
 * vote count, broadcast to every participant.
 */
export interface VoteCastEvent {
  type: 'VOTE_CAST';
  sessionId: string;
  cardId: string;
  voteCount: number;
}

/**
 * `VOTE_UNCAST` event received on the regular session topic whenever any participant removes a
 * previously cast dot-vote (US20.1.2b). Symmetric with {@link VoteCastEvent} — never carries
 * voter identity.
 */
export interface VoteUncastEvent {
  type: 'VOTE_UNCAST';
  sessionId: string;
  cardId: string;
  voteCount: number;
}

/**
 * `SESSION_CLOSED` event received on the regular session topic when a session transitions to
 * its terminal `CLOSED` phase (US20.1.2c) — facilitator-triggered or timer-based, always from
 * `ACTION`. A dedicated event type, distinct from {@link PhaseChangedEvent} — see the backend
 * `SessionClosedEvent`'s JavaDoc for why: `CLOSED` is a terminal state every client must treat
 * unambiguously as "read-only from now on".
 */
export interface SessionClosedEvent {
  type: 'SESSION_CLOSED';
  sessionId: string;
  /** Always `'ACTION'` — kept explicit rather than assumed. */
  previousPhase: RetroPhase;
  /** ISO instant. */
  closedAt: string;
}

/** Discriminated union of every event type carried on the regular session topic. */
export type RetroSessionTopicEvent =
  | CardAddedMaskedEvent
  | PhaseChangedEvent
  | CardsRevealedEvent
  | VoteCastEvent
  | VoteUncastEvent
  | SessionClosedEvent;

/**
 * `VOTE_BALANCE` event received on the caller's own private `/user/queue/votes` (US20.1.2b),
 * after a cast/uncast/balance query — **never broadcast to the room topic**, the server is the
 * sole source of truth for these numbers.
 */
export interface VoteBalanceEvent {
  type: 'VOTE_BALANCE';
  sessionId: string;
  votesRemaining: number;
  votesAllowed: number;
}

/** Payload sent over STOMP SEND to cast/uncast a dot-vote (US20.1.2b) — same shape for both. */
export interface CastVoteRequest {
  cardId: string;
}

/** Response body for `POST /retro/sessions/{id}/contribution/close` (US20.1.2a). */
export interface CloseContributionResponse {
  currentPhase: RetroPhase;
}

/** Response body for `POST /retro/sessions/{id}/reveal` (US20.1.2a) — same shape as {@link CardsRevealedEvent}. */
export interface RevealResponse {
  sessionId: string;
  cardCount: number;
  columns: Record<string, RevealedCard[]>;
}

/** Response body for `POST /retro/sessions/{id}/vote/open` (US20.1.2b). */
export interface OpenVoteResponse {
  currentPhase: RetroPhase;
}

/** Response body for `POST /retro/sessions/{id}/vote/close` (US20.1.2b). */
export interface CloseVoteResponse {
  currentPhase: RetroPhase;
}

/** Response body for `POST /retro/sessions/{id}/close` (US20.1.2c). */
export interface CloseSessionResponse {
  currentPhase: RetroPhase;
}

/**
 * Request body for `POST /retro/sessions/{id}/actions` — US20.3.1's endpoint, not yet built
 * (next wave after this US). This US only provides the contextualized trigger point (AC:
 * "cette US ne réimplémente pas la persistance, elle ne fait que le déclenchement
 * contextualisé"), so this shape is provisional: built from US20.3.1's own backlog outline
 * ("titre, owner, échéance, card source optionnelle") — `title`/`sourceCardId` are populated by
 * the session room view's create-action trigger, `ownerId`/`dueDate` are not yet exposed by any
 * UI here and simply left unset. Reconcile with the real request DTO once US20.3.1 lands.
 */
export interface CreateRetroActionRequest {
  title: string;
  ownerId?: number;
  /** ISO date. */
  dueDate?: string;
  sourceCardId?: string;
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

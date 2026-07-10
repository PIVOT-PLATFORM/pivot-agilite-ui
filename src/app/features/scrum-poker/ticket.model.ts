/**
 * Types for planning poker ticket creation and voting (US09.2.1).
 *
 * This contract is fixed and shared with the backend agent implementing `pivot-agilite-core` in
 * parallel — do not change field/event names or shapes here without coordinating a matching
 * backend change (see `pivot-docs`
 * `EPIC-scrum-poker/FEATURES/votes/us-voter-ticket.md`).
 */

/** Lifecycle status of a ticket. `REVEALED` is written exclusively by US09.2.2 — never by this US. */
export type TicketStatus = 'VOTING' | 'REVEALED';

/** Request body for `POST /api/agilite/poker/rooms/{roomId}/tickets` — facilitator only. */
export interface CreateTicketRequest {
  readonly title: string;
}

/**
 * API response shape for a planning poker ticket, returned by both `POST .../tickets` and
 * `GET .../tickets/current`.
 */
export interface TicketResponse {
  readonly id: string;
  readonly roomId: string;
  readonly title: string;
  readonly status: TicketStatus;
  readonly createdAt: string;
}

/** Payload sent over STOMP SEND to `/app/agilite/poker/{roomId}/vote` to submit or change a vote. */
export interface SubmitVoteRequest {
  readonly ticketId: string;
  readonly value: string;
}

/**
 * `TICKET_CREATED` event received on the room's regular topic (`/topic/agilite/poker/{roomId}`)
 * whenever the facilitator creates a new ticket.
 */
export interface TicketCreatedEvent {
  readonly type: 'TICKET_CREATED';
  readonly roomId: string;
  readonly ticketId: string;
  readonly title: string;
  readonly createdAt: string;
}

/**
 * `VOTE_CAST` event received on the room's regular topic after every vote submission/change —
 * masked by design, for absolutely everyone including the facilitator (unlike US20.1.2a's retro
 * masking, planning poker has no facilitator-only preview channel at all): only the aggregate
 * counters, never the chosen value nor any participant identity. Proven server-side at the raw
 * STOMP frame level by `PokerVoteSubmissionIT`.
 */
export interface VoteCastEvent {
  readonly type: 'VOTE_CAST';
  readonly roomId: string;
  readonly ticketId: string;
  readonly votedCount: number;
  readonly totalParticipants: number;
}

/**
 * Consensus computed at reveal time (US09.2.2) — `mean`/`median` are derived exclusively from the
 * numeric subset of `PokerCardDeck.FIBONACCI_VALUES` (everything except `"?"`), `null` when that
 * subset is empty (all votes were `"?"`, or there were no votes at all). `majority` is derived
 * from *every* raw value (`"?"` included) and can legitimately point at a different answer than
 * `mean`/`median` — e.g. votes `["3","?","?","5"]` yields `mean: 4, median: 4, majority: "?"`.
 * `majority` is `null` only when zero votes were cast at all.
 */
export interface ConsensusResponse {
  readonly mean: number | null;
  readonly median: number | null;
  readonly majority: string | null;
}

/** Response body for `POST /api/agilite/poker/rooms/{roomId}/tickets/{ticketId}/reveal` (US09.2.2). */
export interface RevealResponse {
  readonly id: string;
  readonly roomId: string;
  readonly title: string;
  readonly status: 'REVEALED';
  readonly createdAt: string;
  readonly revealedAt: string;
  /**
   * Every cast vote's raw value, one entry per participant who voted — anonymous by design (no
   * `participantKey`/identity anywhere in this shape or the event below), order carries no
   * meaning.
   */
  readonly values: readonly string[];
  readonly consensus: ConsensusResponse;
}

/**
 * `VOTES_REVEALED` event received on the room's regular topic when the facilitator reveals the
 * current ticket (US09.2.2) — broadcast to every subscriber simultaneously, never staggered.
 * Carries the exact same `values`/`consensus` as the REST reveal response, so a participant who
 * only sees the broadcast (never called the endpoint themselves) ends up with identical state.
 */
export interface VotesRevealedEvent {
  readonly type: 'VOTES_REVEALED';
  readonly roomId: string;
  readonly ticketId: string;
  readonly values: readonly string[];
  readonly consensus: ConsensusResponse;
  readonly revealedAt: string;
}

/** Discriminated union of every event type carried on the room's regular topic. */
export type RoomTopicEvent = TicketCreatedEvent | VoteCastEvent | VotesRevealedEvent;

/**
 * RFC 7807 `ProblemDetail` error shape returned by `pivot-agilite-core` for ticket endpoints, with
 * the PIVOT-specific `code` extension property (e.g. `FACILITATOR_ONLY`, `ACTIVE_TICKET_EXISTS`,
 * `INVALID_TITLE`).
 */
export interface TicketProblemDetail {
  readonly type?: string;
  readonly title?: string;
  readonly status?: number;
  readonly detail?: string;
  readonly code?: string;
}

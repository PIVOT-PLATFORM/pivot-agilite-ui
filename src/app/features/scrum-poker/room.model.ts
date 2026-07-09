/**
 * Request body for `POST /api/agilite/poker/rooms` (US09.1.1).
 *
 * `expirationHours` is intentionally omitted from this minimal UI — the backend applies its
 * configured default (24h) when absent; the field exists server-side (1-168h) for a future US
 * to surface, not this one.
 */
export interface CreateRoomRequest {
  readonly name: string;
}

/**
 * API response shape for a planning poker room, returned by both `POST /api/agilite/poker/rooms`
 * and `GET /api/agilite/poker/rooms/{roomId}` (US09.1.1).
 */
export interface RoomResponse {
  readonly id: number;
  readonly name: string;
  readonly inviteCode: string;
  readonly sequence: string;
  readonly cardValues: readonly string[];
  readonly facilitatorUserId: number;
  readonly active: boolean;
  readonly createdAt: string;
  readonly expiresAt: string;
  /** STOMP destination this room's participants subscribe to (ADR-026 §2, US09.1.2). */
  readonly wsTopic: string;
}

/**
 * RFC 7807 Problem Detail shape returned by the backend on validation/auth failures, with the
 * PIVOT-specific `code` extension property (e.g. `INVALID_NAME`).
 */
export interface ProblemDetailResponse {
  readonly type?: string;
  readonly title?: string;
  readonly status?: number;
  readonly detail?: string;
  readonly code?: string;
}

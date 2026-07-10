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
 * PIVOT-specific `code` extension property (e.g. `INVALID_NAME`, `INVALID_CODE`).
 */
export interface ProblemDetailResponse {
  readonly type?: string;
  readonly title?: string;
  readonly status?: number;
  readonly detail?: string;
  readonly code?: string;
}

/**
 * Request body for `POST /api/agilite/poker/rooms/join` (US09.1.2). The code is uppercased
 * client-side before sending — the backend does not normalize case, and the existing
 * `InviteCodeGenerator` alphabet is uppercase-only.
 */
export interface JoinRoomRequest {
  readonly code: string;
}

/**
 * API response shape for `POST /api/agilite/poker/rooms/join` (US09.1.2).
 *
 * Note `roomId` is correctly typed as a `string` (UUID) here, unlike the pre-existing
 * `RoomResponse.id: number` from US09.1.1 — that mismatch is a known bug in the earlier
 * contract, intentionally not propagated into this one.
 */
export interface JoinRoomResponse {
  readonly roomId: string;
  readonly name: string;
  readonly sequence: string;
  readonly cardValues: readonly string[];
  readonly active: boolean;
  readonly expiresAt: string;
  /** STOMP destination to subscribe to on `/ws/agilite` once joined (ADR-026 §2). */
  readonly wsTopic: string;
  /** Opaque, room-scoped token presented on the STOMP `access-token` native header. */
  readonly accessToken: string;
}

/**
 * Request body for `POST /api/agilite/poker/rooms/join-anonymous` (US09.3.1) — joining with no
 * account and no `Authorization` header at all. `pseudonym` is optional: the backend generates
 * a default (e.g. `Invité-XXXX`) when omitted or blank.
 */
export interface AnonymousJoinRequest {
  readonly code: string;
  readonly pseudonym?: string;
}

/**
 * API response shape for `POST /api/agilite/poker/rooms/join-anonymous` (US09.3.1). Mirrors
 * {@link JoinRoomResponse} with the two fields specific to anonymous participation: `sessionId`
 * (a temporary, server-generated correlation id — never persisted anywhere) and `pseudonym` (the
 * resolved display name). `guestSessionExpiresAt` is the 2h-inactivity-capped expiry of the
 * underlying access grant — distinct from `expiresAt` (the room's own lifetime).
 */
export interface AnonymousJoinResponse {
  readonly roomId: string;
  readonly name: string;
  readonly sequence: string;
  readonly cardValues: readonly string[];
  readonly active: boolean;
  readonly expiresAt: string;
  readonly wsTopic: string;
  readonly accessToken: string;
  readonly sessionId: string;
  readonly pseudonym: string;
  readonly guestSessionExpiresAt: string;
}

/**
 * Request body for `POST /api/agilite/poker/rooms/{roomId}/guest-sessions/heartbeat` (US09.3.1)
 * — keeps an anonymous guest's 2h-inactivity session alive past its current TTL.
 */
export interface GuestHeartbeatRequest {
  readonly accessToken: string;
}

/**
 * Response body for `POST /api/agilite/poker/rooms/{roomId}/guest-sessions/heartbeat`
 * (US09.3.1).
 */
export interface GuestHeartbeatResponse {
  readonly expiresAt: string;
}

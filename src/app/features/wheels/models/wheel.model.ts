/**
 * Wire types for the wheel feature's backend contract (`pivot-agilite-core`,
 * `${environment.apiUrl}` = `/api/agilite`). See `us-creer-roue.md` (US14.1.1) for the full AC.
 */

/** Discriminates whether an entry references a team member or a free-text name. */
export type WheelEntryType = 'team_member' | 'free_text';

/** A team the caller belongs to. */
export interface TeamResponse {
  readonly id: number;
  readonly name: string;
}

/** A member of a team, resolved server-side to a display name. */
export interface TeamMemberResponse {
  readonly id: number;
  readonly userId: number;
  readonly displayName: string;
}

/**
 * A wheel entry as sent to the backend. `label` is only meaningful for `free_text` entries —
 * the backend resolves and ignores it for `team_member` entries. `weight` defaults to 1 server-side
 * when omitted.
 */
export interface WheelEntryRequest {
  type: WheelEntryType;
  teamMemberId?: number;
  label?: string;
  weight?: number;
}

/** A wheel entry as returned by the backend. */
export interface WheelEntryResponse {
  readonly id: string;
  readonly type: WheelEntryType;
  readonly teamMemberId: number | null;
  readonly label: string;
  readonly weight: number;
}

/** Payload to create a new wheel. */
export interface CreateWheelRequest {
  teamId: number;
  name: string;
  entries: WheelEntryRequest[];
}

/** Payload to replace a wheel's name and entries (teamId is immutable after creation). */
export interface UpdateWheelRequest {
  name: string;
  entries: WheelEntryRequest[];
}

/** A wheel as returned by the backend. */
export interface WheelResponse {
  readonly id: string;
  readonly name: string;
  readonly teamId: number;
  readonly tenantId: number;
  readonly entries: WheelEntryResponse[];
  readonly lastDrawnEntryId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** RFC 7807 error body returned by every `pivot-agilite-core` error response. */
export interface ProblemDetail {
  readonly title?: string;
  readonly status?: number;
  readonly detail?: string;
  readonly code?: string;
}

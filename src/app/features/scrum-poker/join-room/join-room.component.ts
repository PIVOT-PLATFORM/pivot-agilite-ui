import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnDestroy, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription, interval, switchMap } from 'rxjs';
import { RoomBoardComponent } from '../room-board/room-board.component';
import { RoomWsService } from '../room-ws.service';
import { AnonymousJoinResponse, JoinRoomResponse, ProblemDetailResponse } from '../room.model';
import { RoomService } from '../room.service';

/** Exact invite code length accepted by the backend (US09.1.1's `InviteCodeGenerator`). */
const CODE_LENGTH = 6;

/** Maximum pseudonym length accepted by the backend for anonymous participation (US09.3.1). */
const PSEUDONYM_MAX_LENGTH = 40;

/**
 * Interval between guest-session heartbeats (US09.3.1) — well under the backend's 2h-inactivity
 * cap, so a connected guest's session never lapses on its own as long as the tab stays open.
 */
const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;

/** The two ways to join a room this component supports (US09.1.2 / US09.3.1). */
export type JoinMode = 'authenticated' | 'anonymous';

/**
 * "Join a planning poker room by code" form, supporting both an authenticated join (US09.1.2)
 * and an anonymous, no-account join (US09.3.1, ADR-026 §2) via a mode toggle.
 *
 * Scope deliberately stops at "room accessible via STOMP after join" (US09.1.2's Gate 1 AC) plus
 * the anonymous join/heartbeat lifecycle (US09.3.1) — no ticket/voting UI here, that is a future
 * US. No business logic lives in this component: {@link RoomService} owns every HTTP call,
 * {@link RoomWsService} owns the STOMP lifecycle, this component only orchestrates form state,
 * the heartbeat interval, and presentation.
 */
@Component({
  selector: 'app-join-room',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslocoPipe, RoomBoardComponent],
  templateUrl: './join-room.component.html',
  styleUrl: './join-room.component.scss',
})
export class JoinRoomComponent implements OnDestroy {
  private readonly roomService = inject(RoomService);
  private readonly formBuilder = inject(FormBuilder);
  /** Injected (not wrapped) — its `status` signal is read directly from the template. */
  protected readonly roomWs = inject(RoomWsService);

  /** Which join flow is currently shown — toggled while no room is joined yet. */
  protected readonly mode = signal<JoinMode>('authenticated');

  /** Reactive form holding the room invite code (authenticated join, US09.1.2). */
  protected readonly form = this.formBuilder.nonNullable.group({
    code: ['', [Validators.required, Validators.minLength(CODE_LENGTH), Validators.maxLength(CODE_LENGTH)]],
  });

  /** Reactive form holding the invite code and optional pseudonym (anonymous join, US09.3.1). */
  protected readonly anonymousForm = this.formBuilder.nonNullable.group({
    code: ['', [Validators.required, Validators.minLength(CODE_LENGTH), Validators.maxLength(CODE_LENGTH)]],
    pseudonym: ['', [Validators.maxLength(PSEUDONYM_MAX_LENGTH)]],
  });

  /** True while the join request is in flight — disables the submit button. */
  protected readonly submitting = signal(false);

  /** True while the anonymous join request is in flight — disables its submit button. */
  protected readonly anonymousSubmitting = signal(false);

  /** i18n key of the current authenticated-join error, or `null` when there is none. */
  protected readonly errorMessageKey = signal<string | null>(null);

  /** i18n key of the current anonymous-join error, or `null` when there is none. */
  protected readonly anonymousErrorMessageKey = signal<string | null>(null);

  /** The room just joined via the authenticated flow, or `null` before a successful submission. */
  protected readonly joinedRoom = signal<JoinRoomResponse | null>(null);

  /** The room just joined anonymously, or `null` before a successful submission. */
  protected readonly joinedAnonymousRoom = signal<AnonymousJoinResponse | null>(null);

  /** Active guest-session heartbeat subscription, or `null` when no anonymous session is open. */
  private heartbeatSubscription: Subscription | null = null;

  ngOnDestroy(): void {
    this.roomWs.disconnect();
    this.stopHeartbeat();
  }

  /**
   * Switches between the authenticated and anonymous join forms — a no-op once a room has been
   * joined in either mode (the toggle is hidden by the template at that point).
   *
   * @param mode the join flow to switch to
   */
  protected switchMode(mode: JoinMode): void {
    this.mode.set(mode);
  }

  /**
   * Submits the authenticated join form. No-ops if the form is invalid or a request is already
   * in flight — marks all controls as touched so validation errors become visible. On success,
   * opens the room's STOMP connection ({@link RoomWsService.connect}) using the
   * `wsTopic`/`accessToken` from the join response.
   */
  protected onSubmit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.errorMessageKey.set(null);

    const code = this.form.getRawValue().code.trim().toUpperCase();
    this.roomService.joinRoom({ code }).subscribe({
      next: (room) => {
        this.submitting.set(false);
        this.joinedRoom.set(room);
        this.roomWs.connect(room.wsTopic, room.accessToken, room.roomId);
      },
      error: (error: HttpErrorResponse) => {
        this.submitting.set(false);
        this.errorMessageKey.set(this.resolveErrorMessageKey(error));
      },
    });
  }

  /**
   * Submits the anonymous join form (US09.3.1) — same guards as {@link onSubmit}. On success,
   * opens the room's STOMP connection exactly like the authenticated flow, then starts a
   * periodic heartbeat ({@link HEARTBEAT_INTERVAL_MS}) so the guest session never lapses while
   * this component stays open.
   */
  protected onSubmitAnonymous(): void {
    if (this.anonymousForm.invalid || this.anonymousSubmitting()) {
      this.anonymousForm.markAllAsTouched();
      return;
    }

    this.anonymousSubmitting.set(true);
    this.anonymousErrorMessageKey.set(null);

    const { code, pseudonym } = this.anonymousForm.getRawValue();
    const trimmedPseudonym = pseudonym.trim();
    this.roomService
      .joinAnonymous({
        code: code.trim().toUpperCase(),
        ...(trimmedPseudonym ? { pseudonym: trimmedPseudonym } : {}),
      })
      .subscribe({
        next: (room) => {
          this.anonymousSubmitting.set(false);
          this.joinedAnonymousRoom.set(room);
          this.roomWs.connect(room.wsTopic, room.accessToken, room.roomId);
          this.startHeartbeat(room);
        },
        error: (error: HttpErrorResponse) => {
          this.anonymousSubmitting.set(false);
          this.anonymousErrorMessageKey.set(this.resolveAnonymousErrorMessageKey(error));
        },
      });
  }

  /**
   * Resets the view so the user can try joining another room (authenticated flow).
   */
  protected joinAnother(): void {
    this.roomWs.disconnect();
    this.joinedRoom.set(null);
    this.form.reset();
  }

  /**
   * Resets the view so the user can try joining another room anonymously — also tears down the
   * heartbeat interval alongside the STOMP connection.
   */
  protected joinAnotherAnonymous(): void {
    this.roomWs.disconnect();
    this.stopHeartbeat();
    this.joinedAnonymousRoom.set(null);
    this.anonymousForm.reset();
  }

  /**
   * Starts the periodic guest-session heartbeat (US09.3.1). If a heartbeat call ever fails
   * (e.g. HTTP 410 — the session expired mid-use), the STOMP connection is torn down and the
   * view falls back to the join form with an explicit error — never a silent failure.
   *
   * @param room the just-joined anonymous room, carrying the `roomId`/`accessToken` to refresh
   */
  private startHeartbeat(room: AnonymousJoinResponse): void {
    this.stopHeartbeat();
    this.heartbeatSubscription = interval(HEARTBEAT_INTERVAL_MS)
      .pipe(switchMap(() => this.roomService.guestHeartbeat(room.roomId, { accessToken: room.accessToken })))
      .subscribe({
        error: () => {
          this.roomWs.disconnect();
          this.joinedAnonymousRoom.set(null);
          this.anonymousErrorMessageKey.set('scrumPoker.joinRoom.errors.sessionExpired');
        },
      });
  }

  /** Unsubscribes the active heartbeat interval, if any — safe to call repeatedly. */
  private stopHeartbeat(): void {
    this.heartbeatSubscription?.unsubscribe();
    this.heartbeatSubscription = null;
  }

  /**
   * Maps an HTTP error from the authenticated join to an i18n key, without leaking raw backend
   * error text to the UI. A 404 is deliberately generic (unknown/expired/cross-tenant codes are
   * indistinguishable server-side — see `room.model.ts` / the backend contract, not
   * re-litigated here).
   *
   * @param error the HTTP error response
   * @returns the i18n key describing the error
   */
  private resolveErrorMessageKey(error: HttpErrorResponse): string {
    if (error.status === 401) {
      return 'scrumPoker.joinRoom.errors.unauthorized';
    }
    if (error.status === 404) {
      return 'scrumPoker.joinRoom.errors.notFound';
    }
    if (error.status === 400) {
      const body = error.error as ProblemDetailResponse | null;
      if (body?.code === 'INVALID_CODE') {
        return 'scrumPoker.joinRoom.errors.invalidCode';
      }
      return 'scrumPoker.joinRoom.errors.invalidRequest';
    }
    return 'scrumPoker.joinRoom.errors.generic';
  }

  /**
   * Maps an HTTP error from the anonymous join to an i18n key (US09.3.1). Unlike {@link
   * resolveErrorMessageKey}, there is no 401 branch — this endpoint accepts no bearer token at
   * all, so the backend never rejects it for that reason.
   *
   * @param error the HTTP error response
   * @returns the i18n key describing the error
   */
  private resolveAnonymousErrorMessageKey(error: HttpErrorResponse): string {
    if (error.status === 404) {
      return 'scrumPoker.joinRoom.errors.notFound';
    }
    if (error.status === 400) {
      const body = error.error as ProblemDetailResponse | null;
      if (body?.code === 'INVALID_CODE') {
        return 'scrumPoker.joinRoom.errors.invalidCode';
      }
      if (body?.code === 'INVALID_PSEUDONYM') {
        return 'scrumPoker.joinRoom.errors.invalidPseudonym';
      }
      return 'scrumPoker.joinRoom.errors.invalidRequest';
    }
    return 'scrumPoker.joinRoom.errors.generic';
  }
}

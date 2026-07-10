import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnDestroy, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { JoinRoomResponse, ProblemDetailResponse } from '../room.model';
import { RoomWsService } from '../room-ws.service';
import { RoomService } from '../room.service';

/** Exact invite code length accepted by the backend (US09.1.1's `InviteCodeGenerator`). */
const CODE_LENGTH = 6;

/**
 * Minimal "join a planning poker room by code" form (US09.1.2): a single code field, a submit
 * button, and — once the join succeeds — the room's STOMP connection status.
 *
 * Scope deliberately stops at "room accessible via STOMP after join" (this US's Gate 1 AC) —
 * no ticket/voting UI here, that is a future US. No business logic lives in this component:
 * {@link RoomService} owns the HTTP call, {@link RoomWsService} owns the STOMP lifecycle, this
 * component only orchestrates form state and presentation.
 */
@Component({
  selector: 'app-join-room',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslocoPipe],
  templateUrl: './join-room.component.html',
  styleUrl: './join-room.component.scss',
})
export class JoinRoomComponent implements OnDestroy {
  private readonly roomService = inject(RoomService);
  private readonly formBuilder = inject(FormBuilder);
  /** Injected (not wrapped) — its `status` signal is read directly from the template. */
  protected readonly roomWs = inject(RoomWsService);

  /** Reactive form holding the room invite code. */
  protected readonly form = this.formBuilder.nonNullable.group({
    code: ['', [Validators.required, Validators.minLength(CODE_LENGTH), Validators.maxLength(CODE_LENGTH)]],
  });

  /** True while the join request is in flight — disables the submit button. */
  protected readonly submitting = signal(false);

  /** i18n key of the current error, or `null` when there is none. */
  protected readonly errorMessageKey = signal<string | null>(null);

  /** The room just joined, or `null` before the first successful submission. */
  protected readonly joinedRoom = signal<JoinRoomResponse | null>(null);

  ngOnDestroy(): void {
    this.roomWs.disconnect();
  }

  /**
   * Submits the form. No-ops if the form is invalid or a request is already in flight —
   * marks all controls as touched so validation errors become visible. On success, opens the
   * room's STOMP connection ({@link RoomWsService.connect}) using the `wsTopic`/`accessToken`
   * from the join response.
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
        this.roomWs.connect(room.wsTopic, room.accessToken);
      },
      error: (error: HttpErrorResponse) => {
        this.submitting.set(false);
        this.errorMessageKey.set(this.resolveErrorMessageKey(error));
      },
    });
  }

  /**
   * Resets the view so the user can try joining another room.
   */
  protected joinAnother(): void {
    this.roomWs.disconnect();
    this.joinedRoom.set(null);
    this.form.reset();
  }

  /**
   * Maps an HTTP error to an i18n key, without leaking raw backend error text to the UI.
   * A 404 is deliberately generic (unknown/expired/cross-tenant codes are indistinguishable
   * server-side — see `room.model.ts` / the backend contract, not re-litigated here).
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
}

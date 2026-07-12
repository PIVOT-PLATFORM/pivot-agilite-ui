import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnDestroy, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { ProblemDetailResponse, RoomResponse } from '../room.model';
import { RoomBoardComponent } from '../room-board/room-board.component';
import { RoomWsService } from '../room-ws.service';
import { RoomService } from '../room.service';

/** Maximum room name length accepted by the backend (US09.1.1). */
const NAME_MAX_LENGTH = 120;

/**
 * Minimal planning poker room creation form (US09.1.1): a name field, a submit button, and —
 * once created — the generated invite code with a copy-to-clipboard action, plus (US09.2.1) the
 * realtime ticket/voting board, since the facilitator now opens their own STOMP connection right
 * after creation (see {@link RoomResponse.accessToken}'s Javadoc for the Gate 1 fix this relies
 * on).
 *
 * No business logic lives here — {@link RoomService} owns the HTTP call, {@link RoomWsService}
 * owns the STOMP lifecycle, this component only orchestrates form state and presentation.
 */
@Component({
  selector: 'app-create-room',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslocoPipe, RoomBoardComponent],
  templateUrl: './create-room.component.html',
  styleUrl: './create-room.component.scss',
})
export class CreateRoomComponent implements OnDestroy {
  private readonly roomService = inject(RoomService);
  private readonly formBuilder = inject(FormBuilder);
  /** Injected (not wrapped) — its `status` signal is read directly from the template. */
  protected readonly roomWs = inject(RoomWsService);

  /** Reactive form holding the room name. */
  protected readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(NAME_MAX_LENGTH)]],
  });

  /** True while the creation request is in flight — disables the submit button. */
  protected readonly submitting = signal(false);

  /** i18n key of the current error, or `null` when there is none. */
  protected readonly errorMessageKey = signal<string | null>(null);

  /** The room just created, or `null` before the first successful submission. */
  protected readonly createdRoom = signal<RoomResponse | null>(null);

  /** i18n key of the clipboard-copy confirmation announcement, or `null`. */
  protected readonly copyAnnouncementKey = signal<string | null>(null);

  ngOnDestroy(): void {
    this.roomWs.disconnect();
  }

  /**
   * Submits the form. No-ops if the form is invalid or a request is already in flight —
   * marks all controls as touched so validation errors become visible. On success, opens the
   * room's STOMP connection ({@link RoomWsService.connect}) using the response's own
   * `wsTopic`/`accessToken` (US09.2.1) — the facilitator's own board (tickets/votes) works
   * without a separate join-by-code round trip.
   */
  protected onSubmit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.errorMessageKey.set(null);

    const name = this.form.getRawValue().name.trim();
    this.roomService.createRoom({ name }).subscribe({
      next: (room) => {
        this.submitting.set(false);
        this.createdRoom.set(room);
        this.form.reset();
        if (room.accessToken) {
          this.roomWs.connect(room.wsTopic, room.accessToken, room.id.toString());
        }
      },
      error: (error: HttpErrorResponse) => {
        this.submitting.set(false);
        this.errorMessageKey.set(this.resolveErrorMessageKey(error));
      },
    });
  }

  /**
   * Resets the success view so the facilitator can create another room.
   */
  protected createAnother(): void {
    this.roomWs.disconnect();
    this.createdRoom.set(null);
    this.copyAnnouncementKey.set(null);
  }

  /**
   * Copies the created room's invite code to the clipboard and announces the result for screen
   * reader users via {@link copyAnnouncementKey}.
   */
  protected copyInviteCode(): void {
    const room = this.createdRoom();
    if (!room) {
      return;
    }
    navigator.clipboard
      .writeText(room.inviteCode)
      .then(() => this.copyAnnouncementKey.set('scrumPoker.createRoom.copySuccess'))
      .catch(() => this.copyAnnouncementKey.set('scrumPoker.createRoom.copyError'));
  }

  /**
   * Maps an HTTP error to an i18n key, without leaking raw backend error text to the UI.
   *
   * @param error the HTTP error response
   * @returns the i18n key describing the error
   */
  private resolveErrorMessageKey(error: HttpErrorResponse): string {
    if (error.status === 401) {
      return 'scrumPoker.createRoom.errors.unauthorized';
    }
    if (error.status === 400) {
      const body = error.error as ProblemDetailResponse | null;
      if (body?.code === 'INVALID_NAME') {
        return 'scrumPoker.createRoom.errors.invalidName';
      }
      return 'scrumPoker.createRoom.errors.invalidRequest';
    }
    return 'scrumPoker.createRoom.errors.generic';
  }
}

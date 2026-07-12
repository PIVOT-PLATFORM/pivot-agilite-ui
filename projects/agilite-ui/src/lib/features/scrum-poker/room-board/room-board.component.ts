import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { RoomWsService } from '../room-ws.service';
import { ConsensusResponse, RoomTopicEvent, TicketProblemDetail, TicketResponse } from '../ticket.model';
import { TicketService } from '../ticket.service';

/** Maximum ticket title length accepted by the backend (US09.2.1). */
const TITLE_MAX_LENGTH = 200;

/**
 * Realtime planning poker "board" (US09.2.1): facilitator-only ticket creation, the fixed
 * Fibonacci deck as clickable cards, and a live masked "X/Y have voted" counter.
 *
 * Mounted by both {@link CreateRoomComponent} (facilitator) and {@link JoinRoomComponent}
 * (authenticated participant and anonymous guest, US09.1.2/US09.3.1) once each has already
 * opened the room's STOMP connection via {@link RoomWsService} — this component never connects
 * or disconnects the socket itself, only subscribes to {@link RoomWsService.messages$} and calls
 * {@link RoomWsService.submitVote}. No business logic beyond orchestration: {@link TicketService}
 * owns every HTTP call.
 *
 * **Masked-until-reveal (AC):** {@link votedCount}/{@link totalParticipants} are the only
 * server-driven state derived from `VOTE_CAST` events — {@link selectedValue} (the participant's
 * own highlighted card) is purely local UI state, never derived from anything the server sends
 * back; the server never echoes a chosen value to anyone, proven server-side by
 * `PokerVoteSubmissionIT`'s raw-payload inspection.
 *
 * Since US09.2.2, also handles **revealing** the current ticket (facilitator only, at any point
 * while `VOTING` — no completeness gate) and rendering the resulting anonymous `values`/
 * `consensus` (mean/median over the numeric subset, majority over every raw value including
 * `"?"`), applied identically whether it arrives via the REST response or the `VOTES_REVEALED`
 * broadcast.
 */
@Component({
  selector: 'app-room-board',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslocoPipe],
  templateUrl: './room-board.component.html',
  styleUrl: './room-board.component.scss',
})
export class RoomBoardComponent implements OnInit {
  private readonly ticketService = inject(TicketService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formBuilder = inject(FormBuilder);
  /** Injected (not wrapped) — already connected by the parent (create-room/join-room). */
  protected readonly roomWs = inject(RoomWsService);

  /** The room this board belongs to. */
  readonly roomId = input.required<string>();

  /** The room's fixed Fibonacci card values (from the create/join response — never re-derived). */
  readonly cardValues = input.required<readonly string[]>();

  /** Whether the caller is this room's facilitator — gates the ticket-creation form. */
  readonly isFacilitator = input(false);

  /** The room's currently open ticket, or `null` before the first one is created. */
  protected readonly currentTicket = signal<TicketResponse | null>(null);

  /** Masked vote count for the current ticket — never a card value. */
  protected readonly votedCount = signal(0);

  /** Total participants currently registered in the room. */
  protected readonly totalParticipants = signal(0);

  /** The caller's own selected card — purely local state, never sent back by the server. */
  protected readonly selectedValue = signal<string | null>(null);

  /** Reactive form holding the new ticket's title (facilitator only). */
  protected readonly titleForm = this.formBuilder.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(TITLE_MAX_LENGTH)]],
  });

  /** True while a ticket-creation request is in flight — disables the submit button. */
  protected readonly creatingTicket = signal(false);

  /** i18n key of the current ticket-creation error, or `null` when there is none. */
  protected readonly createTicketErrorKey = signal<string | null>(null);

  /** Every cast vote's raw value once the current ticket has been revealed (US09.2.2), else `null`. */
  protected readonly revealedValues = signal<readonly string[] | null>(null);

  /** The computed consensus once the current ticket has been revealed (US09.2.2), else `null`. */
  protected readonly consensus = signal<ConsensusResponse | null>(null);

  /** True while a reveal request is in flight — disables the reveal button. */
  protected readonly revealing = signal(false);

  /** i18n key of the current reveal error, or `null` when there is none. */
  protected readonly revealErrorKey = signal<string | null>(null);

  ngOnInit(): void {
    this.roomWs.messages$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(body => this.onMessage(body));
    this.loadCurrentTicket();
  }

  /**
   * Creates a new ticket (facilitator only). No-ops if the form is invalid or a request is
   * already in flight.
   */
  protected createTicket(): void {
    if (this.titleForm.invalid || this.creatingTicket()) {
      this.titleForm.markAllAsTouched();
      return;
    }

    this.creatingTicket.set(true);
    this.createTicketErrorKey.set(null);

    const title = this.titleForm.getRawValue().title.trim();
    this.ticketService.createTicket(this.roomId(), { title }).subscribe({
      next: ticket => {
        this.creatingTicket.set(false);
        this.applyNewTicket(ticket);
        this.titleForm.reset();
      },
      error: (error: HttpErrorResponse) => {
        this.creatingTicket.set(false);
        this.createTicketErrorKey.set(this.resolveCreateErrorKey(error));
      },
    });
  }

  /**
   * Selects (or changes to) a card for the current ticket — highlights it locally and submits
   * the vote over STOMP. No-ops if no ticket is currently open.
   *
   * @param value the chosen card value
   */
  protected selectCard(value: string): void {
    const ticket = this.currentTicket();
    if (!ticket || ticket.status !== 'VOTING') {
      return;
    }
    this.selectedValue.set(value);
    this.roomWs.submitVote({ ticketId: ticket.id, value });
  }

  /**
   * Reveals the current ticket's votes (facilitator only) — permitted at any point while the
   * ticket is `VOTING`, regardless of {@link votedCount}/{@link totalParticipants} (no
   * completeness gate, US09.2.2 AC). No-ops if no ticket is active or a request is already in
   * flight.
   */
  protected revealVotes(): void {
    const ticket = this.currentTicket();
    if (!ticket || ticket.status !== 'VOTING' || this.revealing()) {
      return;
    }

    this.revealing.set(true);
    this.revealErrorKey.set(null);

    this.ticketService.revealTicket(this.roomId(), ticket.id).subscribe({
      next: reveal => {
        this.revealing.set(false);
        this.applyReveal(reveal.id, reveal.status, reveal.values, reveal.consensus);
      },
      error: (error: HttpErrorResponse) => {
        this.revealing.set(false);
        this.revealErrorKey.set(this.resolveRevealErrorKey(error));
      },
    });
  }

  /** The masked "X/Y have voted" pair, for the template's parameterized translation. */
  protected counterParams(): { voted: number; total: number } {
    return { voted: this.votedCount(), total: this.totalParticipants() };
  }

  private loadCurrentTicket(): void {
    this.ticketService.getCurrentTicket(this.roomId()).subscribe({
      next: ticket => {
        if (ticket) {
          this.applyNewTicket(ticket);
        }
      },
      // Best-effort: an account-less guest without a resolvable bearer token (US09.3.1) simply
      // waits for the next TICKET_CREATED broadcast instead — never a blocking error.
      error: () => undefined,
    });
  }

  private applyNewTicket(ticket: TicketResponse): void {
    this.currentTicket.set(ticket);
    this.votedCount.set(0);
    this.selectedValue.set(null);
    this.revealedValues.set(null);
    this.consensus.set(null);
    this.revealErrorKey.set(null);
  }

  /**
   * Applies a revealed-votes state — called both from the REST reveal response and from the
   * `VOTES_REVEALED` broadcast, idempotently (setting the same values twice, e.g. once from each
   * source for the facilitator's own reveal, is harmless).
   *
   * @param ticketId  the revealed ticket's id — ignored if it does not match the currently
   *                  displayed ticket (a stale/out-of-order event)
   * @param status    the ticket's new status, always `"REVEALED"`
   * @param values    every cast vote's raw value, anonymous
   * @param consensus the computed consensus
   */
  private applyReveal(
    ticketId: string,
    status: TicketResponse['status'],
    values: readonly string[],
    consensus: ConsensusResponse,
  ): void {
    const ticket = this.currentTicket();
    if (!ticket || ticket.id !== ticketId) {
      return;
    }
    this.currentTicket.set({ ...ticket, status });
    this.revealedValues.set(values);
    this.consensus.set(consensus);
  }

  private onMessage(body: string): void {
    let event: RoomTopicEvent;
    try {
      event = JSON.parse(body) as RoomTopicEvent;
    } catch {
      return;
    }
    switch (event.type) {
      case 'TICKET_CREATED':
        this.applyNewTicket({
          id: event.ticketId,
          roomId: event.roomId,
          title: event.title,
          status: 'VOTING',
          createdAt: event.createdAt,
        });
        break;
      case 'VOTE_CAST':
        this.votedCount.set(event.votedCount);
        this.totalParticipants.set(event.totalParticipants);
        break;
      case 'VOTES_REVEALED':
        this.applyReveal(event.ticketId, 'REVEALED', event.values, event.consensus);
        break;
    }
  }

  /**
   * Maps a ticket-creation HTTP error to an i18n key, without leaking raw backend error text.
   *
   * @param error the HTTP error response
   * @returns the i18n key describing the error
   */
  private resolveCreateErrorKey(error: HttpErrorResponse): string {
    if (error.status === 403) {
      return 'scrumPoker.roomBoard.errors.facilitatorOnly';
    }
    if (error.status === 409) {
      return 'scrumPoker.roomBoard.errors.activeTicketExists';
    }
    if (error.status === 400) {
      const body = error.error as TicketProblemDetail | null;
      if (body?.code === 'INVALID_TITLE') {
        return 'scrumPoker.roomBoard.errors.invalidTitle';
      }
      return 'scrumPoker.roomBoard.errors.invalidRequest';
    }
    return 'scrumPoker.roomBoard.errors.generic';
  }

  /**
   * Maps a reveal HTTP error to an i18n key, without leaking raw backend error text.
   *
   * @param error the HTTP error response
   * @returns the i18n key describing the error
   */
  private resolveRevealErrorKey(error: HttpErrorResponse): string {
    if (error.status === 403) {
      return 'scrumPoker.roomBoard.errors.facilitatorOnly';
    }
    if (error.status === 404) {
      return 'scrumPoker.roomBoard.errors.ticketNotFound';
    }
    if (error.status === 409) {
      return 'scrumPoker.roomBoard.errors.ticketAlreadyRevealed';
    }
    return 'scrumPoker.roomBoard.errors.generic';
  }
}

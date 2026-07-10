import { HttpErrorResponse } from '@angular/common/http';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Subject, of, throwError } from 'rxjs';
import { RoomWsService } from '../room-ws.service';
import { ConsensusResponse, RevealResponse, TicketResponse } from '../ticket.model';
import { TicketService } from '../ticket.service';
import { RoomBoardComponent } from './room-board.component';

const ROOM_ID = '9f4e6b1a-6c3d-4b8e-8f2a-1234567890ab';
const CARD_VALUES = ['0', '1', '2', '3', '5', '8', '13', '21', '34', '55', '89', '?'];

const mockTicket: TicketResponse = {
  id: 'ticket-1',
  roomId: ROOM_ID,
  title: 'Estimate JIRA-123',
  status: 'VOTING',
  createdAt: '2026-07-10T10:00:00Z',
};

type BoardHarness = {
  titleForm: { controls: { title: { setValue: (v: string) => void } } };
  createTicket: () => void;
  createTicketErrorKey: () => string | null;
  currentTicket: () => TicketResponse | null;
  votedCount: () => number;
  totalParticipants: () => number;
  selectedValue: () => string | null;
  selectCard: (value: string) => void;
  revealVotes: () => void;
  revealing: () => boolean;
  revealErrorKey: () => string | null;
  revealedValues: () => readonly string[] | null;
  consensus: () => ConsensusResponse | null;
};

/** Host component so `roomId`/`cardValues`/`isFacilitator` inputs can be exercised. */
@Component({
  standalone: true,
  imports: [RoomBoardComponent],
  template: `<app-room-board [roomId]="roomId" [cardValues]="cardValues" [isFacilitator]="isFacilitator" />`,
})
class HostComponent {
  roomId = ROOM_ID;
  cardValues: readonly string[] = CARD_VALUES;
  isFacilitator = false;
}

describe('RoomBoardComponent', () => {
  let createTicketSpy: ReturnType<typeof vi.fn>;
  let getCurrentTicketSpy: ReturnType<typeof vi.fn>;
  let revealTicketSpy: ReturnType<typeof vi.fn>;
  let submitVoteSpy: ReturnType<typeof vi.fn>;
  let messages$: Subject<string>;

  const mockReveal: RevealResponse = {
    id: 'ticket-1',
    roomId: ROOM_ID,
    title: 'Estimate JIRA-123',
    status: 'REVEALED',
    createdAt: '2026-07-10T10:00:00Z',
    revealedAt: '2026-07-10T10:05:00Z',
    values: ['5', '8', '5'],
    consensus: { mean: 6, median: 5, majority: '5' },
  };

  beforeEach(async () => {
    createTicketSpy = vi.fn().mockReturnValue(of(mockTicket));
    getCurrentTicketSpy = vi.fn().mockReturnValue(of(null));
    revealTicketSpy = vi.fn().mockReturnValue(of(mockReveal));
    submitVoteSpy = vi.fn();
    messages$ = new Subject<string>();

    await TestBed.configureTestingModule({
      imports: [HostComponent, TranslocoTestingModule.forRoot({ langs: { fr: {}, en: {} } })],
      providers: [
        {
          provide: TicketService,
          useValue: { createTicket: createTicketSpy, getCurrentTicket: getCurrentTicketSpy, revealTicket: revealTicketSpy },
        },
        { provide: RoomWsService, useValue: { messages$, submitVote: submitVoteSpy } },
      ],
    }).compileComponents();
  });

  /**
   * Creates the host fixture, applying `configure` (e.g. setting `isFacilitator`) *before* the
   * first `detectChanges()` — required for the `RoomBoardComponent`'s signal `input()`s to carry
   * the intended value from the very first render, rather than mutating the host afterwards.
   */
  function createHost(configure?: (host: HostComponent) => void) {
    const fixture = TestBed.createComponent(HostComponent);
    configure?.(fixture.componentInstance);
    fixture.detectChanges();
    return fixture;
  }

  function board(fixture: ReturnType<typeof createHost>): BoardHarness {
    return fixture.debugElement.children[0].componentInstance as unknown as BoardHarness;
  }

  it('should create', () => {
    const fixture = createHost();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('fetches the current ticket on init', () => {
    createHost();
    expect(getCurrentTicketSpy).toHaveBeenCalledWith(ROOM_ID);
  });

  // ── Facilitator-only ticket creation form ──

  it('shows the create-ticket form to the facilitator when no ticket is active', () => {
    const fixture = createHost(host => (host.isFacilitator = true));

    expect(fixture.nativeElement.querySelector('#ticket-title')).not.toBeNull();
  });

  it('never shows the create-ticket form to a non-facilitator', () => {
    const fixture = createHost(host => (host.isFacilitator = false));

    expect(fixture.nativeElement.querySelector('#ticket-title')).toBeNull();
  });

  it('hides the create-ticket form once a ticket is already active, even for the facilitator', () => {
    getCurrentTicketSpy.mockReturnValue(of(mockTicket));
    const fixture = createHost(host => (host.isFacilitator = true));

    expect(fixture.nativeElement.querySelector('#ticket-title')).toBeNull();
  });

  it('does not submit a blank ticket title', () => {
    const fixture = createHost(host => (host.isFacilitator = true));

    board(fixture).createTicket();
    fixture.detectChanges();

    expect(createTicketSpy).not.toHaveBeenCalled();
  });

  it('creates a ticket with the trimmed title and displays it', () => {
    const fixture = createHost(host => (host.isFacilitator = true));
    const b = board(fixture);

    b.titleForm.controls.title.setValue('  Estimate JIRA-123  ');
    b.createTicket();
    fixture.detectChanges();

    expect(createTicketSpy).toHaveBeenCalledWith(ROOM_ID, { title: 'Estimate JIRA-123' });
    expect(b.currentTicket()).toEqual(mockTicket);
  });

  it('maps a 403 response to the facilitator-only error key', () => {
    createTicketSpy.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
    const fixture = createHost(host => (host.isFacilitator = true));
    const b = board(fixture);

    b.titleForm.controls.title.setValue('Title');
    b.createTicket();
    fixture.detectChanges();

    expect(b.createTicketErrorKey()).toBe('scrumPoker.roomBoard.errors.facilitatorOnly');
  });

  it('maps a 409 response to the active-ticket-exists error key', () => {
    createTicketSpy.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409 })));
    const fixture = createHost(host => (host.isFacilitator = true));
    const b = board(fixture);

    b.titleForm.controls.title.setValue('Title');
    b.createTicket();
    fixture.detectChanges();

    expect(b.createTicketErrorKey()).toBe('scrumPoker.roomBoard.errors.activeTicketExists');
  });

  it('maps a 400 INVALID_TITLE response to the invalid-title error key', () => {
    createTicketSpy.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 400, error: { code: 'INVALID_TITLE' } })),
    );
    const fixture = createHost(host => (host.isFacilitator = true));
    const b = board(fixture);

    b.titleForm.controls.title.setValue('Title');
    b.createTicket();
    fixture.detectChanges();

    expect(b.createTicketErrorKey()).toBe('scrumPoker.roomBoard.errors.invalidTitle');
  });

  // ── Voting ──

  it('shows the waiting message to a non-facilitator when no ticket is active yet', () => {
    const fixture = createHost(host => (host.isFacilitator = false));

    expect(fixture.nativeElement.querySelector('.room-board__waiting')).not.toBeNull();
  });

  it('renders a clickable card per cardValues() once a ticket is active', () => {
    getCurrentTicketSpy.mockReturnValue(of(mockTicket));
    const fixture = createHost();

    const cards = fixture.nativeElement.querySelectorAll('.room-board__card');
    expect(cards).toHaveLength(CARD_VALUES.length);
  });

  it('selectCard() highlights the chosen card locally and submits the vote over STOMP', () => {
    getCurrentTicketSpy.mockReturnValue(of(mockTicket));
    const fixture = createHost();
    const b = board(fixture);

    b.selectCard('5');
    fixture.detectChanges();

    expect(b.selectedValue()).toBe('5');
    expect(submitVoteSpy).toHaveBeenCalledWith({ ticketId: 'ticket-1', value: '5' });
    const selectedButton = fixture.nativeElement.querySelector('.room-board__card--selected');
    expect(selectedButton?.textContent?.trim()).toBe('5');
    expect(selectedButton?.getAttribute('aria-pressed')).toBe('true');
  });

  it('selectCard() a second time changes the local selection and re-submits the new value', () => {
    getCurrentTicketSpy.mockReturnValue(of(mockTicket));
    const fixture = createHost();
    const b = board(fixture);

    b.selectCard('5');
    b.selectCard('8');
    fixture.detectChanges();

    expect(b.selectedValue()).toBe('8');
    expect(submitVoteSpy).toHaveBeenNthCalledWith(2, { ticketId: 'ticket-1', value: '8' });
  });

  it('selectCard() no-ops when no ticket is currently active', () => {
    const fixture = createHost();

    board(fixture).selectCard('5');

    expect(submitVoteSpy).not.toHaveBeenCalled();
  });

  // ── Realtime events (messages$) ──

  it('applies a TICKET_CREATED event: shows the new ticket, resets the counter and any prior selection', () => {
    const fixture = createHost();
    const b = board(fixture);

    messages$.next(
      JSON.stringify({
        type: 'TICKET_CREATED',
        roomId: ROOM_ID,
        ticketId: 'ticket-2',
        title: 'New ticket',
        createdAt: '2026-07-10T11:00:00Z',
      }),
    );
    fixture.detectChanges();

    expect(b.currentTicket()).toEqual({
      id: 'ticket-2',
      roomId: ROOM_ID,
      title: 'New ticket',
      status: 'VOTING',
      createdAt: '2026-07-10T11:00:00Z',
    });
    expect(b.votedCount()).toBe(0);
    expect(b.selectedValue()).toBeNull();
  });

  it('applies a VOTE_CAST event: updates the masked counters, never a card value', () => {
    getCurrentTicketSpy.mockReturnValue(of(mockTicket));
    const fixture = createHost();
    const b = board(fixture);

    messages$.next(
      JSON.stringify({ type: 'VOTE_CAST', roomId: ROOM_ID, ticketId: 'ticket-1', votedCount: 2, totalParticipants: 4 }),
    );
    fixture.detectChanges();

    // Asserted against the component's own signals (not the translated DOM text — the test
    // TranslocoTestingModule config provides empty translation maps, so the rendered text is
    // just the raw i18n key, not an interpolated string): the masked counter's aggregate numbers
    // are correctly derived from VOTE_CAST, and the region is aria-live for screen readers.
    expect(b.votedCount()).toBe(2);
    expect(b.totalParticipants()).toBe(4);
    const counter = fixture.nativeElement.querySelector('.room-board__counter');
    expect(counter?.getAttribute('aria-live')).toBe('polite');
  });

  it('ignores a malformed message body without throwing', () => {
    const fixture = createHost();

    expect(() => {
      messages$.next('not json');
      fixture.detectChanges();
    }).not.toThrow();
  });

  it('ignores getCurrentTicket() errors (e.g. account-less guest with no bearer token) without blocking the board', () => {
    getCurrentTicketSpy.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 401 })));

    expect(() => createHost()).not.toThrow();
  });

  // ── Revealing (US09.2.2) ──

  it('shows the reveal button to the facilitator once a ticket is active, regardless of votedCount', () => {
    getCurrentTicketSpy.mockReturnValue(of(mockTicket));
    const fixture = createHost(host => (host.isFacilitator = true));

    expect(fixture.nativeElement.querySelector('.room-board__reveal')).not.toBeNull();
  });

  it('never shows the reveal button to a non-facilitator participant', () => {
    getCurrentTicketSpy.mockReturnValue(of(mockTicket));
    const fixture = createHost(host => (host.isFacilitator = false));

    expect(fixture.nativeElement.querySelector('.room-board__reveal')).toBeNull();
  });

  it('hides the reveal button once the ticket has already been revealed', () => {
    getCurrentTicketSpy.mockReturnValue(of({ ...mockTicket, status: 'REVEALED' as const }));
    const fixture = createHost(host => (host.isFacilitator = true));

    expect(fixture.nativeElement.querySelector('.room-board__reveal')).toBeNull();
  });

  it('revealVotes() calls the service and applies the revealed state (values + consensus)', () => {
    getCurrentTicketSpy.mockReturnValue(of(mockTicket));
    const fixture = createHost(host => (host.isFacilitator = true));
    const b = board(fixture);

    b.revealVotes();
    fixture.detectChanges();

    expect(revealTicketSpy).toHaveBeenCalledWith(ROOM_ID, 'ticket-1');
    expect(b.currentTicket()?.status).toBe('REVEALED');
    expect(b.revealedValues()).toEqual(['5', '8', '5']);
    expect(b.consensus()).toEqual({ mean: 6, median: 5, majority: '5' });
    expect(b.revealing()).toBe(false);
  });

  it('revealVotes() no-ops when no ticket is active', () => {
    const fixture = createHost(host => (host.isFacilitator = true));

    board(fixture).revealVotes();

    expect(revealTicketSpy).not.toHaveBeenCalled();
  });

  it('a VOTES_REVEALED broadcast applies the same revealed state for a non-facilitator participant', () => {
    getCurrentTicketSpy.mockReturnValue(of(mockTicket));
    const fixture = createHost(host => (host.isFacilitator = false));
    const b = board(fixture);

    messages$.next(
      JSON.stringify({
        type: 'VOTES_REVEALED',
        roomId: ROOM_ID,
        ticketId: 'ticket-1',
        values: ['3', '5'],
        consensus: { mean: 4, median: 4, majority: null },
        revealedAt: '2026-07-10T10:05:00Z',
      }),
    );
    fixture.detectChanges();

    expect(b.currentTicket()?.status).toBe('REVEALED');
    expect(b.revealedValues()).toEqual(['3', '5']);
    expect(b.consensus()).toEqual({ mean: 4, median: 4, majority: null });
    expect(revealTicketSpy).not.toHaveBeenCalled();
  });

  it('a VOTES_REVEALED broadcast for a different ticket than the one displayed is ignored', () => {
    getCurrentTicketSpy.mockReturnValue(of(mockTicket));
    const fixture = createHost();
    const b = board(fixture);

    messages$.next(
      JSON.stringify({
        type: 'VOTES_REVEALED',
        roomId: ROOM_ID,
        ticketId: 'some-other-ticket',
        values: ['3'],
        consensus: { mean: 3, median: 3, majority: '3' },
        revealedAt: '2026-07-10T10:05:00Z',
      }),
    );
    fixture.detectChanges();

    expect(b.currentTicket()?.status).toBe('VOTING');
    expect(b.revealedValues()).toBeNull();
  });

  it('renders a null-fallback label when mean/median/majority are all null (e.g. zero votes cast)', () => {
    revealTicketSpy.mockReturnValue(
      of({ ...mockReveal, values: [], consensus: { mean: null, median: null, majority: null } }),
    );
    getCurrentTicketSpy.mockReturnValue(of(mockTicket));
    const fixture = createHost(host => (host.isFacilitator = true));
    const b = board(fixture);

    b.revealVotes();
    fixture.detectChanges();

    const dds = fixture.nativeElement.querySelectorAll('.room-board__consensus dd');
    expect(dds.length).toBe(3);
    dds.forEach((dd: Element) => expect(dd.textContent?.trim()).toBe('en.scrumPoker.roomBoard.noNumericConsensus'));
  });

  it('maps a 403 reveal response to the facilitator-only error key', () => {
    revealTicketSpy.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
    getCurrentTicketSpy.mockReturnValue(of(mockTicket));
    const fixture = createHost(host => (host.isFacilitator = true));
    const b = board(fixture);

    b.revealVotes();
    fixture.detectChanges();

    expect(b.revealErrorKey()).toBe('scrumPoker.roomBoard.errors.facilitatorOnly');
  });

  it('maps a 404 reveal response to the ticket-not-found error key', () => {
    revealTicketSpy.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
    getCurrentTicketSpy.mockReturnValue(of(mockTicket));
    const fixture = createHost(host => (host.isFacilitator = true));
    const b = board(fixture);

    b.revealVotes();
    fixture.detectChanges();

    expect(b.revealErrorKey()).toBe('scrumPoker.roomBoard.errors.ticketNotFound');
  });

  it('maps a 409 reveal response to the ticket-already-revealed error key', () => {
    revealTicketSpy.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409 })));
    getCurrentTicketSpy.mockReturnValue(of(mockTicket));
    const fixture = createHost(host => (host.isFacilitator = true));
    const b = board(fixture);

    b.revealVotes();
    fixture.detectChanges();

    expect(b.revealErrorKey()).toBe('scrumPoker.roomBoard.errors.ticketAlreadyRevealed');
  });

  it('re-opens the ticket-creation form for the facilitator once the ticket has been revealed', () => {
    getCurrentTicketSpy.mockReturnValue(of(mockTicket));
    const fixture = createHost(host => (host.isFacilitator = true));
    const b = board(fixture);

    expect(fixture.nativeElement.querySelector('#ticket-title')).toBeNull();

    b.revealVotes();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('#ticket-title')).not.toBeNull();
  });

  it('creating a new ticket after a reveal resets the previous revealed values/consensus', () => {
    getCurrentTicketSpy.mockReturnValue(of(mockTicket));
    const fixture = createHost(host => (host.isFacilitator = true));
    const b = board(fixture);

    b.revealVotes();
    fixture.detectChanges();
    expect(b.revealedValues()).not.toBeNull();

    b.titleForm.controls.title.setValue('Next ticket');
    b.createTicket();
    fixture.detectChanges();

    expect(b.revealedValues()).toBeNull();
    expect(b.consensus()).toBeNull();
  });

  it('a revealed card is no longer clickable (button disabled)', () => {
    getCurrentTicketSpy.mockReturnValue(of({ ...mockTicket, status: 'REVEALED' as const }));
    const fixture = createHost();

    const firstCard = fixture.nativeElement.querySelector('.room-board__card');
    expect(firstCard.disabled).toBe(true);
  });
});

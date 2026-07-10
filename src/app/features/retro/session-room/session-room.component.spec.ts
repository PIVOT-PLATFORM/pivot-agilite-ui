import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Subject, of, throwError } from 'rxjs';
import {
  RetroFormatsResponse,
  RetroParticipantAccessResponse,
  RetroSessionResponse,
} from '../data-access/retro.models';
import { RetroApiService } from '../data-access/retro-api.service';
import { RetroSessionWsService, RetroConnectionStatus } from '../data-access/retro-ws.service';
import { SessionRoomComponent } from './session-room.component';

const SESSION_ID = '9f4e6b1a-6c3d-4b8e-8f2a-1234567890ab';

const NON_FACILITATOR_GRANT: RetroParticipantAccessResponse = {
  accessToken: 'opaque-token',
  ttlSeconds: 3600,
  facilitator: false,
  topicDestination: `/topic/agilite/retro/${SESSION_ID}`,
  facilitatorTopicDestination: null,
  submitDestination: `/app/agilite/retro/${SESSION_ID}/cards`,
  voteDestination: `/app/agilite/retro/${SESSION_ID}/votes`,
  voteUncastDestination: `/app/agilite/retro/${SESSION_ID}/votes/uncast`,
  voteBalanceDestination: `/app/agilite/retro/${SESSION_ID}/votes/balance`,
};

const FACILITATOR_GRANT: RetroParticipantAccessResponse = {
  ...NON_FACILITATOR_GRANT,
  facilitator: true,
  facilitatorTopicDestination: `/topic/agilite/retro/${SESSION_ID}/facilitator`,
};

describe('SessionRoomComponent', () => {
  let joinSpy: ReturnType<typeof vi.fn>;
  let getByIdSpy: ReturnType<typeof vi.fn>;
  let listFormatsSpy: ReturnType<typeof vi.fn>;
  let closeContributionSpy: ReturnType<typeof vi.fn>;
  let revealSpy: ReturnType<typeof vi.fn>;
  let openVoteSpy: ReturnType<typeof vi.fn>;
  let closeVoteSpy: ReturnType<typeof vi.fn>;
  let closeSessionSpy: ReturnType<typeof vi.fn>;
  let createActionSpy: ReturnType<typeof vi.fn>;
  let wsConnectSpy: ReturnType<typeof vi.fn>;
  let wsDisconnectSpy: ReturnType<typeof vi.fn>;
  let wsSubmitCardSpy: ReturnType<typeof vi.fn>;
  let wsCastVoteSpy: ReturnType<typeof vi.fn>;
  let wsUncastVoteSpy: ReturnType<typeof vi.fn>;
  let wsQueryVoteBalanceSpy: ReturnType<typeof vi.fn>;
  let wsStatusSignal: ReturnType<typeof signal<RetroConnectionStatus>>;
  let topicMessages$: Subject<string>;
  let facilitatorMessages$: Subject<string>;
  let voteBalanceMessages$: Subject<string>;

  const formatsResponse: RetroFormatsResponse = {
    formats: [
      {
        key: 'START_STOP_CONTINUE',
        label: 'Start / Stop / Continue',
        system: true,
        columns: [
          { key: 'went-well', label: 'Bien passé', color: null, description: null, icon: null },
          { key: 'to-improve', label: 'À améliorer', color: null, description: null, icon: null },
        ],
      },
    ],
  };

  const sessionDetail: RetroSessionResponse = {
    id: SESSION_ID,
    title: 'Sprint 8 Retro',
    format: 'START_STOP_CONTINUE',
    teamId: 42,
    facilitatorUserId: 7,
    joinCode: 'A3F9K2',
    currentPhase: 'CONTRIBUTION',
    contributionTimerSeconds: null,
    voteTimerSeconds: null,
    actionTimerSeconds: null,
    voteCountPerParticipant: 3,
    sprintRef: null,
    expiresAt: '2026-07-11T00:00:00Z',
    createdAt: '2026-07-10T00:00:00Z',
  };

  function configure(grant: RetroParticipantAccessResponse): void {
    joinSpy = vi.fn().mockReturnValue(of(grant));
    // Default: succeeds, as for an authenticated facilitator whose bearer token resolves —
    // matches formatsResponse's format key so the real column catalogue is used. The dedicated
    // "account-less participant" test below overrides this to fail (401), exercising the
    // fallback-column path instead.
    getByIdSpy = vi.fn().mockReturnValue(of(sessionDetail));
    listFormatsSpy = vi.fn().mockReturnValue(of(formatsResponse));
    closeContributionSpy = vi.fn().mockReturnValue(of({ currentPhase: 'REVUE' }));
    revealSpy = vi.fn().mockReturnValue(
      of({ sessionId: SESSION_ID, cardCount: 1, columns: { 'went-well': [{ id: 'card-1', content: 'Great job' }] } }),
    );
    openVoteSpy = vi.fn().mockReturnValue(of({ currentPhase: 'VOTE' }));
    closeVoteSpy = vi.fn().mockReturnValue(of({ currentPhase: 'ACTION' }));
    closeSessionSpy = vi.fn().mockReturnValue(of({ currentPhase: 'CLOSED' }));
    createActionSpy = vi.fn().mockReturnValue(of({ id: 'action-1' }));
    wsConnectSpy = vi.fn();
    wsDisconnectSpy = vi.fn();
    wsSubmitCardSpy = vi.fn();
    wsCastVoteSpy = vi.fn();
    wsUncastVoteSpy = vi.fn();
    wsQueryVoteBalanceSpy = vi.fn();
    wsStatusSignal = signal<RetroConnectionStatus>('connecting');
    topicMessages$ = new Subject<string>();
    facilitatorMessages$ = new Subject<string>();
    voteBalanceMessages$ = new Subject<string>();

    TestBed.configureTestingModule({
      imports: [SessionRoomComponent, TranslocoTestingModule.forRoot({ langs: { fr: {}, en: {} } })],
      providers: [
        {
          provide: RetroApiService,
          useValue: {
            joinRealtimeSession: joinSpy,
            getById: getByIdSpy,
            listFormats: listFormatsSpy,
            closeContribution: closeContributionSpy,
            reveal: revealSpy,
            openVote: openVoteSpy,
            closeVote: closeVoteSpy,
            closeSession: closeSessionSpy,
            createAction: createActionSpy,
          },
        },
        {
          provide: RetroSessionWsService,
          useValue: {
            status: wsStatusSignal,
            connect: wsConnectSpy,
            disconnect: wsDisconnectSpy,
            submitCard: wsSubmitCardSpy,
            castVote: wsCastVoteSpy,
            uncastVote: wsUncastVoteSpy,
            queryVoteBalance: wsQueryVoteBalanceSpy,
            topicMessages$,
            facilitatorMessages$,
            voteBalanceMessages$,
          },
        },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => SESSION_ID } } },
        },
      ],
    });
  }

  it('should create', () => {
    configure(NON_FACILITATOR_GRANT);
    const fixture = TestBed.createComponent(SessionRoomComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('joins the realtime session and connects the WS with the grant destinations/token', () => {
    configure(FACILITATOR_GRANT);
    const fixture = TestBed.createComponent(SessionRoomComponent);
    fixture.detectChanges();

    expect(joinSpy).toHaveBeenCalledWith(SESSION_ID);
    expect(wsConnectSpy).toHaveBeenCalledWith(FACILITATOR_GRANT);
  });

  /**
   * AC: a non-facilitator participant never sees card content before reveal — only the masked
   * count, driven exclusively by `CARD_ADDED` events on the regular (non-facilitator) topic.
   */
  it('updates the masked count from a CARD_ADDED event, never exposing content', () => {
    configure(NON_FACILITATOR_GRANT);
    const fixture = TestBed.createComponent(SessionRoomComponent);
    fixture.detectChanges();

    topicMessages$.next(JSON.stringify({ type: 'CARD_ADDED', sessionId: SESSION_ID, columnKey: 'went-well', cardCount: 3 }));
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as { maskedCountFor: (k: string) => number };
    expect(component.maskedCountFor('went-well')).toBe(3);
    expect(fixture.nativeElement.textContent).not.toContain('Great job');
  });

  /**
   * AC: only the facilitator receives full card content, via the separate facilitator-only
   * topic stream — never the regular one.
   */
  it('renders full content from a facilitator CARD_ADDED event when the caller is the facilitator', () => {
    configure(FACILITATOR_GRANT);
    const fixture = TestBed.createComponent(SessionRoomComponent);
    fixture.detectChanges();

    facilitatorMessages$.next(
      JSON.stringify({
        type: 'CARD_ADDED',
        sessionId: SESSION_ID,
        cardId: 'card-1',
        columnKey: 'went-well',
        content: 'Great teamwork this sprint',
        anonymous: false,
      }),
    );
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Great teamwork this sprint');
  });

  it('updates the phase on a PHASE_CHANGED event', () => {
    configure(NON_FACILITATOR_GRANT);
    const fixture = TestBed.createComponent(SessionRoomComponent);
    fixture.detectChanges();

    topicMessages$.next(
      JSON.stringify({
        type: 'PHASE_CHANGED',
        sessionId: SESSION_ID,
        previousPhase: 'CONTRIBUTION',
        currentPhase: 'REVUE',
        changedAt: '2026-07-10T12:00:00Z',
      }),
    );
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as { phase: () => string };
    expect(component.phase()).toBe('REVUE');
  });

  /**
   * Security AC: revealed card content must be rendered via text interpolation only — a
   * malicious payload containing markup must appear as literal text, never parsed as HTML.
   */
  it('renders CARDS_REVEALED content as plain text, never as HTML (XSS safety)', () => {
    configure(NON_FACILITATOR_GRANT);
    const fixture = TestBed.createComponent(SessionRoomComponent);
    fixture.detectChanges();

    const maliciousContent = '<img src=x onerror=alert(1)>';
    topicMessages$.next(
      JSON.stringify({
        type: 'CARDS_REVEALED',
        sessionId: SESSION_ID,
        columns: { 'went-well': [{ id: 'card-1', content: maliciousContent }] },
      }),
    );
    fixture.detectChanges();

    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelector('img')).toBeNull();
    expect(host.textContent).toContain(maliciousContent);
  });

  it('facilitator: closeContributionNow() calls the API and updates the phase from the response', () => {
    configure(FACILITATOR_GRANT);
    const fixture = TestBed.createComponent(SessionRoomComponent);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as {
      closeContributionNow: () => void;
      phase: () => string;
    };
    component.closeContributionNow();

    expect(closeContributionSpy).toHaveBeenCalledWith(SESSION_ID);
    expect(component.phase()).toBe('REVUE');
  });

  it('facilitator: triggerReveal() calls the API and populates revealedColumns from the response', () => {
    configure(FACILITATOR_GRANT);
    const fixture = TestBed.createComponent(SessionRoomComponent);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as {
      triggerReveal: () => void;
      revealedCardsFor: (k: string) => { id: string; content: string }[];
    };
    component.triggerReveal();

    expect(revealSpy).toHaveBeenCalledWith(SESSION_ID);
    expect(component.revealedCardsFor('went-well')).toEqual([{ id: 'card-1', content: 'Great job' }]);
  });

  /**
   * An account-less participant cannot fetch `getById` (401, no bearer token — the repo-wide
   * auth gap) and therefore cannot know the session's `format`, so the component falls back to
   * a generic, locally-labelled column set rather than failing outright.
   */
  it('falls back to a generic column when session detail cannot be loaded (account-less participant)', () => {
    configure(NON_FACILITATOR_GRANT);
    getByIdSpy.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 401 })));
    const fixture = TestBed.createComponent(SessionRoomComponent);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as {
      usingFallbackColumns: () => boolean;
      columns: () => { key: string; label: string }[];
    };
    expect(component.usingFallbackColumns()).toBe(true);
    expect(component.columns()).toHaveLength(1);
    expect(component.columns()[0].key).toBe('general');
  });

  it('submitCard() sends the draft over the WS and clears it', () => {
    configure(NON_FACILITATOR_GRANT);
    const fixture = TestBed.createComponent(SessionRoomComponent);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as {
      updateDraft: (k: string, v: string) => void;
      submitCard: (k: string) => void;
      drafts: () => Record<string, string>;
    };
    component.updateDraft('went-well', 'Great sprint');
    component.submitCard('went-well');

    expect(wsSubmitCardSpy).toHaveBeenCalledWith({ content: 'Great sprint', columnKey: 'went-well', anonymous: false });
    expect(component.drafts()['went-well']).toBe('');
  });

  it('submitCard() with blank content is a no-op', () => {
    configure(NON_FACILITATOR_GRANT);
    const fixture = TestBed.createComponent(SessionRoomComponent);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as { submitCard: (k: string) => void };
    component.submitCard('went-well');

    expect(wsSubmitCardSpy).not.toHaveBeenCalled();
  });

  it('shows the join error state on a 404 (unknown session) without ever calling the WS', () => {
    configure(NON_FACILITATOR_GRANT);
    joinSpy.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
    const fixture = TestBed.createComponent(SessionRoomComponent);
    fixture.detectChanges();

    expect(wsConnectSpy).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('notFound');
  });

  it('disconnects the WS on destroy', () => {
    configure(NON_FACILITATOR_GRANT);
    const fixture = TestBed.createComponent(SessionRoomComponent);
    fixture.detectChanges();

    fixture.destroy();

    expect(wsDisconnectSpy).toHaveBeenCalled();
  });

  it('shows the join error state on a 410 (expired/closed session)', () => {
    configure(NON_FACILITATOR_GRANT);
    joinSpy.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 410 })));
    const fixture = TestBed.createComponent(SessionRoomComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('expired');
  });

  it('shows the generic join error state on an unexpected status', () => {
    configure(NON_FACILITATOR_GRANT);
    joinSpy.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
    const fixture = TestBed.createComponent(SessionRoomComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('generic');
  });

  it('ignores an unparseable frame on the regular topic without throwing', () => {
    configure(NON_FACILITATOR_GRANT);
    const fixture = TestBed.createComponent(SessionRoomComponent);
    fixture.detectChanges();

    expect(() => topicMessages$.next('not-json')).not.toThrow();
  });

  it('ignores an unparseable frame on the facilitator topic without throwing', () => {
    configure(FACILITATOR_GRANT);
    const fixture = TestBed.createComponent(SessionRoomComponent);
    fixture.detectChanges();

    expect(() => facilitatorMessages$.next('not-json')).not.toThrow();
  });

  it('surfaces an error when closeContributionNow() fails', () => {
    configure(FACILITATOR_GRANT);
    closeContributionSpy.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409 })));
    const fixture = TestBed.createComponent(SessionRoomComponent);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as { closeContributionNow: () => void };
    component.closeContributionNow();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('actionFailed');
  });

  it('surfaces an error when triggerReveal() fails', () => {
    configure(FACILITATOR_GRANT);
    revealSpy.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409 })));
    const fixture = TestBed.createComponent(SessionRoomComponent);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as { triggerReveal: () => void };
    component.triggerReveal();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('actionFailed');
  });

  it('shows a live countdown when the session detail carries a configured contribution timer', () => {
    configure(NON_FACILITATOR_GRANT);
    getByIdSpy.mockReturnValue(
      of({
        ...sessionDetail,
        contributionTimerSeconds: 60,
        createdAt: new Date().toISOString(),
      }),
    );
    const fixture = TestBed.createComponent(SessionRoomComponent);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as { remainingSeconds: () => number | null };
    expect(component.remainingSeconds()).not.toBeNull();
    expect(component.remainingSeconds()).toBeLessThanOrEqual(60);

    fixture.destroy();
  });

  it('toggleAnonymousDraft() updates whether the next submission is anonymous', () => {
    configure(NON_FACILITATOR_GRANT);
    const fixture = TestBed.createComponent(SessionRoomComponent);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as {
      toggleAnonymousDraft: (v: boolean) => void;
      updateDraft: (k: string, v: string) => void;
      submitCard: (k: string) => void;
    };
    component.toggleAnonymousDraft(true);
    component.updateDraft('went-well', 'Anonymous feedback');
    component.submitCard('went-well');

    expect(wsSubmitCardSpy).toHaveBeenCalledWith({
      content: 'Anonymous feedback',
      columnKey: 'went-well',
      anonymous: true,
    });
  });

  it('missing sessionId route param shows the not-found error without ever joining', () => {
    configure(NON_FACILITATOR_GRANT);
    TestBed.overrideProvider(ActivatedRoute, { useValue: { snapshot: { paramMap: { get: () => null } } } });
    const fixture = TestBed.createComponent(SessionRoomComponent);
    fixture.detectChanges();

    expect(joinSpy).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('notFound');
  });

  // ── Vote phase (US20.1.2b) ──

  function moveToVote(fixture: ComponentFixture<SessionRoomComponent>): void {
    topicMessages$.next(
      JSON.stringify({
        type: 'PHASE_CHANGED',
        sessionId: SESSION_ID,
        previousPhase: 'REVUE',
        currentPhase: 'VOTE',
        changedAt: '2026-07-10T12:00:00Z',
        rankedCards: null,
      }),
    );
    fixture.detectChanges();
  }

  it('updates the aggregate vote count from a VOTE_CAST event, never exposing voter identity', () => {
    configure(NON_FACILITATOR_GRANT);
    const fixture = TestBed.createComponent(SessionRoomComponent);
    fixture.detectChanges();

    topicMessages$.next(JSON.stringify({ type: 'VOTE_CAST', sessionId: SESSION_ID, cardId: 'card-1', voteCount: 4 }));

    const component = fixture.componentInstance as unknown as { voteCountFor: (id: string) => number };
    expect(component.voteCountFor('card-1')).toBe(4);
  });

  it('updates the aggregate vote count from a VOTE_UNCAST event', () => {
    configure(NON_FACILITATOR_GRANT);
    const fixture = TestBed.createComponent(SessionRoomComponent);
    fixture.detectChanges();

    topicMessages$.next(JSON.stringify({ type: 'VOTE_CAST', sessionId: SESSION_ID, cardId: 'card-1', voteCount: 4 }));
    topicMessages$.next(JSON.stringify({ type: 'VOTE_UNCAST', sessionId: SESSION_ID, cardId: 'card-1', voteCount: 3 }));

    const component = fixture.componentInstance as unknown as { voteCountFor: (id: string) => number };
    expect(component.voteCountFor('card-1')).toBe(3);
  });

  it('queries the vote balance automatically when PHASE_CHANGED transitions into VOTE', () => {
    configure(NON_FACILITATOR_GRANT);
    const fixture = TestBed.createComponent(SessionRoomComponent);
    fixture.detectChanges();

    moveToVote(fixture);

    expect(wsQueryVoteBalanceSpy).toHaveBeenCalled();
  });

  it('queries the vote balance immediately when session detail loads with currentPhase VOTE (join mid-vote)', () => {
    configure(NON_FACILITATOR_GRANT);
    getByIdSpy.mockReturnValue(of({ ...sessionDetail, currentPhase: 'VOTE' }));
    const fixture = TestBed.createComponent(SessionRoomComponent);
    fixture.detectChanges();

    expect(wsQueryVoteBalanceSpy).toHaveBeenCalled();
  });

  it('applies the vote-count ranking and switches to the ranked view on PHASE_CHANGED (VOTE → ACTION)', () => {
    configure(NON_FACILITATOR_GRANT);
    const fixture = TestBed.createComponent(SessionRoomComponent);
    fixture.detectChanges();

    topicMessages$.next(
      JSON.stringify({
        type: 'PHASE_CHANGED',
        sessionId: SESSION_ID,
        previousPhase: 'VOTE',
        currentPhase: 'ACTION',
        changedAt: '2026-07-10T12:05:00Z',
        rankedCards: [
          { cardId: 'card-1', columnKey: 'went-well', content: 'Great job', voteCount: 5 },
          { cardId: 'card-2', columnKey: 'to-improve', content: 'Slow reviews', voteCount: 2 },
        ],
      }),
    );
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as { rankedCards: () => unknown };
    expect(component.rankedCards()).toEqual([
      { cardId: 'card-1', columnKey: 'went-well', content: 'Great job', voteCount: 5 },
      { cardId: 'card-2', columnKey: 'to-improve', content: 'Slow reviews', voteCount: 2 },
    ]);
    expect(fixture.nativeElement.textContent).toContain('Great job');
    expect(fixture.nativeElement.textContent).toContain('Slow reviews');
  });

  it('does not populate rankedCards for a PHASE_CHANGED transition without a ranking', () => {
    configure(NON_FACILITATOR_GRANT);
    const fixture = TestBed.createComponent(SessionRoomComponent);
    fixture.detectChanges();

    topicMessages$.next(
      JSON.stringify({
        type: 'PHASE_CHANGED',
        sessionId: SESSION_ID,
        previousPhase: 'CONTRIBUTION',
        currentPhase: 'REVUE',
        changedAt: '2026-07-10T12:00:00Z',
        rankedCards: null,
      }),
    );

    const component = fixture.componentInstance as unknown as { rankedCards: () => unknown };
    expect(component.rankedCards()).toBeNull();
  });

  it('castVote() no-ops when the phase is not VOTE', () => {
    configure(NON_FACILITATOR_GRANT);
    const fixture = TestBed.createComponent(SessionRoomComponent);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as { castVote: (id: string) => void };
    component.castVote('card-1');

    expect(wsCastVoteSpy).not.toHaveBeenCalled();
  });

  it("castVote() publishes over the WS, optimistically increments the caller's own count, and decrements votesRemaining", () => {
    configure(NON_FACILITATOR_GRANT);
    const fixture = TestBed.createComponent(SessionRoomComponent);
    fixture.detectChanges();
    moveToVote(fixture);
    voteBalanceMessages$.next(
      JSON.stringify({ type: 'VOTE_BALANCE', sessionId: SESSION_ID, votesRemaining: 3, votesAllowed: 3 }),
    );

    const component = fixture.componentInstance as unknown as {
      castVote: (id: string) => void;
      myVoteCountFor: (id: string) => number;
      votesRemaining: () => number | null;
    };
    component.castVote('card-1');

    expect(wsCastVoteSpy).toHaveBeenCalledWith('card-1');
    expect(component.myVoteCountFor('card-1')).toBe(1);
    expect(component.votesRemaining()).toBe(2);
  });

  it('castVote() no-ops once the known balance is exhausted', () => {
    configure(NON_FACILITATOR_GRANT);
    const fixture = TestBed.createComponent(SessionRoomComponent);
    fixture.detectChanges();
    moveToVote(fixture);
    voteBalanceMessages$.next(
      JSON.stringify({ type: 'VOTE_BALANCE', sessionId: SESSION_ID, votesRemaining: 0, votesAllowed: 3 }),
    );

    const component = fixture.componentInstance as unknown as { castVote: (id: string) => void };
    component.castVote('card-1');

    expect(wsCastVoteSpy).not.toHaveBeenCalled();
  });

  it('uncastVote() publishes over the WS, decrements the local count, and increments votesRemaining back (capped at votesAllowed)', () => {
    configure(NON_FACILITATOR_GRANT);
    const fixture = TestBed.createComponent(SessionRoomComponent);
    fixture.detectChanges();
    moveToVote(fixture);
    voteBalanceMessages$.next(
      JSON.stringify({ type: 'VOTE_BALANCE', sessionId: SESSION_ID, votesRemaining: 3, votesAllowed: 3 }),
    );

    const component = fixture.componentInstance as unknown as {
      castVote: (id: string) => void;
      uncastVote: (id: string) => void;
      myVoteCountFor: (id: string) => number;
      votesRemaining: () => number | null;
    };
    component.castVote('card-1');
    component.uncastVote('card-1');

    expect(wsUncastVoteSpy).toHaveBeenCalledWith('card-1');
    expect(component.myVoteCountFor('card-1')).toBe(0);
    expect(component.votesRemaining()).toBe(3);
  });

  it('uncastVote() no-ops when the caller has no locally-tracked vote on this card', () => {
    configure(NON_FACILITATOR_GRANT);
    const fixture = TestBed.createComponent(SessionRoomComponent);
    fixture.detectChanges();
    moveToVote(fixture);

    const component = fixture.componentInstance as unknown as { uncastVote: (id: string) => void };
    component.uncastVote('card-1');

    expect(wsUncastVoteSpy).not.toHaveBeenCalled();
  });

  it('ignores an unparseable frame on the vote-balance queue without throwing', () => {
    configure(NON_FACILITATOR_GRANT);
    const fixture = TestBed.createComponent(SessionRoomComponent);
    fixture.detectChanges();

    expect(() => voteBalanceMessages$.next('not-json')).not.toThrow();
  });

  it('renders per-card vote controls in VOTE phase and casts a vote via a real DOM click', () => {
    configure(NON_FACILITATOR_GRANT);
    const fixture = TestBed.createComponent(SessionRoomComponent);
    fixture.detectChanges();

    topicMessages$.next(
      JSON.stringify({
        type: 'CARDS_REVEALED',
        sessionId: SESSION_ID,
        columns: { 'went-well': [{ id: 'card-1', content: 'Great job' }] },
      }),
    );
    moveToVote(fixture);
    voteBalanceMessages$.next(
      JSON.stringify({ type: 'VOTE_BALANCE', sessionId: SESSION_ID, votesRemaining: 2, votesAllowed: 2 }),
    );
    fixture.detectChanges();

    const castButton = fixture.nativeElement.querySelector('.session-room__vote-button') as HTMLButtonElement;
    expect(castButton).toBeTruthy();
    expect(castButton.disabled).toBe(false);
    castButton.click();

    expect(wsCastVoteSpy).toHaveBeenCalledWith('card-1');
  });

  it('facilitator: shows the open-vote control only once cards have been revealed in REVUE', () => {
    configure(FACILITATOR_GRANT);
    const fixture = TestBed.createComponent(SessionRoomComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('openVoteNow');

    const component = fixture.componentInstance as unknown as { triggerReveal: () => void };
    topicMessages$.next(
      JSON.stringify({
        type: 'PHASE_CHANGED',
        sessionId: SESSION_ID,
        previousPhase: 'CONTRIBUTION',
        currentPhase: 'REVUE',
        changedAt: '2026-07-10T12:00:00Z',
        rankedCards: null,
      }),
    );
    fixture.detectChanges();
    component.triggerReveal();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('openVoteNow');
  });

  it('facilitator: shows the close-vote control while the session is in VOTE', () => {
    configure(FACILITATOR_GRANT);
    const fixture = TestBed.createComponent(SessionRoomComponent);
    fixture.detectChanges();

    moveToVote(fixture);

    expect(fixture.nativeElement.textContent).toContain('closeVoteNow');
  });

  it('facilitator: openVoteNow() calls the API, updates the phase, and queries the vote balance', () => {
    configure(FACILITATOR_GRANT);
    const fixture = TestBed.createComponent(SessionRoomComponent);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as { openVoteNow: () => void; phase: () => string };
    component.openVoteNow();

    expect(openVoteSpy).toHaveBeenCalledWith(SESSION_ID);
    expect(component.phase()).toBe('VOTE');
    expect(wsQueryVoteBalanceSpy).toHaveBeenCalled();
  });

  it('surfaces an error when openVoteNow() fails', () => {
    configure(FACILITATOR_GRANT);
    openVoteSpy.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409 })));
    const fixture = TestBed.createComponent(SessionRoomComponent);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as { openVoteNow: () => void };
    component.openVoteNow();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('actionFailed');
  });

  it('facilitator: closeVoteNow() calls the API and updates the phase', () => {
    configure(FACILITATOR_GRANT);
    const fixture = TestBed.createComponent(SessionRoomComponent);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as { closeVoteNow: () => void; phase: () => string };
    component.closeVoteNow();

    expect(closeVoteSpy).toHaveBeenCalledWith(SESSION_ID);
    expect(component.phase()).toBe('ACTION');
  });

  it('surfaces an error when closeVoteNow() fails', () => {
    configure(FACILITATOR_GRANT);
    closeVoteSpy.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409 })));
    const fixture = TestBed.createComponent(SessionRoomComponent);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as { closeVoteNow: () => void };
    component.closeVoteNow();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('actionFailed');
  });

  // ── Action phase / session closure (US20.1.2c) ──

  const RANKED_CARDS = [
    { cardId: 'card-1', columnKey: 'went-well', content: 'Great job', voteCount: 5 },
    { cardId: 'card-2', columnKey: 'to-improve', content: 'Slow reviews', voteCount: 2 },
    { cardId: 'card-3', columnKey: 'went-well', content: 'Nice pace', voteCount: 1 },
  ];

  function moveToAction(fixture: ComponentFixture<SessionRoomComponent>): void {
    topicMessages$.next(
      JSON.stringify({
        type: 'PHASE_CHANGED',
        sessionId: SESSION_ID,
        previousPhase: 'VOTE',
        currentPhase: 'ACTION',
        changedAt: '2026-07-10T12:05:00Z',
        rankedCards: RANKED_CARDS,
      }),
    );
    fixture.detectChanges();
  }

  it('groups the vote-count ranking by column, in format order, each group preserving vote-count-descending order', () => {
    configure(NON_FACILITATOR_GRANT);
    const fixture = TestBed.createComponent(SessionRoomComponent);
    fixture.detectChanges();
    moveToAction(fixture);

    const component = fixture.componentInstance as unknown as {
      rankedColumnEntries: () => { key: string; label: string; cards: { cardId: string }[] }[];
    };
    const entries = component.rankedColumnEntries();

    expect(entries.map(e => e.key)).toEqual(['went-well', 'to-improve']);
    expect(entries[0].cards.map(c => c.cardId)).toEqual(['card-1', 'card-3']);
    expect(entries[1].cards.map(c => c.cardId)).toEqual(['card-2']);
  });

  it('omits a column from the ranking view when it has no ranked cards', () => {
    configure(NON_FACILITATOR_GRANT);
    const fixture = TestBed.createComponent(SessionRoomComponent);
    fixture.detectChanges();
    topicMessages$.next(
      JSON.stringify({
        type: 'PHASE_CHANGED',
        sessionId: SESSION_ID,
        previousPhase: 'VOTE',
        currentPhase: 'ACTION',
        changedAt: '2026-07-10T12:05:00Z',
        rankedCards: [{ cardId: 'card-1', columnKey: 'went-well', content: 'Great job', voteCount: 5 }],
      }),
    );
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as {
      rankedColumnEntries: () => { key: string }[];
    };
    expect(component.rankedColumnEntries().map(e => e.key)).toEqual(['went-well']);
  });

  it('renders a "create action" trigger per ranked card while in ACTION phase, calling the API with the card as source', () => {
    configure(NON_FACILITATOR_GRANT);
    const fixture = TestBed.createComponent(SessionRoomComponent);
    fixture.detectChanges();
    moveToAction(fixture);

    const button = fixture.nativeElement.querySelector('.session-room__create-action-button') as HTMLButtonElement;
    expect(button).toBeTruthy();
    button.click();

    expect(createActionSpy).toHaveBeenCalledWith(SESSION_ID, { title: 'Great job', sourceCardId: 'card-1' });
  });

  it('createActionFromCard() is available to a non-facilitator participant (AC: "l\'animateur ou un participant")', () => {
    configure(NON_FACILITATOR_GRANT);
    const fixture = TestBed.createComponent(SessionRoomComponent);
    fixture.detectChanges();
    moveToAction(fixture);

    const component = fixture.componentInstance as unknown as {
      createActionFromCard: (card: { cardId: string; columnKey: string; content: string; voteCount: number }) => void;
    };
    component.createActionFromCard(RANKED_CARDS[0]);

    expect(createActionSpy).toHaveBeenCalledWith(SESSION_ID, { title: 'Great job', sourceCardId: 'card-1' });
  });

  it('shows a success message once createActionFromCard() succeeds', () => {
    configure(NON_FACILITATOR_GRANT);
    const fixture = TestBed.createComponent(SessionRoomComponent);
    fixture.detectChanges();
    moveToAction(fixture);

    const component = fixture.componentInstance as unknown as {
      createActionFromCard: (card: { cardId: string; columnKey: string; content: string; voteCount: number }) => void;
      actionCreationResultFor: (id: string) => string | null;
    };
    component.createActionFromCard(RANKED_CARDS[0]);
    fixture.detectChanges();

    expect(component.actionCreationResultFor('card-1')).toBe('success');
    expect(fixture.nativeElement.textContent).toContain('created');
  });

  it('handles createActionFromCard() failure gracefully (US20.3.1 endpoint not built yet) without throwing', () => {
    configure(NON_FACILITATOR_GRANT);
    createActionSpy.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
    const fixture = TestBed.createComponent(SessionRoomComponent);
    fixture.detectChanges();
    moveToAction(fixture);

    const component = fixture.componentInstance as unknown as {
      createActionFromCard: (card: { cardId: string; columnKey: string; content: string; voteCount: number }) => void;
      actionCreationResultFor: (id: string) => string | null;
    };
    expect(() => component.createActionFromCard(RANKED_CARDS[0])).not.toThrow();
    fixture.detectChanges();

    expect(component.actionCreationResultFor('card-1')).toBe('error');
    expect(fixture.nativeElement.textContent).toContain('actionFailed');
  });

  it('createActionFromCard() no-ops while a call for the same card is already in flight', () => {
    configure(NON_FACILITATOR_GRANT);
    const pending = new Subject<unknown>();
    createActionSpy.mockReturnValue(pending);
    const fixture = TestBed.createComponent(SessionRoomComponent);
    fixture.detectChanges();
    moveToAction(fixture);

    const component = fixture.componentInstance as unknown as {
      createActionFromCard: (card: { cardId: string; columnKey: string; content: string; voteCount: number }) => void;
    };
    component.createActionFromCard(RANKED_CARDS[0]);
    component.createActionFromCard(RANKED_CARDS[0]);

    expect(createActionSpy).toHaveBeenCalledTimes(1);
  });

  it('does not show the create-action trigger once the session is CLOSED', () => {
    configure(NON_FACILITATOR_GRANT);
    const fixture = TestBed.createComponent(SessionRoomComponent);
    fixture.detectChanges();
    moveToAction(fixture);

    topicMessages$.next(
      JSON.stringify({
        type: 'SESSION_CLOSED',
        sessionId: SESSION_ID,
        previousPhase: 'ACTION',
        closedAt: '2026-07-10T12:10:00Z',
      }),
    );
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.session-room__create-action-button')).toBeNull();
  });

  it('applies a SESSION_CLOSED event: switches phase to CLOSED and shows the read-only banner', () => {
    configure(NON_FACILITATOR_GRANT);
    const fixture = TestBed.createComponent(SessionRoomComponent);
    fixture.detectChanges();
    moveToAction(fixture);

    topicMessages$.next(
      JSON.stringify({
        type: 'SESSION_CLOSED',
        sessionId: SESSION_ID,
        previousPhase: 'ACTION',
        closedAt: '2026-07-10T12:10:00Z',
      }),
    );
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as { phase: () => string; closedAt: () => string | null };
    expect(component.phase()).toBe('CLOSED');
    expect(component.closedAt()).toBe('2026-07-10T12:10:00Z');
    expect(fixture.nativeElement.textContent).toContain('closedBanner');
  });

  it('facilitator: shows the close-session control while the session is in ACTION', () => {
    configure(FACILITATOR_GRANT);
    const fixture = TestBed.createComponent(SessionRoomComponent);
    fixture.detectChanges();
    moveToAction(fixture);

    expect(fixture.nativeElement.textContent).toContain('closeSessionNow');
  });

  it('facilitator: closeSessionNow() calls the API and updates the phase', () => {
    configure(FACILITATOR_GRANT);
    const fixture = TestBed.createComponent(SessionRoomComponent);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as { closeSessionNow: () => void; phase: () => string };
    component.closeSessionNow();

    expect(closeSessionSpy).toHaveBeenCalledWith(SESSION_ID);
    expect(component.phase()).toBe('CLOSED');
  });

  it('surfaces an error when closeSessionNow() fails', () => {
    configure(FACILITATOR_GRANT);
    closeSessionSpy.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409 })));
    const fixture = TestBed.createComponent(SessionRoomComponent);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as { closeSessionNow: () => void };
    component.closeSessionNow();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('actionFailed');
  });

  it('does not show the close-session control once the session is already CLOSED', () => {
    configure(FACILITATOR_GRANT);
    const fixture = TestBed.createComponent(SessionRoomComponent);
    fixture.detectChanges();
    moveToAction(fixture);

    const component = fixture.componentInstance as unknown as { closeSessionNow: () => void };
    component.closeSessionNow();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('closeSessionNow');
  });
});

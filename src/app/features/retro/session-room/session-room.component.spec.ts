import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
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
  let wsConnectSpy: ReturnType<typeof vi.fn>;
  let wsDisconnectSpy: ReturnType<typeof vi.fn>;
  let wsSubmitCardSpy: ReturnType<typeof vi.fn>;
  let wsStatusSignal: ReturnType<typeof signal<RetroConnectionStatus>>;
  let topicMessages$: Subject<string>;
  let facilitatorMessages$: Subject<string>;

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
    wsConnectSpy = vi.fn();
    wsDisconnectSpy = vi.fn();
    wsSubmitCardSpy = vi.fn();
    wsStatusSignal = signal<RetroConnectionStatus>('connecting');
    topicMessages$ = new Subject<string>();
    facilitatorMessages$ = new Subject<string>();

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
          },
        },
        {
          provide: RetroSessionWsService,
          useValue: {
            status: wsStatusSignal,
            connect: wsConnectSpy,
            disconnect: wsDisconnectSpy,
            submitCard: wsSubmitCardSpy,
            topicMessages$,
            facilitatorMessages$,
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
    expect(wsConnectSpy).toHaveBeenCalledWith(
      FACILITATOR_GRANT.topicDestination,
      FACILITATOR_GRANT.accessToken,
      FACILITATOR_GRANT.submitDestination,
      FACILITATOR_GRANT.facilitatorTopicDestination,
    );
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
});

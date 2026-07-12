import { TestBed } from '@angular/core/testing';
import { RxStompState } from '@stomp/rx-stomp';
import { Subject } from 'rxjs';
import { AGILITE_WS_URL } from '../../../core/config/tokens';
import { RetroParticipantAccessResponse } from './retro.models';
import { RetroSessionWsService, STOMP_CLIENT_FACTORY, StompClient } from './retro-ws.service';

/**
 * Minimal fake standing in for `@stomp/rx-stomp`'s `RxStomp`, substituted via
 * `STOMP_CLIENT_FACTORY` (Angular DI) — see `retro-ws.service.ts`'s `StompClient` TSDoc / the
 * identical `scrum-poker/room-ws.service.spec.ts` precedent for why DI substitution (not
 * `vi.mock('@stomp/rx-stomp', ...)`) is required for reliable test doubles.
 */
class FakeRxStomp implements StompClient {
  readonly connectionState$ = new Subject<RxStompState>();
  readonly stompErrors$ = new Subject<unknown>();
  readonly configureCalls: unknown[] = [];
  activateCalls = 0;
  deactivateCalls = 0;
  readonly watchCalls: { destination: string; headers?: Record<string, string> }[] = [];
  readonly publishCalls: { destination: string; body: string; headers?: Record<string, string> }[] = [];
  private readonly watchers = new Map<string, Subject<{ body: string }>>();

  configure(cfg: unknown): void {
    this.configureCalls.push(cfg);
  }

  activate(): void {
    this.activateCalls++;
  }

  deactivate(): Promise<void> {
    this.deactivateCalls++;
    return Promise.resolve();
  }

  watch(destination: string, headers?: Record<string, string>) {
    this.watchCalls.push({ destination, headers });
    return this.watcher(destination).asObservable();
  }

  publish(params: { destination: string; body: string; headers?: Record<string, string> }): void {
    this.publishCalls.push(params);
  }

  emit(destination: string, body: string): void {
    this.watcher(destination).next({ body });
  }

  private watcher(destination: string): Subject<{ body: string }> {
    let subject = this.watchers.get(destination);
    if (!subject) {
      subject = new Subject<{ body: string }>();
      this.watchers.set(destination, subject);
    }
    return subject;
  }
}

const SESSION_ID = '9f4e6b1a-6c3d-4b8e-8f2a-1234567890ab';
const TOPIC = `/topic/agilite/retro/${SESSION_ID}`;
const FACILITATOR_TOPIC = `${TOPIC}/facilitator`;
const SUBMIT_DESTINATION = `/app/agilite/retro/${SESSION_ID}/cards`;
const VOTE_DESTINATION = `/app/agilite/retro/${SESSION_ID}/votes`;
const VOTE_UNCAST_DESTINATION = `/app/agilite/retro/${SESSION_ID}/votes/uncast`;
const VOTE_BALANCE_DESTINATION = `/app/agilite/retro/${SESSION_ID}/votes/balance`;
const VOTE_BALANCE_QUEUE = '/user/queue/votes';
const ACCESS_TOKEN = 'opaque-access-token';

const NON_FACILITATOR_GRANT: RetroParticipantAccessResponse = {
  accessToken: ACCESS_TOKEN,
  ttlSeconds: 3600,
  facilitator: false,
  topicDestination: TOPIC,
  facilitatorTopicDestination: null,
  submitDestination: SUBMIT_DESTINATION,
  voteDestination: VOTE_DESTINATION,
  voteUncastDestination: VOTE_UNCAST_DESTINATION,
  voteBalanceDestination: VOTE_BALANCE_DESTINATION,
};

const FACILITATOR_GRANT: RetroParticipantAccessResponse = {
  ...NON_FACILITATOR_GRANT,
  facilitator: true,
  facilitatorTopicDestination: FACILITATOR_TOPIC,
};

describe('RetroSessionWsService', () => {
  let service: RetroSessionWsService;
  let fake: FakeRxStomp;
  let activeFake: { current: FakeRxStomp };

  beforeEach(() => {
    fake = new FakeRxStomp();
    activeFake = { current: fake };

    TestBed.configureTestingModule({
      providers: [{ provide: STOMP_CLIENT_FACTORY, useValue: () => activeFake.current }],
    });
    service = TestBed.inject(RetroSessionWsService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ── connect() ──

  it('configures the STOMP client with the dev broker URL derived from environment.wsUrl and activates it', () => {
    service.connect(NON_FACILITATOR_GRANT);

    const cfg = fake.configureCalls[0] as { brokerURL: string };
    expect(cfg.brokerURL).toBe('ws://localhost:8082/ws/agilite');
    expect(fake.activateCalls).toBe(1);
  });

  it('subscribes to the regular topic and the private vote-balance queue, presenting the access token', () => {
    service.connect(NON_FACILITATOR_GRANT);

    expect(fake.watchCalls).toHaveLength(2);
    expect(fake.watchCalls[0].destination).toBe(TOPIC);
    expect(fake.watchCalls[0].headers).toEqual({ 'access-token': ACCESS_TOKEN });
    expect(fake.watchCalls[1].destination).toBe(VOTE_BALANCE_QUEUE);
    expect(fake.watchCalls[1].headers).toEqual({ 'access-token': ACCESS_TOKEN });
  });

  it('additionally subscribes to the facilitator topic when provided', () => {
    service.connect(FACILITATOR_GRANT);

    expect(fake.watchCalls).toHaveLength(3);
    expect(fake.watchCalls[2].destination).toBe(FACILITATOR_TOPIC);
    expect(fake.watchCalls[2].headers).toEqual({ 'access-token': ACCESS_TOKEN });
  });

  it('does not subscribe to a facilitator topic when none is provided (non-facilitator participant)', () => {
    service.connect(NON_FACILITATOR_GRANT);

    expect(fake.watchCalls).toHaveLength(2);
  });

  it('starts in the "connecting" status', () => {
    service.connect(NON_FACILITATOR_GRANT);
    expect(service.status()).toBe('connecting');
  });

  it('transitions to "connected" once the STOMP connection opens', () => {
    service.connect(NON_FACILITATOR_GRANT);
    fake.connectionState$.next(RxStompState.CONNECTING);
    fake.connectionState$.next(RxStompState.OPEN);
    expect(service.status()).toBe('connected');
  });

  it('transitions to "error" when the connection drops after having connected', () => {
    service.connect(NON_FACILITATOR_GRANT);
    fake.connectionState$.next(RxStompState.CONNECTING);
    fake.connectionState$.next(RxStompState.OPEN);
    fake.connectionState$.next(RxStompState.CLOSED);
    expect(service.status()).toBe('error');
  });

  it('transitions to "error" on a STOMP ERROR frame (e.g. rejected access token)', () => {
    service.connect(NON_FACILITATOR_GRANT);
    fake.stompErrors$.next({});
    expect(service.status()).toBe('error');
  });

  // ── topicMessages$ / facilitatorMessages$ / voteBalanceMessages$ ──

  it('forwards raw message bodies received on the regular topic to topicMessages$', () => {
    service.connect(NON_FACILITATOR_GRANT);
    const received: string[] = [];
    service.topicMessages$.subscribe(body => received.push(body));

    fake.emit(TOPIC, '{"type":"CARD_ADDED","columnKey":"went-well","cardCount":1}');

    expect(received).toEqual(['{"type":"CARD_ADDED","columnKey":"went-well","cardCount":1}']);
  });

  it('forwards raw message bodies received on the facilitator topic to facilitatorMessages$ only', () => {
    service.connect(FACILITATOR_GRANT);
    const topicReceived: string[] = [];
    const facilitatorReceived: string[] = [];
    service.topicMessages$.subscribe(body => topicReceived.push(body));
    service.facilitatorMessages$.subscribe(body => facilitatorReceived.push(body));

    fake.emit(FACILITATOR_TOPIC, '{"type":"CARD_ADDED","content":"secret"}');

    expect(facilitatorReceived).toEqual(['{"type":"CARD_ADDED","content":"secret"}']);
    expect(topicReceived).toHaveLength(0);
  });

  it('forwards raw message bodies received on the private vote-balance queue to voteBalanceMessages$ only', () => {
    service.connect(NON_FACILITATOR_GRANT);
    const topicReceived: string[] = [];
    const balanceReceived: string[] = [];
    service.topicMessages$.subscribe(body => topicReceived.push(body));
    service.voteBalanceMessages$.subscribe(body => balanceReceived.push(body));

    fake.emit(VOTE_BALANCE_QUEUE, '{"type":"VOTE_BALANCE","votesRemaining":2,"votesAllowed":3}');

    expect(balanceReceived).toEqual(['{"type":"VOTE_BALANCE","votesRemaining":2,"votesAllowed":3}']);
    expect(topicReceived).toHaveLength(0);
  });

  // ── submitCard() ──

  it('publishes the card as JSON to the submit destination with the access token header', () => {
    service.connect(NON_FACILITATOR_GRANT);

    service.submitCard({ content: 'Great sprint', columnKey: 'went-well', anonymous: false });

    expect(fake.publishCalls).toHaveLength(1);
    expect(fake.publishCalls[0].destination).toBe(SUBMIT_DESTINATION);
    expect(fake.publishCalls[0].headers).toEqual({ 'access-token': ACCESS_TOKEN });
    expect(JSON.parse(fake.publishCalls[0].body)).toEqual({
      content: 'Great sprint',
      columnKey: 'went-well',
      anonymous: false,
    });
  });

  it('submitCard() before any connect() is a safe no-op', () => {
    expect(() => service.submitCard({ content: 'x', columnKey: 'y', anonymous: false })).not.toThrow();
  });

  it('submitCard() after disconnect() is a safe no-op', () => {
    service.connect(NON_FACILITATOR_GRANT);
    service.disconnect();

    service.submitCard({ content: 'x', columnKey: 'y', anonymous: false });

    expect(fake.publishCalls).toHaveLength(0);
  });

  // ── castVote() / uncastVote() (US20.1.2b) ──

  it('publishes the cardId as JSON to the vote destination with the access token header', () => {
    service.connect(NON_FACILITATOR_GRANT);

    service.castVote('card-1');

    expect(fake.publishCalls).toHaveLength(1);
    expect(fake.publishCalls[0].destination).toBe(VOTE_DESTINATION);
    expect(fake.publishCalls[0].headers).toEqual({ 'access-token': ACCESS_TOKEN });
    expect(JSON.parse(fake.publishCalls[0].body)).toEqual({ cardId: 'card-1' });
  });

  it('allows casting several votes on the same card — one publish per call', () => {
    service.connect(NON_FACILITATOR_GRANT);

    service.castVote('card-1');
    service.castVote('card-1');

    expect(fake.publishCalls).toHaveLength(2);
    expect(fake.publishCalls[0].destination).toBe(VOTE_DESTINATION);
    expect(fake.publishCalls[1].destination).toBe(VOTE_DESTINATION);
  });

  it('castVote() before any connect() is a safe no-op', () => {
    expect(() => service.castVote('card-1')).not.toThrow();
  });

  it('castVote() after disconnect() is a safe no-op', () => {
    service.connect(NON_FACILITATOR_GRANT);
    service.disconnect();

    service.castVote('card-1');

    expect(fake.publishCalls).toHaveLength(0);
  });

  it('publishes the cardId as JSON to the vote-uncast destination with the access token header', () => {
    service.connect(NON_FACILITATOR_GRANT);

    service.uncastVote('card-1');

    expect(fake.publishCalls).toHaveLength(1);
    expect(fake.publishCalls[0].destination).toBe(VOTE_UNCAST_DESTINATION);
    expect(fake.publishCalls[0].headers).toEqual({ 'access-token': ACCESS_TOKEN });
    expect(JSON.parse(fake.publishCalls[0].body)).toEqual({ cardId: 'card-1' });
  });

  it('uncastVote() before any connect() is a safe no-op', () => {
    expect(() => service.uncastVote('card-1')).not.toThrow();
  });

  it('uncastVote() after disconnect() is a safe no-op', () => {
    service.connect(NON_FACILITATOR_GRANT);
    service.disconnect();

    service.uncastVote('card-1');

    expect(fake.publishCalls).toHaveLength(0);
  });

  // ── queryVoteBalance() (US20.1.2b) ──

  it('publishes an empty body to the vote-balance destination with the access token header', () => {
    service.connect(NON_FACILITATOR_GRANT);

    service.queryVoteBalance();

    expect(fake.publishCalls).toHaveLength(1);
    expect(fake.publishCalls[0].destination).toBe(VOTE_BALANCE_DESTINATION);
    expect(fake.publishCalls[0].headers).toEqual({ 'access-token': ACCESS_TOKEN });
    expect(fake.publishCalls[0].body).toBe('');
  });

  it('queryVoteBalance() before any connect() is a safe no-op', () => {
    expect(() => service.queryVoteBalance()).not.toThrow();
  });

  it('queryVoteBalance() after disconnect() is a safe no-op', () => {
    service.connect(NON_FACILITATOR_GRANT);
    service.disconnect();

    service.queryVoteBalance();

    expect(fake.publishCalls).toHaveLength(0);
  });

  // ── disconnect() ──

  it('disconnect() deactivates the client', () => {
    service.connect(NON_FACILITATOR_GRANT);
    service.disconnect();
    expect(fake.deactivateCalls).toBeGreaterThanOrEqual(1);
  });

  it('disconnect() stops applying subsequent incoming messages', () => {
    service.connect(NON_FACILITATOR_GRANT);
    const received: string[] = [];
    service.topicMessages$.subscribe(body => received.push(body));
    service.disconnect();

    fake.emit(TOPIC, '{"type":"PING"}');
    expect(received).toHaveLength(0);
  });

  it('disconnect() is safe to call without a prior connect()', () => {
    expect(() => service.disconnect()).not.toThrow();
  });

  it('connect() calls disconnect() first, tearing down any prior connection', () => {
    service.connect(NON_FACILITATOR_GRANT);
    const firstFake = fake;

    activeFake.current = new FakeRxStomp();
    service.connect(NON_FACILITATOR_GRANT);

    expect(firstFake.deactivateCalls).toBeGreaterThanOrEqual(1);
  });

  it('resolves a relative wsUrl (nginx-proxied prod build) against the page origin', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: STOMP_CLIENT_FACTORY, useValue: () => activeFake.current },
        { provide: AGILITE_WS_URL, useValue: '/ws/agilite' },
      ],
    });
    const relService = TestBed.inject(RetroSessionWsService);
    relService.connect(NON_FACILITATOR_GRANT);
    const cfg = fake.configureCalls[0] as { brokerURL: string };
    const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
    expect(cfg.brokerURL).toBe(`${scheme}://${window.location.host}/ws/agilite`);
  });
});

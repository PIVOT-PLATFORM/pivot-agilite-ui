import { TestBed } from '@angular/core/testing';
import { RxStompState } from '@stomp/rx-stomp';
import { Subject } from 'rxjs';
import { environment } from '../../../../environments/environment';
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

const TOPIC = '/topic/agilite/retro/9f4e6b1a-6c3d-4b8e-8f2a-1234567890ab';
const FACILITATOR_TOPIC = `${TOPIC}/facilitator`;
const SUBMIT_DESTINATION = '/app/agilite/retro/9f4e6b1a-6c3d-4b8e-8f2a-1234567890ab/cards';
const ACCESS_TOKEN = 'opaque-access-token';

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
    service.connect(TOPIC, ACCESS_TOKEN, SUBMIT_DESTINATION);

    const cfg = fake.configureCalls[0] as { brokerURL: string };
    expect(cfg.brokerURL).toBe('ws://localhost:8082/ws/agilite');
    expect(fake.activateCalls).toBe(1);
  });

  it('subscribes to the regular topic, presenting the access token on the native "access-token" header', () => {
    service.connect(TOPIC, ACCESS_TOKEN, SUBMIT_DESTINATION);

    expect(fake.watchCalls).toHaveLength(1);
    expect(fake.watchCalls[0].destination).toBe(TOPIC);
    expect(fake.watchCalls[0].headers).toEqual({ 'access-token': ACCESS_TOKEN });
  });

  it('additionally subscribes to the facilitator topic when provided', () => {
    service.connect(TOPIC, ACCESS_TOKEN, SUBMIT_DESTINATION, FACILITATOR_TOPIC);

    expect(fake.watchCalls).toHaveLength(2);
    expect(fake.watchCalls[1].destination).toBe(FACILITATOR_TOPIC);
    expect(fake.watchCalls[1].headers).toEqual({ 'access-token': ACCESS_TOKEN });
  });

  it('does not subscribe to a facilitator topic when none is provided (non-facilitator participant)', () => {
    service.connect(TOPIC, ACCESS_TOKEN, SUBMIT_DESTINATION, null);

    expect(fake.watchCalls).toHaveLength(1);
  });

  it('starts in the "connecting" status', () => {
    service.connect(TOPIC, ACCESS_TOKEN, SUBMIT_DESTINATION);
    expect(service.status()).toBe('connecting');
  });

  it('transitions to "connected" once the STOMP connection opens', () => {
    service.connect(TOPIC, ACCESS_TOKEN, SUBMIT_DESTINATION);
    fake.connectionState$.next(RxStompState.CONNECTING);
    fake.connectionState$.next(RxStompState.OPEN);
    expect(service.status()).toBe('connected');
  });

  it('transitions to "error" when the connection drops after having connected', () => {
    service.connect(TOPIC, ACCESS_TOKEN, SUBMIT_DESTINATION);
    fake.connectionState$.next(RxStompState.CONNECTING);
    fake.connectionState$.next(RxStompState.OPEN);
    fake.connectionState$.next(RxStompState.CLOSED);
    expect(service.status()).toBe('error');
  });

  it('transitions to "error" on a STOMP ERROR frame (e.g. rejected access token)', () => {
    service.connect(TOPIC, ACCESS_TOKEN, SUBMIT_DESTINATION);
    fake.stompErrors$.next({});
    expect(service.status()).toBe('error');
  });

  // ── topicMessages$ / facilitatorMessages$ ──

  it('forwards raw message bodies received on the regular topic to topicMessages$', () => {
    service.connect(TOPIC, ACCESS_TOKEN, SUBMIT_DESTINATION);
    const received: string[] = [];
    service.topicMessages$.subscribe(body => received.push(body));

    fake.emit(TOPIC, '{"type":"CARD_ADDED","columnKey":"went-well","cardCount":1}');

    expect(received).toEqual(['{"type":"CARD_ADDED","columnKey":"went-well","cardCount":1}']);
  });

  it('forwards raw message bodies received on the facilitator topic to facilitatorMessages$ only', () => {
    service.connect(TOPIC, ACCESS_TOKEN, SUBMIT_DESTINATION, FACILITATOR_TOPIC);
    const topicReceived: string[] = [];
    const facilitatorReceived: string[] = [];
    service.topicMessages$.subscribe(body => topicReceived.push(body));
    service.facilitatorMessages$.subscribe(body => facilitatorReceived.push(body));

    fake.emit(FACILITATOR_TOPIC, '{"type":"CARD_ADDED","content":"secret"}');

    expect(facilitatorReceived).toEqual(['{"type":"CARD_ADDED","content":"secret"}']);
    expect(topicReceived).toHaveLength(0);
  });

  // ── submitCard() ──

  it('publishes the card as JSON to the submit destination with the access token header', () => {
    service.connect(TOPIC, ACCESS_TOKEN, SUBMIT_DESTINATION);

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
    service.connect(TOPIC, ACCESS_TOKEN, SUBMIT_DESTINATION);
    service.disconnect();

    service.submitCard({ content: 'x', columnKey: 'y', anonymous: false });

    expect(fake.publishCalls).toHaveLength(0);
  });

  // ── disconnect() ──

  it('disconnect() deactivates the client', () => {
    service.connect(TOPIC, ACCESS_TOKEN, SUBMIT_DESTINATION);
    service.disconnect();
    expect(fake.deactivateCalls).toBeGreaterThanOrEqual(1);
  });

  it('disconnect() stops applying subsequent incoming messages', () => {
    service.connect(TOPIC, ACCESS_TOKEN, SUBMIT_DESTINATION);
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
    service.connect(TOPIC, ACCESS_TOKEN, SUBMIT_DESTINATION);
    const firstFake = fake;

    activeFake.current = new FakeRxStomp();
    service.connect(TOPIC, ACCESS_TOKEN, SUBMIT_DESTINATION);

    expect(firstFake.deactivateCalls).toBeGreaterThanOrEqual(1);
  });

  it('resolves a relative environment.wsUrl (nginx-proxied prod build) against the page origin', () => {
    const original = environment.wsUrl;
    environment.wsUrl = '/ws/agilite';
    try {
      service.connect(TOPIC, ACCESS_TOKEN, SUBMIT_DESTINATION);
      const cfg = fake.configureCalls[0] as { brokerURL: string };
      const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
      expect(cfg.brokerURL).toBe(`${scheme}://${window.location.host}/ws/agilite`);
    } finally {
      environment.wsUrl = original;
    }
  });
});

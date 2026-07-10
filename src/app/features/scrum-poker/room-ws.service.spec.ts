import { TestBed } from '@angular/core/testing';
import { RxStompState } from '@stomp/rx-stomp';
import { Subject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { RoomWsService, STOMP_CLIENT_FACTORY, StompClient } from './room-ws.service';

/**
 * Minimal fake standing in for `@stomp/rx-stomp`'s `RxStomp`, substituted via
 * `STOMP_CLIENT_FACTORY` (Angular DI) rather than an ES-module mock — see `room-ws.service.ts`'s
 * `StompClient` TSDoc for why: mocking the `@stomp/rx-stomp` module itself proved unreliable
 * under this repo's CI runner (the mock didn't consistently intercept the import actually used
 * by the service, so tests silently exercised a real, unmocked `RxStomp`). DI substitution has
 * no such failure mode.
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

const ROOM_ID = '9f4e6b1a-6c3d-4b8e-8f2a-1234567890ab';
const TOPIC = `/topic/agilite/poker/${ROOM_ID}`;
const ACCESS_TOKEN = 'opaque-access-token';

describe('RoomWsService', () => {
  let service: RoomWsService;
  let fake: FakeRxStomp;
  let activeFake: { current: FakeRxStomp };

  beforeEach(() => {
    fake = new FakeRxStomp();
    activeFake = { current: fake };

    TestBed.configureTestingModule({
      providers: [{ provide: STOMP_CLIENT_FACTORY, useValue: () => activeFake.current }],
    });
    service = TestBed.inject(RoomWsService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ── connect() ──

  it('configures the STOMP client with the dev broker URL derived from environment.wsUrl and activates it', () => {
    service.connect(TOPIC, ACCESS_TOKEN, ROOM_ID);

    const cfg = fake.configureCalls[0] as { brokerURL: string };
    expect(cfg.brokerURL).toBe('ws://localhost:8082/ws/agilite');
    expect(fake.activateCalls).toBe(1);
  });

  it('subscribes to the given topic, presenting the access token on the native "access-token" header', () => {
    service.connect(TOPIC, ACCESS_TOKEN, ROOM_ID);

    expect(fake.watchCalls).toHaveLength(1);
    expect(fake.watchCalls[0].destination).toBe(TOPIC);
    expect(fake.watchCalls[0].headers).toEqual({ 'access-token': ACCESS_TOKEN });
  });

  it('starts in the "connecting" status', () => {
    service.connect(TOPIC, ACCESS_TOKEN, ROOM_ID);
    expect(service.status()).toBe('connecting');
  });

  it('transitions to "connected" once the STOMP connection opens', () => {
    service.connect(TOPIC, ACCESS_TOKEN, ROOM_ID);
    fake.connectionState$.next(RxStompState.CONNECTING);
    fake.connectionState$.next(RxStompState.OPEN);
    expect(service.status()).toBe('connected');
  });

  it('ignores a CLOSED emission before any CONNECTING (initial BehaviorSubject replay)', () => {
    service.connect(TOPIC, ACCESS_TOKEN, ROOM_ID);
    fake.connectionState$.next(RxStompState.CLOSED);
    expect(service.status()).toBe('connecting');
  });

  it('transitions to "error" when the connection drops after having connected', () => {
    service.connect(TOPIC, ACCESS_TOKEN, ROOM_ID);
    fake.connectionState$.next(RxStompState.CONNECTING);
    fake.connectionState$.next(RxStompState.OPEN);
    fake.connectionState$.next(RxStompState.CLOSED);
    expect(service.status()).toBe('error');
  });

  it('transitions to "error" on a STOMP ERROR frame (e.g. rejected access token)', () => {
    service.connect(TOPIC, ACCESS_TOKEN, ROOM_ID);
    fake.stompErrors$.next({});
    expect(service.status()).toBe('error');
  });

  it('a transient CLOSING state does not change the status', () => {
    service.connect(TOPIC, ACCESS_TOKEN, ROOM_ID);
    fake.connectionState$.next(RxStompState.CONNECTING);
    fake.connectionState$.next(RxStompState.OPEN);
    fake.connectionState$.next(RxStompState.CLOSING);
    expect(service.status()).toBe('connected');
  });

  it('resolves a relative environment.wsUrl (nginx-proxied prod build) against the page origin', () => {
    const original = environment.wsUrl;
    environment.wsUrl = '/ws/agilite';
    try {
      service.connect(TOPIC, ACCESS_TOKEN, ROOM_ID);
      const cfg = fake.configureCalls[0] as { brokerURL: string };
      const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
      expect(cfg.brokerURL).toBe(`${scheme}://${window.location.host}/ws/agilite`);
    } finally {
      environment.wsUrl = original;
    }
  });

  it('resets to "connecting" on a fresh connect() call after a prior error', () => {
    service.connect(TOPIC, ACCESS_TOKEN, ROOM_ID);
    fake.connectionState$.next(RxStompState.CONNECTING);
    fake.connectionState$.next(RxStompState.CLOSED);
    expect(service.status()).toBe('error');

    activeFake.current = new FakeRxStomp();
    service.connect(TOPIC, ACCESS_TOKEN, ROOM_ID);
    expect(service.status()).toBe('connecting');
  });

  // ── messages$ ──

  it('forwards raw message bodies received on the subscribed topic', () => {
    service.connect(TOPIC, ACCESS_TOKEN, ROOM_ID);
    const received: string[] = [];
    service.messages$.subscribe(body => received.push(body));

    fake.emit(TOPIC, '{"type":"PING"}');

    expect(received).toEqual(['{"type":"PING"}']);
  });

  // ── disconnect() ──

  it('disconnect() deactivates the client', () => {
    service.connect(TOPIC, ACCESS_TOKEN, ROOM_ID);
    service.disconnect();
    expect(fake.deactivateCalls).toBeGreaterThanOrEqual(1);
  });

  it('disconnect() stops applying subsequent incoming messages', () => {
    service.connect(TOPIC, ACCESS_TOKEN, ROOM_ID);
    const received: string[] = [];
    service.messages$.subscribe(body => received.push(body));
    service.disconnect();

    fake.emit(TOPIC, '{"type":"PING"}');
    expect(received).toHaveLength(0);
  });

  it('disconnect() is safe to call without a prior connect()', () => {
    expect(() => service.disconnect()).not.toThrow();
  });

  it('connect() calls disconnect() first, tearing down any prior connection', () => {
    service.connect(TOPIC, ACCESS_TOKEN, ROOM_ID);
    const firstFake = fake;

    activeFake.current = new FakeRxStomp();
    service.connect(TOPIC, ACCESS_TOKEN, ROOM_ID);

    expect(firstFake.deactivateCalls).toBeGreaterThanOrEqual(1);
  });

  // ── submitVote() (US09.2.1) ──

  it('submitVote() publishes to the room vote destination with the access-token header', () => {
    service.connect(TOPIC, ACCESS_TOKEN, ROOM_ID);

    service.submitVote({ ticketId: 'ticket-1', value: '5' });

    expect(fake.publishCalls).toHaveLength(1);
    expect(fake.publishCalls[0].destination).toBe(`/app/agilite/poker/${ROOM_ID}/vote`);
    expect(fake.publishCalls[0].headers).toEqual({ 'access-token': ACCESS_TOKEN });
    expect(JSON.parse(fake.publishCalls[0].body)).toEqual({ ticketId: 'ticket-1', value: '5' });
  });

  it('submitVote() no-ops without a prior connect()', () => {
    expect(() => service.submitVote({ ticketId: 'ticket-1', value: '5' })).not.toThrow();
    expect(fake.publishCalls).toHaveLength(0);
  });

  it('submitVote() no-ops after disconnect()', () => {
    service.connect(TOPIC, ACCESS_TOKEN, ROOM_ID);
    service.disconnect();

    service.submitVote({ ticketId: 'ticket-1', value: '5' });

    expect(fake.publishCalls).toHaveLength(0);
  });
});

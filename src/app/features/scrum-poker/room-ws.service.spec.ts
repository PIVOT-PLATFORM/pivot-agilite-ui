import { TestBed } from '@angular/core/testing';
import { RxStompState } from '@stomp/rx-stomp';
import { Subject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { RoomWsService } from './room-ws.service';

// `RxStompState` is a plain 4-value enum (CONNECTING/OPEN/CLOSING/CLOSED) — reconstructed here
// instead of re-exported via `importOriginal` to avoid a module-hoisting TDZ issue between this
// factory and the service's own top-level `@stomp/rx-stomp` import.
//
// `mockActiveFake` is set up once, here, as the `RxStomp` mock's *only* implementation — the
// `mock`-prefixed name lets Vitest hoist its declaration above this `vi.mock()` call (factories
// run before any other module-scope code, so an un-prefixed `const` would still be in its
// temporal dead zone when this factory executes). Each test only ever mutates
// `mockActiveFake.current` (a plain object property, never touched by `vi.restoreAllMocks()`)
// rather than re-installing a fresh `mockImplementation()` per test — re-installing it turned
// out to be flaky under this repo's CI runner (a `new RxStomp()` call would occasionally
// resolve to a stale fake from an earlier test), so the implementation itself is now fixed for
// the whole file and only the *data* it reads is swapped between tests.
const mockActiveFake: { current: FakeRxStomp | null } = { current: null };

vi.mock('@stomp/rx-stomp', () => ({
  RxStomp: vi.fn(function (this: unknown) {
    return mockActiveFake.current;
  }),
  RxStompState: { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 },
}));

/** Minimal fake standing in for `@stomp/rx-stomp`'s `RxStomp`, fully test-driven. */
class FakeRxStomp {
  readonly connectionState$ = new Subject<RxStompState>();
  readonly stompErrors$ = new Subject<unknown>();
  readonly configureCalls: unknown[] = [];
  activateCalls = 0;
  deactivateCalls = 0;
  readonly watchCalls: { destination: string; headers?: Record<string, string> }[] = [];
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

const TOPIC = '/topic/agilite/poker/9f4e6b1a-6c3d-4b8e-8f2a-1234567890ab';
const ACCESS_TOKEN = 'opaque-access-token';

describe('RoomWsService', () => {
  let service: RoomWsService;
  let fake: FakeRxStomp;

  beforeEach(() => {
    fake = new FakeRxStomp();
    mockActiveFake.current = fake;

    TestBed.configureTestingModule({});
    service = TestBed.inject(RoomWsService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ── connect() ──

  it('configures RxStomp with the dev broker URL derived from environment.wsUrl and activates it', () => {
    service.connect(TOPIC, ACCESS_TOKEN);

    const cfg = fake.configureCalls[0] as { brokerURL: string };
    expect(cfg.brokerURL).toBe('ws://localhost:8082/ws/agilite');
    expect(fake.activateCalls).toBe(1);
  });

  it('subscribes to the given topic, presenting the access token on the native "access-token" header', () => {
    service.connect(TOPIC, ACCESS_TOKEN);

    expect(fake.watchCalls).toHaveLength(1);
    expect(fake.watchCalls[0].destination).toBe(TOPIC);
    expect(fake.watchCalls[0].headers).toEqual({ 'access-token': ACCESS_TOKEN });
  });

  it('starts in the "connecting" status', () => {
    service.connect(TOPIC, ACCESS_TOKEN);
    expect(service.status()).toBe('connecting');
  });

  it('transitions to "connected" once the STOMP connection opens', () => {
    service.connect(TOPIC, ACCESS_TOKEN);
    fake.connectionState$.next(RxStompState.CONNECTING);
    fake.connectionState$.next(RxStompState.OPEN);
    expect(service.status()).toBe('connected');
  });

  it('ignores a CLOSED emission before any CONNECTING (initial BehaviorSubject replay)', () => {
    service.connect(TOPIC, ACCESS_TOKEN);
    fake.connectionState$.next(RxStompState.CLOSED);
    expect(service.status()).toBe('connecting');
  });

  it('transitions to "error" when the connection drops after having connected', () => {
    service.connect(TOPIC, ACCESS_TOKEN);
    fake.connectionState$.next(RxStompState.CONNECTING);
    fake.connectionState$.next(RxStompState.OPEN);
    fake.connectionState$.next(RxStompState.CLOSED);
    expect(service.status()).toBe('error');
  });

  it('transitions to "error" on a STOMP ERROR frame (e.g. rejected access token)', () => {
    service.connect(TOPIC, ACCESS_TOKEN);
    fake.stompErrors$.next({});
    expect(service.status()).toBe('error');
  });

  it('a transient CLOSING state does not change the status', () => {
    service.connect(TOPIC, ACCESS_TOKEN);
    fake.connectionState$.next(RxStompState.CONNECTING);
    fake.connectionState$.next(RxStompState.OPEN);
    fake.connectionState$.next(RxStompState.CLOSING);
    expect(service.status()).toBe('connected');
  });

  it('resolves a relative environment.wsUrl (nginx-proxied prod build) against the page origin', () => {
    const original = environment.wsUrl;
    environment.wsUrl = '/ws/agilite';
    try {
      service.connect(TOPIC, ACCESS_TOKEN);
      const cfg = fake.configureCalls[0] as { brokerURL: string };
      const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
      expect(cfg.brokerURL).toBe(`${scheme}://${window.location.host}/ws/agilite`);
    } finally {
      environment.wsUrl = original;
    }
  });

  it('resets to "connecting" on a fresh connect() call after a prior error', () => {
    service.connect(TOPIC, ACCESS_TOKEN);
    fake.connectionState$.next(RxStompState.CONNECTING);
    fake.connectionState$.next(RxStompState.CLOSED);
    expect(service.status()).toBe('error');

    mockActiveFake.current = new FakeRxStomp();
    service.connect(TOPIC, ACCESS_TOKEN);
    expect(service.status()).toBe('connecting');
  });

  // ── messages$ ──

  it('forwards raw message bodies received on the subscribed topic', () => {
    service.connect(TOPIC, ACCESS_TOKEN);
    const received: string[] = [];
    service.messages$.subscribe(body => received.push(body));

    fake.emit(TOPIC, '{"type":"PING"}');

    expect(received).toEqual(['{"type":"PING"}']);
  });

  // ── disconnect() ──

  it('disconnect() deactivates the client', () => {
    service.connect(TOPIC, ACCESS_TOKEN);
    service.disconnect();
    expect(fake.deactivateCalls).toBeGreaterThanOrEqual(1);
  });

  it('disconnect() stops applying subsequent incoming messages', () => {
    service.connect(TOPIC, ACCESS_TOKEN);
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
    service.connect(TOPIC, ACCESS_TOKEN);
    const firstFake = fake;

    mockActiveFake.current = new FakeRxStomp();
    service.connect(TOPIC, ACCESS_TOKEN);

    expect(firstFake.deactivateCalls).toBeGreaterThanOrEqual(1);
  });
});

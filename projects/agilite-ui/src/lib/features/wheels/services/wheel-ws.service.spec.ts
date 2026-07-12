import { TestBed } from '@angular/core/testing';
import { RxStompState } from '@stomp/rx-stomp';
import { Subject } from 'rxjs';
import { AGILITE_WS_URL } from '../../../core/config/tokens';
import { StompClient, WHEEL_STOMP_CLIENT_FACTORY, WheelWsService, wheelTopic } from './wheel-ws.service';

/**
 * Minimal fake standing in for `@stomp/rx-stomp`'s `RxStomp`, substituted via
 * `WHEEL_STOMP_CLIENT_FACTORY` (Angular DI) — see `room-ws.service.ts`'s `StompClient` TSDoc for
 * why DI substitution is required over ES-module mocking in this repo's CI runner.
 */
class FakeRxStomp implements StompClient {
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

const WHEEL_ID = '9f4e6b1a-6c3d-4b8e-8f2a-1234567890ab';
const AUTH_TOKEN = 'a-real-bearer-token';

describe('WheelWsService', () => {
  let service: WheelWsService;
  let fake: FakeRxStomp;
  let activeFake: { current: FakeRxStomp };

  beforeEach(() => {
    fake = new FakeRxStomp();
    activeFake = { current: fake };

    TestBed.configureTestingModule({
      providers: [{ provide: WHEEL_STOMP_CLIENT_FACTORY, useValue: () => activeFake.current }],
    });
    service = TestBed.inject(WheelWsService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ── wheelTopic() ──

  it('builds the wheel topic destination matching the backend contract', () => {
    expect(wheelTopic(WHEEL_ID)).toBe(`/topic/agilite/wheels/${WHEEL_ID}`);
  });

  // ── connect() ──

  it('configures the STOMP client with the dev broker URL derived from environment.wsUrl and activates it', () => {
    service.connect(WHEEL_ID, AUTH_TOKEN);

    const cfg = fake.configureCalls[0] as { brokerURL: string };
    expect(cfg.brokerURL).toBe('ws://localhost:8082/ws/agilite');
    expect(fake.activateCalls).toBe(1);
  });

  it('subscribes to the wheel topic, presenting the bearer token on the native "Authorization" header', () => {
    service.connect(WHEEL_ID, AUTH_TOKEN);

    expect(fake.watchCalls).toHaveLength(1);
    expect(fake.watchCalls[0].destination).toBe(wheelTopic(WHEEL_ID));
    expect(fake.watchCalls[0].headers).toEqual({ Authorization: `Bearer ${AUTH_TOKEN}` });
  });

  it('subscribes with no headers at all when no auth token is available (EN17.3 gap)', () => {
    service.connect(WHEEL_ID, null);

    expect(fake.watchCalls[0].headers).toBeUndefined();
  });

  it('starts in the "connecting" status', () => {
    service.connect(WHEEL_ID, AUTH_TOKEN);
    expect(service.status()).toBe('connecting');
  });

  it('transitions to "connected" once the STOMP connection opens', () => {
    service.connect(WHEEL_ID, AUTH_TOKEN);
    fake.connectionState$.next(RxStompState.CONNECTING);
    fake.connectionState$.next(RxStompState.OPEN);
    expect(service.status()).toBe('connected');
  });

  it('ignores a CLOSED emission before any CONNECTING (initial BehaviorSubject replay)', () => {
    service.connect(WHEEL_ID, AUTH_TOKEN);
    fake.connectionState$.next(RxStompState.CLOSED);
    expect(service.status()).toBe('connecting');
  });

  it('transitions to "error" when the connection drops after having connected', () => {
    service.connect(WHEEL_ID, AUTH_TOKEN);
    fake.connectionState$.next(RxStompState.CONNECTING);
    fake.connectionState$.next(RxStompState.OPEN);
    fake.connectionState$.next(RxStompState.CLOSED);
    expect(service.status()).toBe('error');
  });

  it('transitions to "error" on a STOMP ERROR frame (e.g. rejected/missing token)', () => {
    service.connect(WHEEL_ID, AUTH_TOKEN);
    fake.stompErrors$.next({});
    expect(service.status()).toBe('error');
  });

  it('a transient CLOSING state does not change the status', () => {
    service.connect(WHEEL_ID, AUTH_TOKEN);
    fake.connectionState$.next(RxStompState.CONNECTING);
    fake.connectionState$.next(RxStompState.OPEN);
    fake.connectionState$.next(RxStompState.CLOSING);
    expect(service.status()).toBe('connected');
  });

  it('resolves a relative wsUrl (nginx-proxied prod build) against the page origin', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: WHEEL_STOMP_CLIENT_FACTORY, useValue: () => activeFake.current },
        { provide: AGILITE_WS_URL, useValue: '/ws/agilite' },
      ],
    });
    const relService = TestBed.inject(WheelWsService);
    relService.connect(WHEEL_ID, AUTH_TOKEN);
    const cfg = fake.configureCalls[0] as { brokerURL: string };
    const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
    expect(cfg.brokerURL).toBe(`${scheme}://${window.location.host}/ws/agilite`);
  });

  it('resets to "connecting" on a fresh connect() call after a prior error', () => {
    service.connect(WHEEL_ID, AUTH_TOKEN);
    fake.connectionState$.next(RxStompState.CONNECTING);
    fake.connectionState$.next(RxStompState.CLOSED);
    expect(service.status()).toBe('error');

    activeFake.current = new FakeRxStomp();
    service.connect(WHEEL_ID, AUTH_TOKEN);
    expect(service.status()).toBe('connecting');
  });

  // ── messages$ ──

  it('forwards raw message bodies received on the subscribed wheel topic', () => {
    service.connect(WHEEL_ID, AUTH_TOKEN);
    const received: string[] = [];
    service.messages$.subscribe(body => received.push(body));

    fake.emit(wheelTopic(WHEEL_ID), '{"wheelId":"' + WHEEL_ID + '","label":"Solo"}');

    expect(received).toEqual([`{"wheelId":"${WHEEL_ID}","label":"Solo"}`]);
  });

  // ── disconnect() ──

  it('disconnect() deactivates the client', () => {
    service.connect(WHEEL_ID, AUTH_TOKEN);
    service.disconnect();
    expect(fake.deactivateCalls).toBeGreaterThanOrEqual(1);
  });

  it('disconnect() stops applying subsequent incoming messages', () => {
    service.connect(WHEEL_ID, AUTH_TOKEN);
    const received: string[] = [];
    service.messages$.subscribe(body => received.push(body));
    service.disconnect();

    fake.emit(wheelTopic(WHEEL_ID), '{"label":"Solo"}');
    expect(received).toHaveLength(0);
  });

  it('disconnect() is safe to call without a prior connect()', () => {
    expect(() => service.disconnect()).not.toThrow();
  });

  it('connect() calls disconnect() first, tearing down any prior connection', () => {
    service.connect(WHEEL_ID, AUTH_TOKEN);
    const firstFake = fake;

    activeFake.current = new FakeRxStomp();
    service.connect(WHEEL_ID, AUTH_TOKEN);

    expect(firstFake.deactivateCalls).toBeGreaterThanOrEqual(1);
  });
});

import { Injectable, InjectionToken, inject, signal } from '@angular/core';
import { RxStomp, RxStompState } from '@stomp/rx-stomp';
import { Observable, Subject, Subscription } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SubmitVoteRequest } from './ticket.model';

/**
 * Native STOMP header carrying the room-scoped access token returned by
 * `POST /poker/rooms/join`. Name fixed by the backend contract — read there via
 * `PokerChannelInterceptor.ACCESS_TOKEN_HEADER` / `getFirstNativeHeader("access-token")`.
 */
const ACCESS_TOKEN_HEADER = 'access-token';

/** UI connection status for the STOMP link opened after joining a room (US09.1.2 AC). */
export type RoomConnectionStatus = 'connecting' | 'connected' | 'error';

/**
 * The minimal slice of `@stomp/rx-stomp`'s `RxStomp` surface this service depends on. Exists so
 * tests can substitute a fully fake client via Angular DI ({@link STOMP_CLIENT_FACTORY}) instead
 * of mocking the `@stomp/rx-stomp` ES module directly — module-level mocking of this package
 * proved unreliable under this repo's CI runner (a `vi.mock('@stomp/rx-stomp', ...)` factory did
 * not consistently intercept the import actually used by this service, so `new RxStomp()`
 * silently constructed the *real* client in CI while working locally). DI substitution has no
 * such failure mode: Angular's `TestBed` provider override is not affected by module transform/
 * bundling differences between environments.
 */
export interface StompClient {
  readonly connectionState$: Observable<RxStompState>;
  readonly stompErrors$: Observable<unknown>;
  configure(config: { brokerURL: string }): void;
  activate(): void;
  deactivate(): Promise<unknown>;
  watch(destination: string, headers?: Record<string, string>): Observable<{ body: string }>;
  publish(params: { destination: string; body: string; headers?: Record<string, string> }): void;
}

/**
 * Factory producing the {@link StompClient} used by {@link RoomWsService.connect}. Defaults to a
 * real `RxStomp` instance; overridden in tests via
 * `{ provide: STOMP_CLIENT_FACTORY, useValue: () => fake }`.
 */
export const STOMP_CLIENT_FACTORY = new InjectionToken<() => StompClient>('STOMP_CLIENT_FACTORY', {
  providedIn: 'root',
  factory: () => () => new RxStomp(),
});

/**
 * Minimal STOMP client wrapper for a single planning poker room (US09.1.2).
 *
 * Wraps `@stomp/rx-stomp`'s `RxStomp` to connect to the **native** (non-SockJS) `/ws/agilite`
 * endpoint — the backend's `WebSocketConfig` registers it without `.withSockJS()` — and
 * subscribe to the room's `wsTopic`. The room-scoped `accessToken` from the join response is
 * presented on the STOMP **native header** `access-token`, attached to the SUBSCRIBE frame
 * (not CONNECT): the token proves membership in *this* room, not the caller's whole session,
 * so it only needs to accompany the subscription to that room's topic.
 *
 * Deliberately narrow in scope — one room per service instance, no generic multi-domain WS
 * abstraction, no message parsing/typing beyond raw bodies. Connection state is exposed as a
 * `signal` (this repo's established local-state primitive, see `CLAUDE.md`) rather than an
 * `Observable`, mirroring the equivalent continuous-state fields already used by other module's
 * own STOMP wrapper (e.g. `WhiteboardSyncService.status` in pivot-collaboratif-ui); discrete
 * incoming frames are exposed as an `Observable` ({@link messages$}), same as that precedent's
 * `remoteActions$`.
 *
 * <p>Since US09.2.1, also supports **publishing** (vote submission) via {@link submitVote} —
 * mirrors `pivot-agilite-core`'s retro STOMP wrapper (`RetroSessionWsService.submitCard`), which
 * added the same capability on top of an initially watch-only service.
 */
@Injectable({ providedIn: 'root' })
export class RoomWsService {
  private readonly createClient = inject(STOMP_CLIENT_FACTORY);

  /** Current connection status — drives the connecting/connected/error UI (US09.1.2 AC). */
  readonly status = signal<RoomConnectionStatus>('connecting');

  /** Raw STOMP message bodies received on the subscribed room topic. */
  readonly messages$ = new Subject<string>();

  private client: StompClient | null = null;
  private topicSubscription: Subscription | null = null;
  private stateSubscription: Subscription | null = null;
  private stompErrorSubscription: Subscription | null = null;
  private roomId: string | null = null;
  private accessToken: string | null = null;
  /**
   * True once a `CONNECTING` state has actually been observed. `RxStomp#connectionState$` is
   * a `BehaviorSubject` seeded with `CLOSED` *before* the first connection attempt — without
   * this guard, subscribing to it would immediately replay that stale `CLOSED` value and flip
   * {@link status} to `'error'` right after `connect()` sets it to `'connecting'`.
   */
  private everConnecting = false;

  /**
   * Connects to `/ws/agilite` and subscribes to the given room topic, presenting the
   * room-scoped access token on the native `access-token` header. Safe to call once per join;
   * call {@link disconnect} first to switch rooms on the same service instance.
   *
   * @param topic the room's STOMP destination (`wsTopic` from the join/creation response)
   * @param accessToken the opaque, room-scoped access token from the join/creation response
   * @param roomId the room's id — stored so {@link submitVote} can address the room's vote
   *   application destination (US09.2.1) without the caller having to pass it again on every vote
   */
  connect(topic: string, accessToken: string, roomId: string): void {
    this.disconnect();
    this.everConnecting = false;
    this.status.set('connecting');
    this.roomId = roomId;
    this.accessToken = accessToken;

    const client = this.createClient();
    client.configure({ brokerURL: this.buildWsUrl() });
    this.client = client;

    this.stateSubscription = client.connectionState$.subscribe(state => this.onStateChange(state));
    this.stompErrorSubscription = client.stompErrors$.subscribe(() => this.status.set('error'));
    this.topicSubscription = client
      .watch(topic, { [ACCESS_TOKEN_HEADER]: accessToken })
      .subscribe(message => this.messages$.next(message.body));

    client.activate();
  }

  /**
   * Submits (or changes) a vote on a ticket (US09.2.1), over STOMP SEND to
   * `/app/agilite/poker/{roomId}/vote`. No-ops (does nothing) if {@link connect} was never
   * called or the connection has since been torn down.
   *
   * @param request the ticket id and chosen card value
   */
  submitVote(request: SubmitVoteRequest): void {
    if (!this.client || !this.roomId || !this.accessToken) {
      return;
    }
    this.client.publish({
      destination: `/app/agilite/poker/${this.roomId}/vote`,
      body: JSON.stringify(request),
      headers: { [ACCESS_TOKEN_HEADER]: this.accessToken },
    });
  }

  /**
   * Tears down the STOMP connection and its subscriptions. Safe to call repeatedly, including
   * before any {@link connect} call.
   */
  disconnect(): void {
    this.topicSubscription?.unsubscribe();
    this.stateSubscription?.unsubscribe();
    this.stompErrorSubscription?.unsubscribe();
    this.topicSubscription = null;
    this.stateSubscription = null;
    this.stompErrorSubscription = null;
    this.roomId = null;
    this.accessToken = null;

    void this.client?.deactivate();
    this.client = null;
  }

  private onStateChange(state: RxStompState): void {
    switch (state) {
      case RxStompState.CONNECTING:
        this.everConnecting = true;
        this.status.set('connecting');
        break;
      case RxStompState.OPEN:
        this.status.set('connected');
        break;
      case RxStompState.CLOSED:
        if (this.everConnecting) {
          this.status.set('error');
        }
        break;
      case RxStompState.CLOSING:
        break;
    }
  }

  /**
   * Derives the STOMP broker URL from {@link environment.wsUrl}. The dev environment exposes
   * an absolute `ws://` URL directly; the nginx-proxied production build uses a relative path
   * (mirrors `environment.prod.ts`'s handling of `apiUrl`), resolved here against the current
   * page origin.
   */
  private buildWsUrl(): string {
    const wsUrl = environment.wsUrl;
    if (/^wss?:\/\//.test(wsUrl)) {
      return wsUrl;
    }
    const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${scheme}://${window.location.host}${wsUrl}`;
  }
}

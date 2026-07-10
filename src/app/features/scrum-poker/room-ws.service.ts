import { Injectable, signal } from '@angular/core';
import { RxStomp, RxStompState } from '@stomp/rx-stomp';
import { Subject, Subscription } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * Native STOMP header carrying the room-scoped access token returned by
 * `POST /poker/rooms/join`. Name fixed by the backend contract — read there via
 * `PokerChannelInterceptor.ACCESS_TOKEN_HEADER` / `getFirstNativeHeader("access-token")`.
 */
const ACCESS_TOKEN_HEADER = 'access-token';

/** UI connection status for the STOMP link opened after joining a room (US09.1.2 AC). */
export type RoomConnectionStatus = 'connecting' | 'connected' | 'error';

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
 * abstraction, no message parsing/typing beyond raw bodies. No other feature in this repo
 * consumes STOMP yet; a future US adding ticket/vote messages can build on {@link messages$}
 * without changing this connection contract. Connection state is exposed as a `signal` (this
 * repo's established local-state primitive, see `CLAUDE.md`) rather than an `Observable`,
 * mirroring the equivalent continuous-state fields already used by other module's own
 * STOMP wrapper (e.g. `WhiteboardSyncService.status` in pivot-collaboratif-ui); discrete
 * incoming frames are exposed as an `Observable` ({@link messages$}), same as that
 * precedent's `remoteActions$`.
 */
@Injectable({ providedIn: 'root' })
export class RoomWsService {
  /** Current connection status — drives the connecting/connected/error UI (US09.1.2 AC). */
  readonly status = signal<RoomConnectionStatus>('connecting');

  /** Raw STOMP message bodies received on the subscribed room topic. */
  readonly messages$ = new Subject<string>();

  private rxStomp: RxStomp | null = null;
  private topicSubscription: Subscription | null = null;
  private stateSubscription: Subscription | null = null;
  private stompErrorSubscription: Subscription | null = null;
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
   * @param topic the room's STOMP destination (`wsTopic` from the join response)
   * @param accessToken the opaque, room-scoped access token from the join response
   */
  connect(topic: string, accessToken: string): void {
    this.disconnect();
    this.everConnecting = false;
    this.status.set('connecting');

    const rxStomp = new RxStomp();
    rxStomp.configure({ brokerURL: this.buildWsUrl() });
    this.rxStomp = rxStomp;

    this.stateSubscription = rxStomp.connectionState$.subscribe(state => this.onStateChange(state));
    this.stompErrorSubscription = rxStomp.stompErrors$.subscribe(() => this.status.set('error'));
    this.topicSubscription = rxStomp
      .watch(topic, { [ACCESS_TOKEN_HEADER]: accessToken })
      .subscribe(message => this.messages$.next(message.body));

    rxStomp.activate();
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

    void this.rxStomp?.deactivate();
    this.rxStomp = null;
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

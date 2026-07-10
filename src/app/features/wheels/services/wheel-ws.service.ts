import { Injectable, InjectionToken, inject, signal } from '@angular/core';
import { RxStomp, RxStompState } from '@stomp/rx-stomp';
import { Observable, Subject, Subscription } from 'rxjs';
import { environment } from '../../../../environments/environment';

/**
 * Native STOMP header carrying the caller's real platform bearer token — same header name and
 * `Bearer ` prefix convention as the `Authorization` HTTP header `WheelApiService` will attach
 * once `@pivot/ui-core`'s `AuthInterceptor` exists (EN17.3). Deliberately **not** the
 * `access-token` header used by `RoomWsService`/`RetroSessionWsService`: that header carries an
 * opaque, session-scoped grant minted by a join flow — a wheel has no such flow, its WebSocket
 * subscription is authorized the exact same way as its REST endpoints (see backend
 * `WheelChannelInterceptor`, US14.3.1).
 */
const AUTHORIZATION_HEADER = 'Authorization';

/** Prefix for a wheel's broadcast topic — mirrors backend `WheelDestinations.TOPIC_WHEEL_PREFIX`. */
const TOPIC_WHEEL_PREFIX = '/topic/agilite/wheels/';

/**
 * Builds the STOMP topic destination for a given wheel, mirroring backend
 * `WheelDestinations#wheelTopic`.
 *
 * @param wheelId the wheel's identifier
 * @returns `/topic/agilite/wheels/{wheelId}`
 */
export function wheelTopic(wheelId: string): string {
  return `${TOPIC_WHEEL_PREFIX}${wheelId}`;
}

/** UI connection status for the STOMP link opened while viewing a wheel (US14.3.1). */
export type WheelWsConnectionStatus = 'connecting' | 'connected' | 'error';

/**
 * The minimal slice of `@stomp/rx-stomp`'s `RxStomp` surface this service depends on.
 *
 * Duplicated from `scrum-poker/room-ws.service.ts`'s/`retro/data-access/retro-ws.service.ts`'s
 * identical `StompClient` interface/`STOMP_CLIENT_FACTORY` token rather than imported across
 * feature folders — mirrors this codebase's own established convention of small, domain-scoped
 * duplication over a premature cross-feature abstraction (see backend's `PokerRoomDestinations`/
 * `RetroSessionDestinations`/`WheelDestinations` for the same pattern). See `room-ws.service.ts`'s
 * TSDoc for why DI substitution (not `vi.mock('@stomp/rx-stomp', ...)`) is required for reliable
 * test doubles.
 */
export interface StompClient {
  readonly connectionState$: Observable<RxStompState>;
  readonly stompErrors$: Observable<unknown>;
  configure(config: { brokerURL: string }): void;
  activate(): void;
  deactivate(): Promise<unknown>;
  watch(destination: string, headers?: Record<string, string>): Observable<{ body: string }>;
}

/**
 * Factory producing the {@link StompClient} used by {@link WheelWsService.connect}. Defaults to a
 * real `RxStomp` instance; overridden in tests via
 * `{ provide: WHEEL_STOMP_CLIENT_FACTORY, useValue: () => fake }`.
 */
export const WHEEL_STOMP_CLIENT_FACTORY = new InjectionToken<() => StompClient>('WHEEL_STOMP_CLIENT_FACTORY', {
  providedIn: 'root',
  factory: () => () => new RxStomp(),
});

/**
 * STOMP client wrapper for a single wheel's real-time broadcast topic (US14.3.1).
 *
 * Connects to the same native (non-SockJS) `/ws/agilite` endpoint as planning poker
 * (`RoomWsService`) and retro (`RetroSessionWsService`), but only ever watches — a wheel has no
 * client-to-server application destination (the draw itself is a REST call, `POST
 * /wheels/{wheelId}/spin`), so unlike those two this service exposes no `publish`/`submit*`
 * method at all.
 *
 * Presents the caller's real bearer token (not a session-scoped grant) on the `Authorization`
 * native header of the SUBSCRIBE frame, mirroring the `Authorization` HTTP header REST calls use
 * (see backend `WheelChannelInterceptor`). **EN17.3 gap** — exactly like `WheelApiService`'s own
 * documented limitation, this repo has no real token source yet (`@pivot/ui-core` not
 * consumable): callers of {@link connect} pass whatever token is available today, which is
 * `null` in practice until EN17.3 lands. This is not a new gap introduced here — the WebSocket
 * subscription will simply fail its authorization exactly like every REST call already does
 * without a bearer token.
 *
 * Automatic reconnection (and re-subscription to the wheel's topic) is `@stomp/rx-stomp`'s own
 * built-in behavior for an active `watch()` observable — no additional mechanism is written here,
 * same as `RoomWsService`/`RetroSessionWsService` never needed to.
 */
@Injectable({ providedIn: 'root' })
export class WheelWsService {
  private readonly createClient = inject(WHEEL_STOMP_CLIENT_FACTORY);

  /** Current connection status. */
  readonly status = signal<WheelWsConnectionStatus>('connecting');

  /** Raw STOMP message bodies received on the subscribed wheel topic. */
  readonly messages$ = new Subject<string>();

  private client: StompClient | null = null;
  private topicSubscription: Subscription | null = null;
  private stateSubscription: Subscription | null = null;
  private stompErrorSubscription: Subscription | null = null;

  /** See `RoomWsService`'s identical field for why this guard exists (stale seeded `CLOSED`). */
  private everConnecting = false;

  /**
   * Connects to `/ws/agilite` and subscribes to the given wheel's broadcast topic, presenting
   * `authToken` (if any) on the native `Authorization` header. Safe to call once per view; call
   * {@link disconnect} first to switch wheels on the same service instance.
   *
   * @param wheelId   the wheel being viewed
   * @param authToken the caller's raw bearer token, or `null` if none is available (see class
   *   TSDoc — EN17.3 gap)
   */
  connect(wheelId: string, authToken: string | null): void {
    this.disconnect();
    this.everConnecting = false;
    this.status.set('connecting');

    const client = this.createClient();
    client.configure({ brokerURL: this.buildWsUrl() });
    this.client = client;

    this.stateSubscription = client.connectionState$.subscribe(state => this.onStateChange(state));
    this.stompErrorSubscription = client.stompErrors$.subscribe(() => this.status.set('error'));
    const headers = authToken ? { [AUTHORIZATION_HEADER]: `Bearer ${authToken}` } : undefined;
    this.topicSubscription = client
      .watch(wheelTopic(wheelId), headers)
      .subscribe(message => this.messages$.next(message.body));

    client.activate();
  }

  /**
   * Tears down the STOMP connection and its subscription. Safe to call repeatedly, including
   * before any {@link connect} call.
   */
  disconnect(): void {
    this.topicSubscription?.unsubscribe();
    this.stateSubscription?.unsubscribe();
    this.stompErrorSubscription?.unsubscribe();
    this.topicSubscription = null;
    this.stateSubscription = null;
    this.stompErrorSubscription = null;

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

  /** See `RoomWsService.buildWsUrl`'s identical logic/rationale. */
  private buildWsUrl(): string {
    const wsUrl = environment.wsUrl;
    if (/^wss?:\/\//.test(wsUrl)) {
      return wsUrl;
    }
    const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${scheme}://${window.location.host}${wsUrl}`;
  }
}

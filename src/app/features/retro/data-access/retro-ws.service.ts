import { Injectable, InjectionToken, inject, signal } from '@angular/core';
import { RxStomp, RxStompState } from '@stomp/rx-stomp';
import { Observable, Subject, Subscription } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { SubmitCardRequest } from './retro.models';

/**
 * Native STOMP header carrying the session-scoped access token returned by
 * `POST /retro/sessions/{id}/participants`. Name fixed by the backend contract — read there via
 * `RetroChannelInterceptor.ACCESS_TOKEN_HEADER` / `getFirstNativeHeader("access-token")`.
 */
const ACCESS_TOKEN_HEADER = 'access-token';

/** UI connection status for the STOMP link opened after joining a session (US20.1.2a). */
export type RetroConnectionStatus = 'connecting' | 'connected' | 'error';

/**
 * The minimal slice of `@stomp/rx-stomp`'s `RxStomp` surface this service depends on.
 *
 * Duplicated from `scrum-poker/room-ws.service.ts`'s identical `StompClient` interface/{@link
 * STOMP_CLIENT_FACTORY} token rather than imported across feature folders — mirrors this
 * codebase's own convention of small, domain-scoped duplication over a shared cross-feature
 * abstraction (e.g. backend's `PokerRoomDestinations`/`RetroSessionDestinations`), and avoids
 * any coupling between the two features' independent development. See that file's TSDoc for why
 * DI substitution (not `vi.mock('@stomp/rx-stomp', ...)`) is required for reliable test doubles.
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
 * Factory producing the {@link StompClient} used by {@link RetroSessionWsService.connect}.
 * Defaults to a real `RxStomp` instance; overridden in tests via
 * `{ provide: STOMP_CLIENT_FACTORY, useValue: () => fake }`.
 */
export const STOMP_CLIENT_FACTORY = new InjectionToken<() => StompClient>('RETRO_STOMP_CLIENT_FACTORY', {
  providedIn: 'root',
  factory: () => () => new RxStomp(),
});

/**
 * STOMP client wrapper for a single retrospective session's realtime channel (US20.1.2a).
 *
 * Connects to the same native (non-SockJS) `/ws/agilite` endpoint as planning poker
 * (`RoomWsService`), and additionally supports **publishing** (card submission) — poker's
 * wrapper only ever watches. Subscribes to the session's regular (masked, all-participants)
 * topic always, and — only when the join response marked the caller as facilitator — also to
 * the facilitator-only preview topic; both streams are exposed separately so the component layer
 * never has to guess which channel a raw message came from.
 *
 * Deliberately exposes raw STOMP frame bodies (`string`), not pre-parsed objects — parsing/
 * dispatch by the `type` discriminator is the subscriber's job (`SessionRoomComponent`), mirroring
 * `RoomWsService.messages$`'s same design choice.
 */
@Injectable({ providedIn: 'root' })
export class RetroSessionWsService {
  private readonly createClient = inject(STOMP_CLIENT_FACTORY);

  /** Current connection status. */
  readonly status = signal<RetroConnectionStatus>('connecting');

  /** Raw bodies received on the session's regular (masked) topic. */
  readonly topicMessages$ = new Subject<string>();

  /** Raw bodies received on the facilitator-only preview topic (empty stream if not facilitator). */
  readonly facilitatorMessages$ = new Subject<string>();

  private client: StompClient | null = null;
  private topicSubscription: Subscription | null = null;
  private facilitatorSubscription: Subscription | null = null;
  private stateSubscription: Subscription | null = null;
  private stompErrorSubscription: Subscription | null = null;
  private submitDestination: string | null = null;
  private accessToken: string | null = null;

  /** See `RoomWsService`'s identical field for why this guard exists (stale seeded `CLOSED`). */
  private everConnecting = false;

  /**
   * Connects to `/ws/agilite` and subscribes to the session's topic(s), presenting the access
   * token on the native `access-token` header. Safe to call once per join; call {@link
   * disconnect} first to switch sessions on the same service instance.
   *
   * @param topicDestination the session's regular (masked) topic
   * @param accessToken the opaque access token from the join response
   * @param submitDestination the destination {@link submitCard} sends to
   * @param facilitatorTopicDestination the facilitator-only preview topic, or `null`/`undefined`
   *   if the caller is not the facilitator (no second subscription is made in that case)
   */
  connect(
    topicDestination: string,
    accessToken: string,
    submitDestination: string,
    facilitatorTopicDestination?: string | null,
  ): void {
    this.disconnect();
    this.everConnecting = false;
    this.status.set('connecting');
    this.submitDestination = submitDestination;
    this.accessToken = accessToken;

    const client = this.createClient();
    client.configure({ brokerURL: this.buildWsUrl() });
    this.client = client;

    this.stateSubscription = client.connectionState$.subscribe(state => this.onStateChange(state));
    this.stompErrorSubscription = client.stompErrors$.subscribe(() => this.status.set('error'));
    this.topicSubscription = client
      .watch(topicDestination, { [ACCESS_TOKEN_HEADER]: accessToken })
      .subscribe(message => this.topicMessages$.next(message.body));

    if (facilitatorTopicDestination) {
      this.facilitatorSubscription = client
        .watch(facilitatorTopicDestination, { [ACCESS_TOKEN_HEADER]: accessToken })
        .subscribe(message => this.facilitatorMessages$.next(message.body));
    }

    client.activate();
  }

  /**
   * Submits a new card. No-ops (does nothing) if {@link connect} was never called or the
   * connection has since been torn down.
   *
   * @param request the card content/column/anonymous flag
   */
  submitCard(request: SubmitCardRequest): void {
    if (!this.client || !this.submitDestination || !this.accessToken) {
      return;
    }
    this.client.publish({
      destination: this.submitDestination,
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
    this.facilitatorSubscription?.unsubscribe();
    this.stateSubscription?.unsubscribe();
    this.stompErrorSubscription?.unsubscribe();
    this.topicSubscription = null;
    this.facilitatorSubscription = null;
    this.stateSubscription = null;
    this.stompErrorSubscription = null;
    this.submitDestination = null;
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

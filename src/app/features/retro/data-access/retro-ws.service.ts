import { Injectable, InjectionToken, inject, signal } from '@angular/core';
import { RxStomp, RxStompState } from '@stomp/rx-stomp';
import { Observable, Subject, Subscription } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { CastVoteRequest, RetroParticipantAccessResponse, SubmitCardRequest } from './retro.models';

/**
 * Native STOMP header carrying the session-scoped access token returned by
 * `POST /retro/sessions/{id}/participants`. Name fixed by the backend contract — read there via
 * `RetroChannelInterceptor.ACCESS_TOKEN_HEADER` / `getFirstNativeHeader("access-token")`.
 */
const ACCESS_TOKEN_HEADER = 'access-token';

/**
 * Private, per-participant STOMP destination carrying {@link VoteBalanceEvent} (US20.1.2b).
 * Spring's `UserDestinationMessageHandler` (server-side, `/user` prefix) transparently routes
 * this literal client-side subscription to the caller's own session — no per-session suffix to
 * compute here.
 */
const VOTE_BALANCE_QUEUE = '/user/queue/votes';

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
 *
 * <p>Since US20.1.2b, also supports dot-voting: {@link castVote}/{@link uncastVote} publish to
 * the grant's `voteDestination`/`voteUncastDestination`, and every participant (not just the
 * facilitator) is additionally subscribed to their own private `/user/queue/votes` for
 * `VOTE_BALANCE` notifications — {@link voteBalanceMessages$} exposes those raw bodies
 * separately from {@link topicMessages$}/{@link facilitatorMessages$}, exactly like the existing
 * two-stream split.
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

  /** Raw bodies received on the caller's private vote-balance queue (US20.1.2b). */
  readonly voteBalanceMessages$ = new Subject<string>();

  private client: StompClient | null = null;
  private topicSubscription: Subscription | null = null;
  private facilitatorSubscription: Subscription | null = null;
  private voteBalanceSubscription: Subscription | null = null;
  private stateSubscription: Subscription | null = null;
  private stompErrorSubscription: Subscription | null = null;
  private submitDestination: string | null = null;
  private voteDestination: string | null = null;
  private voteUncastDestination: string | null = null;
  private voteBalanceDestination: string | null = null;
  private accessToken: string | null = null;

  /** See `RoomWsService`'s identical field for why this guard exists (stale seeded `CLOSED`). */
  private everConnecting = false;

  /**
   * Connects to `/ws/agilite` and subscribes to the session's destinations, presenting the
   * access token on the native `access-token` header. Safe to call once per join; call {@link
   * disconnect} first to switch sessions on the same service instance.
   *
   * @param access the full access grant returned by `POST /retro/sessions/{id}/participants` —
   *   every destination {@link submitCard}/{@link castVote}/{@link uncastVote}/
   *   {@link queryVoteBalance} address is read from it, so the caller never has to pass them
   *   again individually
   */
  connect(access: RetroParticipantAccessResponse): void {
    this.disconnect();
    this.everConnecting = false;
    this.status.set('connecting');
    this.submitDestination = access.submitDestination;
    this.voteDestination = access.voteDestination;
    this.voteUncastDestination = access.voteUncastDestination;
    this.voteBalanceDestination = access.voteBalanceDestination;
    this.accessToken = access.accessToken;

    const client = this.createClient();
    client.configure({ brokerURL: this.buildWsUrl() });
    this.client = client;

    this.stateSubscription = client.connectionState$.subscribe(state => this.onStateChange(state));
    this.stompErrorSubscription = client.stompErrors$.subscribe(() => this.status.set('error'));
    this.topicSubscription = client
      .watch(access.topicDestination, { [ACCESS_TOKEN_HEADER]: access.accessToken })
      .subscribe(message => this.topicMessages$.next(message.body));
    this.voteBalanceSubscription = client
      .watch(VOTE_BALANCE_QUEUE, { [ACCESS_TOKEN_HEADER]: access.accessToken })
      .subscribe(message => this.voteBalanceMessages$.next(message.body));

    if (access.facilitatorTopicDestination) {
      this.facilitatorSubscription = client
        .watch(access.facilitatorTopicDestination, { [ACCESS_TOKEN_HEADER]: access.accessToken })
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
    this.publish(this.submitDestination, request);
  }

  /**
   * Casts a dot-vote on a revealed card (US20.1.2b). Several votes on the same card are allowed
   * (up to the caller's remaining balance) — this simply sends one more cast request each time
   * it is called. No-ops if {@link connect} was never called or the connection has since been
   * torn down.
   *
   * @param cardId the target card's id
   */
  castVote(cardId: string): void {
    this.publish(this.voteDestination, { cardId } satisfies CastVoteRequest);
  }

  /**
   * Removes a single, previously cast dot-vote from a card (US20.1.2b). No-ops if {@link connect}
   * was never called or the connection has since been torn down.
   *
   * @param cardId the target card's id
   */
  uncastVote(cardId: string): void {
    this.publish(this.voteUncastDestination, { cardId } satisfies CastVoteRequest);
  }

  /**
   * Asks the server to (re-)send the caller's current vote balance on {@link
   * voteBalanceMessages$}, as a {@code VOTE_BALANCE} event (US20.1.2b) — empty body, the
   * destination alone identifies the request. No-ops if {@link connect} was never called or the
   * connection has since been torn down.
   */
  queryVoteBalance(): void {
    if (!this.client || !this.voteBalanceDestination || !this.accessToken) {
      return;
    }
    this.client.publish({
      destination: this.voteBalanceDestination,
      body: '',
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
    this.voteBalanceSubscription?.unsubscribe();
    this.stateSubscription?.unsubscribe();
    this.stompErrorSubscription?.unsubscribe();
    this.topicSubscription = null;
    this.facilitatorSubscription = null;
    this.voteBalanceSubscription = null;
    this.stateSubscription = null;
    this.stompErrorSubscription = null;
    this.submitDestination = null;
    this.voteDestination = null;
    this.voteUncastDestination = null;
    this.voteBalanceDestination = null;
    this.accessToken = null;

    void this.client?.deactivate();
    this.client = null;
  }

  /**
   * Serializes and publishes {@code payload} to {@code destination}, presenting the access token
   * header — the shared implementation behind {@link submitCard}/{@link castVote}/
   * {@link uncastVote}. No-ops if {@link connect} was never called, the connection has since been
   * torn down, or {@code destination} is unset.
   *
   * @param destination the target destination, or `null` if unset
   * @param payload the payload to serialize as the frame body
   */
  private publish(destination: string | null, payload: unknown): void {
    if (!this.client || !destination || !this.accessToken) {
      return;
    }
    this.client.publish({
      destination,
      body: JSON.stringify(payload),
      headers: { [ACCESS_TOKEN_HEADER]: this.accessToken },
    });
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

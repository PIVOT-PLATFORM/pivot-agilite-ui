import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { RetroApiService } from '../data-access/retro-api.service';
import { RetroSessionWsService } from '../data-access/retro-ws.service';
import {
  ActionCreatedEvent,
  CardAddedFacilitatorEvent,
  CardAddedMaskedEvent,
  CardsRevealedEvent,
  PhaseChangedEvent,
  RankedCard,
  RetroActionResponse,
  RetroFormatColumn,
  RetroParticipantAccessResponse,
  RetroPhase,
  RetroSessionResponse,
  RetroSessionTopicEvent,
  RetroTeamMemberResponse,
  RevealedCard,
  SessionClosedEvent,
  VoteBalanceEvent,
} from '../data-access/retro.models';

/** A column ready for rendering — either from the real format catalogue or a local fallback. */
interface DisplayColumn {
  key: string;
  label: string;
}

/** A facilitator-visible card, before reveal (US20.1.2a — facilitator-only preview). */
interface FacilitatorCardView {
  id: string;
  content: string;
  anonymous: boolean;
}

/**
 * One column's worth of the vote-count ranking, ready for rendering (US20.1.2c AC: cards sorted
 * by vote count descending, grouped by column). {@link cards} stays vote-count-descending because
 * it is built by filtering the already-sorted {@link RankedCard} list — see {@link
 * SessionRoomComponent.rankedColumnEntries}.
 */
interface RankedColumnGroup {
  key: string;
  label: string;
  cards: RankedCard[];
}

/**
 * Fallback column set used only when the real format catalogue (`GET /retro/formats`,
 * US20.2.1) cannot be loaded — e.g. no bearer token attached yet (`RetroApiService`'s
 * documented, repo-wide auth gap) for an account-less join-code participant, or the backend
 * endpoint not yet available. Column *keys* here are purely local placeholders: the backend
 * never validates `columnKey` against a catalogue (see `RetroCardService`), so submissions
 * still work correctly end-to-end even when this fallback is in effect — only the *labels*
 * shown to the user are approximate until the real catalogue loads.
 */
const FALLBACK_COLUMNS: Record<string, { key: string; labelKey: string }[]> = {
  START_STOP_CONTINUE: [
    { key: 'start', labelKey: 'retro.sessionRoom.fallbackColumns.start' },
    { key: 'stop', labelKey: 'retro.sessionRoom.fallbackColumns.stop' },
    { key: 'continue', labelKey: 'retro.sessionRoom.fallbackColumns.continue' },
  ],
  KIF_KAF: [
    { key: 'kif', labelKey: 'retro.sessionRoom.fallbackColumns.kif' },
    { key: 'kaf', labelKey: 'retro.sessionRoom.fallbackColumns.kaf' },
  ],
  FOUR_L: [
    { key: 'liked', labelKey: 'retro.sessionRoom.fallbackColumns.liked' },
    { key: 'learned', labelKey: 'retro.sessionRoom.fallbackColumns.learned' },
    { key: 'lacked', labelKey: 'retro.sessionRoom.fallbackColumns.lacked' },
    { key: 'longedFor', labelKey: 'retro.sessionRoom.fallbackColumns.longedFor' },
  ],
  MAD_SAD_GLAD: [
    { key: 'mad', labelKey: 'retro.sessionRoom.fallbackColumns.mad' },
    { key: 'sad', labelKey: 'retro.sessionRoom.fallbackColumns.sad' },
    { key: 'glad', labelKey: 'retro.sessionRoom.fallbackColumns.glad' },
  ],
  CUSTOM: [{ key: 'general', labelKey: 'retro.sessionRoom.fallbackColumns.general' }],
};

/**
 * Realtime "animate the retrospective" room (US20.1.2a): card submission per column (masked
 * until reveal), facilitator preview, phase-aware controls (manual close / reveal), and the
 * revealed view.
 *
 * <p>Since US20.1.2b, also drives the vote phase: dot-vote cast/uncast on revealed cards, a
 * server-authoritative remaining-votes counter, facilitator open/close-vote controls, and the
 * switch to a ranked-cards view once `PHASE_CHANGED` (`VOTE` → `ACTION`) carries the ranking.
 *
 * <p>Since US20.1.2c, also drives the terminal `ACTION` → `CLOSED` transition: the ranking is
 * rendered grouped by column (not just sorted, see {@link rankedColumnEntries}), a per-card
 * "create action from this card" trigger calls US20.3.1's not-yet-built endpoint, a facilitator
 * `closeSessionNow` control transitions to `CLOSED`, and a `SESSION_CLOSED` event switches the
 * room to its read-only lockdown state (every phase-gated control above simply stops rendering
 * once {@link phase} is `CLOSED`, since none of them match that phase).
 *
 * <p>Since US20.3.1, the `ACTION` phase additionally offers a full action-creation form (title,
 * optional owner picked from {@link teamMembers}, optional due date, optional source card picked
 * from {@link rankedCards}) alongside the pre-existing per-card quick trigger — both call the
 * same {@link RetroApiService.createAction}. Every action created by any participant (via either
 * path) is appended to {@link sessionActions}: the caller's own creation is applied directly from
 * the HTTP response, every other participant's from the realtime `ACTION_CREATED` event — {@link
 * addSessionAction} dedupes by id so a participant never sees their own action listed twice, once
 * from the response and once from the echoed broadcast.
 *
 * <p>Since US20.3.2, joining also triggers a "warm-up" check ({@link checkPendingActions}):
 * once the session's `teamId` is known (from {@link loadSessionDetailBestEffort}), the team's
 * currently open (`A_FAIRE`/`EN_COURS`) retrospective actions from past sessions are fetched. If
 * any are found, a warm-up panel is shown — listing them with a control to mark each `TERMINEE`
 * or `ABANDONNEE` ({@link markPendingAction}, reusing {@link RetroApiService.updateActionStatus}
 * unchanged) — before the phase-specific interface below ever renders; the facilitator/
 * participant then continues past it ({@link dismissWarmup}). If none are found (or the check
 * itself fails/never resolves the team, e.g. the repo-wide auth gap), the panel is skipped
 * automatically — {@link warmupResolved} gates the phase interface from rendering (and from a
 * "flash" of an empty panel) until the check has settled one way or the other. Purely a
 * client-side, transient view state: the session itself is always created directly in
 * `CONTRIBUTION` (US20.1.1) — `'WARMUP'` is never a {@link RetroPhase} value.
 *
 * No business logic here beyond orchestration — {@link RetroApiService} owns every HTTP call,
 * {@link RetroSessionWsService} owns the STOMP lifecycle and raw frame parsing dispatch happens
 * here (mirrors `JoinRoomComponent`'s split of responsibilities).
 *
 * **Security (AC):** every card's content is rendered exclusively via Angular text
 * interpolation (`{{ }}`) — never `[innerHTML]` — so no HTML/JS in a submitted card can ever
 * execute. **Masked-until-reveal (AC):** {@link maskedCounts} only ever stores a number per
 * column, never any string derived from card content; the raw STOMP frame received on the
 * regular topic is proven (server-side, `RetroCardSubmissionIT`) to never carry content at all
 * before `CARDS_REVEALED` — this component simply never has anything to leak in the first place.
 * **Vote privacy (AC, US20.1.2b):** {@link voteCounts} only ever stores an aggregate number per
 * card — never who voted; {@link myVoteCounts} is local-only client state, never sent anywhere
 * (see its own TSDoc), and {@link votesRemaining}/{@link votesAllowed} are always overwritten
 * from the server's own `VOTE_BALANCE` event, never computed client-side as a source of truth.
 */
@Component({
  selector: 'app-session-room',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, RouterLink],
  templateUrl: './session-room.component.html',
  styleUrl: './session-room.component.scss',
})
export class SessionRoomComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly retroApi = inject(RetroApiService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);
  /** Injected (not wrapped) — its `status` signal is read directly from the template. */
  protected readonly retroWs = inject(RetroSessionWsService);

  protected readonly sessionId = signal('');
  protected readonly joining = signal(true);
  protected readonly joinErrorKey = signal<string | null>(null);
  protected readonly grant = signal<RetroParticipantAccessResponse | null>(null);
  protected readonly sessionDetail = signal<RetroSessionResponse | null>(null);
  protected readonly phase = signal<RetroPhase>('CONTRIBUTION');
  protected readonly columns = signal<DisplayColumn[]>([]);
  protected readonly usingFallbackColumns = signal(false);

  /** column key -> current masked count. */
  protected readonly maskedCounts = signal<Record<string, number>>({});
  /** column key -> full cards (facilitator-only, pre-reveal). */
  protected readonly facilitatorCards = signal<Record<string, FacilitatorCardView[]>>({});
  /** column key -> revealed cards, once `CARDS_REVEALED` has been received; `null` before. */
  protected readonly revealedColumns = signal<Record<string, RevealedCard[]> | null>(null);

  /** card id -> aggregate vote count, server-authoritative, from `VOTE_CAST`/`VOTE_UNCAST` (US20.1.2b). */
  protected readonly voteCounts = signal<Record<string, number>>({});

  /**
   * card id -> the caller's own vote count on that card — purely local, optimistic UI state
   * (US20.1.2b). Never derived from anything the server sends back (the server never reveals
   * who voted, only per-card aggregates), mirroring `RoomBoardComponent.selectedValue`'s same
   * "local-only, never server-echoed" precedent. Used only to gate the uncast control.
   */
  protected readonly myVoteCounts = signal<Record<string, number>>({});

  /**
   * The caller's remaining/allowed vote balance, `null` until the first `VOTE_BALANCE` event is
   * received (US20.1.2b) — server-authoritative, always overwritten (never merged) by each new
   * event.
   */
  protected readonly votesRemaining = signal<number | null>(null);
  protected readonly votesAllowed = signal<number | null>(null);

  /**
   * The vote-count ranking, populated only once a `PHASE_CHANGED` (`VOTE` → `ACTION`) event
   * carries one (US20.1.2b); `null` before then, driving the switch to the ranked-cards view.
   */
  protected readonly rankedCards = signal<RankedCard[] | null>(null);

  /**
   * When the session closed (US20.1.2c) — set from the `SESSION_CLOSED` event's `closedAt`;
   * `null` while the session is still open. Purely informational (the read-only lockdown itself
   * is driven by {@link phase}, not this field).
   */
  protected readonly closedAt = signal<string | null>(null);

  /**
   * card id -> whether a `createActionFromCard` call is currently in flight for that card
   * (US20.1.2c) — prevents double submission per card; independent of {@link actionPending},
   * which only ever tracks the facilitator phase-transition controls.
   */
  protected readonly actionCreationPending = signal<Record<string, boolean>>({});

  /**
   * card id -> outcome of the last `createActionFromCard` call for that card (US20.1.2c) —
   * `'success'` once persisted, `'error'` on any failure (expected until US20.3.1's endpoint
   * exists server-side), cleared at the start of a new attempt.
   */
  protected readonly actionCreationResult = signal<Record<string, 'success' | 'error'>>({});

  /**
   * Every action created in this session so far (US20.3.1) — from either the quick per-card
   * trigger ({@link createActionFromCard}) or the full creation form ({@link submitActionForm}),
   * by any participant. Kept deduplicated by id (see {@link addSessionAction}) since the caller's
   * own creation reaches this signal twice: once from the HTTP response, once from the echoed
   * `ACTION_CREATED` realtime event.
   */
  protected readonly sessionActions = signal<RetroActionResponse[]>([]);

  /**
   * The session's team members (US20.3.1) — feeds the action-creation form's owner picker.
   * Loaded best-effort alongside {@link sessionDetail} (needs its `teamId`); stays empty for an
   * account-less participant (the repo-wide auth gap) or if the call fails — the owner field
   * simply has no options to choose from, since it is optional either way.
   */
  protected readonly teamMembers = signal<RetroTeamMemberResponse[]>([]);

  /**
   * Whether the US20.3.2 "warm-up" pending-actions check has resolved — `false` while in flight,
   * gating the phase-specific interface (and the warm-up panel itself) from rendering until we
   * know one way or the other (see {@link checkPendingActions}). Never left `false` forever: both
   * the success and error paths of {@link loadSessionDetailBestEffort} set it, and its own error
   * path (no `teamId` known at all) sets it directly.
   */
  protected readonly warmupResolved = signal(false);

  /**
   * Whether the warm-up panel should currently be shown (US20.3.2) — `true` once {@link
   * warmupResolved} and at least one pending action was found for the session's team. Set back to
   * `false` by {@link dismissWarmup} once the facilitator/participant continues into the
   * phase-specific interface; never shown again afterwards for this component instance.
   */
  protected readonly showWarmup = signal(false);

  /** The team's currently open (`A_FAIRE`/`EN_COURS`) actions from prior sessions (US20.3.2). */
  protected readonly pendingActions = signal<RetroActionResponse[]>([]);

  /** Id of the pending action a warm-up status-change call is currently in flight for, or `null`. */
  protected readonly warmupUpdatingActionId = signal<string | null>(null);
  /** Id of the pending action whose last warm-up status-change call failed, or `null`. */
  protected readonly warmupErrorActionId = signal<string | null>(null);

  /** The action-creation form's title draft (US20.3.1) — required field. */
  protected readonly actionFormTitle = signal('');
  /** The action-creation form's owner draft — a team member's `userId`, or `null` if unset. */
  protected readonly actionFormOwnerId = signal<number | null>(null);
  /** The action-creation form's due date draft (ISO date, `YYYY-MM-DD`), or `''` if unset. */
  protected readonly actionFormDueDate = signal('');
  /** The action-creation form's source card draft — a ranked card's id, or `null` if unset. */
  protected readonly actionFormSourceCardId = signal<string | null>(null);
  protected readonly actionFormPending = signal(false);
  protected readonly actionFormErrorKey = signal<string | null>(null);

  /**
   * Live countdown, in seconds, until the configured contribution timer elapses — `null` when
   * no timer is configured, the phase has moved on, or (an account-less participant) session
   * detail could not be loaded (see {@link loadSessionDetailBestEffort}'s TSDoc): this component
   * never fabricates a countdown it cannot back with the real, server-configured deadline.
   */
  protected readonly remainingSeconds = signal<number | null>(null);
  private timerIntervalId: ReturnType<typeof setInterval> | null = null;

  /** column key -> the participant's in-progress draft text. */
  protected readonly drafts = signal<Record<string, string>>({});
  protected readonly anonymousDraft = signal(false);
  protected readonly actionErrorKey = signal<string | null>(null);
  protected readonly actionPending = signal(false);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('sessionId') ?? '';
    this.sessionId.set(id);
    if (!id) {
      this.joining.set(false);
      this.joinErrorKey.set('retro.sessionRoom.error.notFound');
      return;
    }

    this.retroWs.topicMessages$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(body => this.onTopicMessage(body));
    this.retroWs.facilitatorMessages$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(body => this.onFacilitatorMessage(body));
    this.retroWs.voteBalanceMessages$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(body => this.onVoteBalanceMessage(body));

    this.retroApi.joinRealtimeSession(id).subscribe({
      next: access => this.onJoined(access),
      error: (error: HttpErrorResponse) => {
        this.joining.set(false);
        this.joinErrorKey.set(this.resolveJoinErrorKey(error));
      },
    });
  }

  ngOnDestroy(): void {
    this.retroWs.disconnect();
    this.stopCountdown();
  }

  /** True once the caller was resolved as this session's facilitator. */
  protected isFacilitator(): boolean {
    return this.grant()?.facilitator ?? false;
  }

  protected updateDraft(columnKey: string, value: string): void {
    this.drafts.update(current => ({ ...current, [columnKey]: value }));
  }

  /**
   * The current draft text for a column, or `''` if none yet. A plain method (rather than
   * indexing the {@link drafts} signal directly in the template) — TypeScript's `Record<string,
   * string>` index signature does not itself carry `| undefined` (no `noUncheckedIndexedAccess`
   * in this project), which makes Angular's template type-checker flag a template-level `??`
   * fallback as dead code (NG8102) even though it is reachable at runtime for any column not yet
   * drafted.
   */
  protected draftValue(columnKey: string): string {
    const value = this.drafts()[columnKey];
    return value === undefined ? '' : value;
  }

  protected toggleAnonymousDraft(checked: boolean): void {
    this.anonymousDraft.set(checked);
  }

  /** Submits the draft card for one column over STOMP; clears the draft on send. */
  protected submitCard(columnKey: string): void {
    const content = (this.drafts()[columnKey] ?? '').trim();
    if (!content) {
      return;
    }
    this.retroWs.submitCard({ content, columnKey, anonymous: this.anonymousDraft() });
    this.drafts.update(current => ({ ...current, [columnKey]: '' }));
  }

  /** Facilitator-only: immediately closes contribution, before any configured timer expires. */
  protected closeContributionNow(): void {
    this.actionPending.set(true);
    this.actionErrorKey.set(null);
    this.retroApi.closeContribution(this.sessionId()).subscribe({
      next: response => {
        this.actionPending.set(false);
        this.phase.set(response.currentPhase);
      },
      error: () => {
        this.actionPending.set(false);
        this.actionErrorKey.set('retro.sessionRoom.error.actionFailed');
      },
    });
  }

  /** Facilitator-only: triggers the reveal — every participant receives `CARDS_REVEALED`. */
  protected triggerReveal(): void {
    this.actionPending.set(true);
    this.actionErrorKey.set(null);
    this.retroApi.reveal(this.sessionId()).subscribe({
      next: response => {
        this.actionPending.set(false);
        this.revealedColumns.set(response.columns);
      },
      error: () => {
        this.actionPending.set(false);
        this.actionErrorKey.set('retro.sessionRoom.error.actionFailed');
      },
    });
  }

  /** Facilitator-only: opens the vote phase (US20.1.2b) — every participant receives `PHASE_CHANGED`. */
  protected openVoteNow(): void {
    this.actionPending.set(true);
    this.actionErrorKey.set(null);
    this.retroApi.openVote(this.sessionId()).subscribe({
      next: response => {
        this.actionPending.set(false);
        this.phase.set(response.currentPhase);
        this.retroWs.queryVoteBalance();
      },
      error: () => {
        this.actionPending.set(false);
        this.actionErrorKey.set('retro.sessionRoom.error.actionFailed');
      },
    });
  }

  /**
   * Facilitator-only: closes the vote phase (US20.1.2b), transitioning to `ACTION`. The
   * vote-count ranking itself arrives separately, on every participant's `PHASE_CHANGED` event —
   * this response only carries the new phase.
   */
  protected closeVoteNow(): void {
    this.actionPending.set(true);
    this.actionErrorKey.set(null);
    this.retroApi.closeVote(this.sessionId()).subscribe({
      next: response => {
        this.actionPending.set(false);
        this.phase.set(response.currentPhase);
      },
      error: () => {
        this.actionPending.set(false);
        this.actionErrorKey.set('retro.sessionRoom.error.actionFailed');
      },
    });
  }

  /**
   * Facilitator-only: closes the session (US20.1.2c), transitioning to the terminal `CLOSED`
   * phase — every participant (including the caller) also receives `SESSION_CLOSED` on the
   * realtime channel; this response is what makes the caller's own UI switch to read-only
   * immediately, without waiting for that broadcast to arrive.
   */
  protected closeSessionNow(): void {
    this.actionPending.set(true);
    this.actionErrorKey.set(null);
    this.retroApi.closeSession(this.sessionId()).subscribe({
      next: response => {
        this.actionPending.set(false);
        this.phase.set(response.currentPhase);
        this.stopCountdown();
      },
      error: () => {
        this.actionPending.set(false);
        this.actionErrorKey.set('retro.sessionRoom.error.actionFailed');
      },
    });
  }

  /**
   * Casts one dot-vote on a card (US20.1.2b). No-ops when the phase is not `VOTE` or the caller's
   * known balance is already exhausted — the server remains the final authority regardless (a
   * stale/optimistic {@link votesRemaining} can never be used to exceed the real balance, only to
   * pre-emptively disable the control).
   *
   * @param cardId the target card's id
   */
  protected castVote(cardId: string): void {
    if (!this.canCastVote()) {
      return;
    }
    this.retroWs.castVote(cardId);
    this.myVoteCounts.update(current => ({ ...current, [cardId]: this.myVoteCountFor(cardId) + 1 }));
    this.votesRemaining.update(current => (current === null ? current : Math.max(0, current - 1)));
  }

  /**
   * Removes one of the caller's own dot-votes from a card (US20.1.2b). No-ops when the phase is
   * not `VOTE` or the caller has no locally-tracked vote left on this card.
   *
   * @param cardId the target card's id
   */
  protected uncastVote(cardId: string): void {
    if (!this.canUncastVote(cardId)) {
      return;
    }
    this.retroWs.uncastVote(cardId);
    this.myVoteCounts.update(current => ({ ...current, [cardId]: Math.max(0, this.myVoteCountFor(cardId) - 1) }));
    this.votesRemaining.update(current => {
      if (current === null) {
        return current;
      }
      const allowed = this.votesAllowed();
      return allowed === null ? current + 1 : Math.min(allowed, current + 1);
    });
  }

  /** Whether the cast control should currently be enabled. */
  protected canCastVote(): boolean {
    return this.phase() === 'VOTE' && (this.votesRemaining() ?? 0) > 0;
  }

  /** Whether the uncast control should currently be enabled for a given card. */
  protected canUncastVote(cardId: string): boolean {
    return this.phase() === 'VOTE' && this.myVoteCountFor(cardId) > 0;
  }

  /** The aggregate (server-authoritative) vote count for a card, or 0 if none cast yet. */
  protected voteCountFor(cardId: string): number {
    return this.voteCounts()[cardId] ?? 0;
  }

  /** The caller's own (local-only) vote count for a card, or 0 if none cast yet. */
  protected myVoteCountFor(cardId: string): number {
    return this.myVoteCounts()[cardId] ?? 0;
  }

  /**
   * The vote-count ranking, grouped by column in the format's own display order, columns with no
   * ranked cards omitted (US20.1.2c AC: "triées par nombre de votes décroissant, groupées par
   * colonne"). Each group's {@link RankedColumnGroup.cards} stays vote-count-descending — it is
   * built by filtering {@link rankedCards}, which is already sorted that way end to end (server-
   * side ranking, US20.1.2b).
   */
  protected rankedColumnEntries(): RankedColumnGroup[] {
    const ranked = this.rankedCards() ?? [];
    return this.columns()
      .map(column => ({
        key: column.key,
        label: column.label,
        cards: ranked.filter(card => card.columnKey === column.key),
      }))
      .filter(entry => entry.cards.length > 0);
  }

  /** Whether a `createActionFromCard` call is currently in flight for this card (US20.1.2c). */
  protected isCreatingActionFor(cardId: string): boolean {
    return this.actionCreationPending()[cardId] === true;
  }

  /** The outcome of the last `createActionFromCard` attempt for this card, if any (US20.1.2c). */
  protected actionCreationResultFor(cardId: string): 'success' | 'error' | null {
    return this.actionCreationResult()[cardId] ?? null;
  }

  /**
   * Triggers action creation from a ranked card (US20.1.2c) — calls US20.3.1's
   * `POST /retro/sessions/{id}/actions` with the card as source, using the card's own content as
   * the action's title. No separate title-entry form here: full action editing/management is
   * US20.3.1's own frontend scope — this US only provides the contextualized trigger point (AC:
   * "cette US ne réimplémente pas la persistance, elle ne fait que le déclenchement
   * contextualisé"). Available to the facilitator or any participant — unlike the phase-
   * transition controls above, deliberately not facilitator-gated (AC: "l'animateur ou un
   * participant"). No-ops while a call for this same card is already in flight.
   *
   * US20.3.1 has not shipped server-side yet, so this call is expected to fail until it does —
   * handled the same as any other failure, never an unhandled exception (see {@link
   * RetroApiService.createAction}'s TSDoc).
   *
   * @param card the ranked card to create an action from
   */
  protected createActionFromCard(card: RankedCard): void {
    if (this.isCreatingActionFor(card.cardId)) {
      return;
    }
    this.actionCreationPending.update(current => ({ ...current, [card.cardId]: true }));
    this.actionCreationResult.update(current => {
      const next = { ...current };
      delete next[card.cardId];
      return next;
    });
    this.retroApi.createAction(this.sessionId(), { title: card.content, sourceCardId: card.cardId }).subscribe({
      next: action => {
        this.actionCreationPending.update(current => ({ ...current, [card.cardId]: false }));
        this.actionCreationResult.update(current => ({ ...current, [card.cardId]: 'success' }));
        this.addSessionAction(action);
      },
      error: () => {
        this.actionCreationPending.update(current => ({ ...current, [card.cardId]: false }));
        this.actionCreationResult.update(current => ({ ...current, [card.cardId]: 'error' }));
      },
    });
  }

  /** Updates the action-creation form's title draft. */
  protected updateActionFormTitle(value: string): void {
    this.actionFormTitle.set(value);
  }

  /** Updates the action-creation form's owner draft from the owner `<select>`'s value. */
  protected updateActionFormOwner(value: string): void {
    this.actionFormOwnerId.set(value === '' ? null : Number(value));
  }

  /** Updates the action-creation form's due date draft from the date `<input>`'s value. */
  protected updateActionFormDueDate(value: string): void {
    this.actionFormDueDate.set(value);
  }

  /** Updates the action-creation form's source card draft from the source-card `<select>`'s value. */
  protected updateActionFormSourceCard(value: string): void {
    this.actionFormSourceCardId.set(value === '' ? null : value);
  }

  /** Whether the action-creation form can currently be submitted: a non-blank title, not already pending. */
  protected canSubmitActionForm(): boolean {
    return this.actionFormTitle().trim().length > 0 && !this.actionFormPending();
  }

  /**
   * Submits the action-creation form (US20.3.1) — title required, owner/due date/source card all
   * optional. Available to the facilitator or any participant, mirroring {@link
   * createActionFromCard}'s same "l'animateur ou un participant" AC. On success, resets the form
   * and appends the created action to {@link sessionActions} immediately (also reached, harmlessly
   * deduplicated, via the echoed `ACTION_CREATED` realtime event).
   */
  protected submitActionForm(): void {
    if (!this.canSubmitActionForm()) {
      return;
    }
    this.actionFormPending.set(true);
    this.actionFormErrorKey.set(null);

    const ownerUserId = this.actionFormOwnerId();
    const dueDate = this.actionFormDueDate();
    const sourceCardId = this.actionFormSourceCardId();

    this.retroApi
      .createAction(this.sessionId(), {
        title: this.actionFormTitle().trim(),
        ...(ownerUserId !== null ? { ownerUserId } : {}),
        ...(dueDate ? { dueDate } : {}),
        ...(sourceCardId !== null ? { sourceCardId } : {}),
      })
      .subscribe({
        next: action => {
          this.actionFormPending.set(false);
          this.resetActionForm();
          this.addSessionAction(action);
        },
        error: (error: HttpErrorResponse) => {
          this.actionFormPending.set(false);
          this.actionFormErrorKey.set(this.resolveActionFormErrorKey(error));
        },
      });
  }

  private resetActionForm(): void {
    this.actionFormTitle.set('');
    this.actionFormOwnerId.set(null);
    this.actionFormDueDate.set('');
    this.actionFormSourceCardId.set(null);
  }

  private resolveActionFormErrorKey(error: HttpErrorResponse): string {
    if (error.status === 400) {
      return 'retro.sessionRoom.action.form.error.invalid';
    }
    if (error.status === 404) {
      return 'retro.sessionRoom.action.form.error.sessionUnavailable';
    }
    if (error.status === 409) {
      return 'retro.sessionRoom.action.form.error.wrongPhase';
    }
    return 'retro.sessionRoom.action.form.error.generic';
  }

  /** Display name of a team member for a given owner id, or `null` if unknown/unset. */
  protected ownerDisplayName(ownerUserId: number | null): string | null {
    if (ownerUserId === null) {
      return null;
    }
    return this.teamMembers().find(m => m.userId === ownerUserId)?.displayName ?? null;
  }

  /**
   * Continues past the warm-up panel into the session's own phase-specific interface (US20.3.2) —
   * a purely client-side transition, the session's real `currentPhase` is untouched.
   */
  protected dismissWarmup(): void {
    this.showWarmup.set(false);
  }

  /**
   * Marks a pending action `TERMINEE` or `ABANDONNEE` directly from the warm-up panel (US20.3.2) —
   * reuses {@link RetroApiService.updateActionStatus} (US20.3.1) unchanged, no new backend
   * behaviour needed for this call. Removes the row from {@link pendingActions} on success (it is
   * no longer "pending" by definition); leaves it in place with an inline error on failure. No-ops
   * while a call for this same action is already in flight.
   *
   * @param action the pending action to update
   * @param status the target status — always `'TERMINEE'` or `'ABANDONNEE'` from this panel
   */
  protected markPendingAction(action: RetroActionResponse, status: 'TERMINEE' | 'ABANDONNEE'): void {
    if (this.warmupUpdatingActionId() !== null) {
      return;
    }
    this.warmupUpdatingActionId.set(action.id);
    this.warmupErrorActionId.set(null);
    this.retroApi.updateActionStatus(action.id, { status }).subscribe({
      next: () => {
        this.warmupUpdatingActionId.set(null);
        this.pendingActions.update(current => current.filter(a => a.id !== action.id));
      },
      error: () => {
        this.warmupUpdatingActionId.set(null);
        this.warmupErrorActionId.set(action.id);
      },
    });
  }

  /** The masked count for a column, or 0 if none submitted yet. */
  protected maskedCountFor(columnKey: string): number {
    return this.maskedCounts()[columnKey] ?? 0;
  }

  /** The facilitator-visible cards for a column, before reveal. */
  protected facilitatorCardsFor(columnKey: string): FacilitatorCardView[] {
    return this.facilitatorCards()[columnKey] ?? [];
  }

  /** The revealed cards for a column, after `CARDS_REVEALED`. */
  protected revealedCardsFor(columnKey: string): RevealedCard[] {
    return this.revealedColumns()?.[columnKey] ?? [];
  }

  private onJoined(access: RetroParticipantAccessResponse): void {
    this.grant.set(access);
    this.joining.set(false);
    this.retroWs.connect(access);
    // Sequenced deliberately: loadColumns() reads sessionDetail() to know which format's
    // columns to fetch, so it must only run once loadSessionDetailBestEffort() has settled
    // (success or failure) — never in parallel, which would race depending on which HTTP call
    // happens to resolve first.
    this.loadSessionDetailBestEffort();
  }

  /**
   * Best-effort: only succeeds for an authenticated caller once real auth is wired in. Also the
   * only place {@link sessionDetail}'s `teamId` becomes known, so it is what triggers the
   * US20.3.2 warm-up check ({@link checkPendingActions}) — on failure, there is no `teamId` to
   * check with, so the warm-up check is skipped outright (fail-open, same reasoning as every
   * other best-effort call here).
   */
  private loadSessionDetailBestEffort(): void {
    this.retroApi.getById(this.sessionId()).subscribe({
      next: detail => {
        this.sessionDetail.set(detail);
        this.phase.set(detail.currentPhase);
        this.startCountdownIfConfigured(detail);
        this.loadColumns();
        this.loadTeamMembers(detail.teamId);
        this.checkPendingActions(detail.teamId);
        if (detail.currentPhase === 'VOTE') {
          // Joining/reconnecting directly into an already-open vote phase (e.g. page reload) —
          // learn the caller's balance immediately rather than waiting for a `PHASE_CHANGED`
          // event that already happened before this join.
          this.retroWs.queryVoteBalance();
        }
      },
      error: () => {
        // Expected today (no bearer token attached anywhere in this app yet) — the room still
        // works fully from realtime events alone, just without a countdown display, and
        // loadColumns() falls back to a generic column set (no known format to look up).
        this.loadColumns();
        this.warmupResolved.set(true);
      },
    });
  }

  /**
   * Starts a 1s-interval countdown toward `createdAt + contributionTimerSeconds`, if a timer is
   * configured and the session is still in `CONTRIBUTION`. No-op otherwise.
   */
  private startCountdownIfConfigured(detail: RetroSessionResponse): void {
    if (detail.contributionTimerSeconds == null || detail.currentPhase !== 'CONTRIBUTION') {
      return;
    }
    const deadline = new Date(detail.createdAt).getTime() + detail.contributionTimerSeconds * 1000;
    const tick = (): void => {
      if (this.phase() !== 'CONTRIBUTION') {
        this.stopCountdown();
        return;
      }
      this.remainingSeconds.set(Math.max(0, Math.round((deadline - Date.now()) / 1000)));
    };
    tick();
    this.timerIntervalId = setInterval(tick, 1000);
  }

  private stopCountdown(): void {
    if (this.timerIntervalId !== null) {
      clearInterval(this.timerIntervalId);
      this.timerIntervalId = null;
    }
    this.remainingSeconds.set(null);
  }

  private loadColumns(): void {
    this.retroApi.listFormats().subscribe({
      next: response => {
        const detail = this.sessionDetail();
        const wantedKey = detail?.customFormatId ?? detail?.format ?? null;
        const found = wantedKey ? response.formats.find(f => f.key === wantedKey) : undefined;
        if (found) {
          this.columns.set(found.columns.map((c: RetroFormatColumn) => ({ key: c.key, label: c.label })));
          this.usingFallbackColumns.set(false);
          return;
        }
        this.applyFallbackColumns();
      },
      error: () => this.applyFallbackColumns(),
    });
  }

  private applyFallbackColumns(): void {
    const format = this.sessionDetail()?.format ?? 'CUSTOM';
    const fallback = FALLBACK_COLUMNS[format] ?? FALLBACK_COLUMNS['CUSTOM'];
    this.columns.set(fallback.map(c => ({ key: c.key, label: this.transloco.translate(c.labelKey) })));
    this.usingFallbackColumns.set(true);
  }

  /**
   * Best-effort load of the session's team members (US20.3.1), feeding the action-creation
   * form's owner picker. Failure (e.g. the repo-wide auth gap for an account-less participant)
   * simply leaves {@link teamMembers} empty — the owner field stays optional either way.
   */
  private loadTeamMembers(teamId: number): void {
    this.retroApi.listTeamMembers(teamId).subscribe({
      next: members => this.teamMembers.set(members),
      error: () => {
        // Best-effort only — see this method's TSDoc.
      },
    });
  }

  /**
   * Checks whether the session's team has any currently open retrospective action from a past
   * session (US20.3.2) — if so, the warm-up panel is shown before the phase-specific interface;
   * otherwise it is skipped automatically, with no flash of an empty panel (gated by {@link
   * warmupResolved}/{@link showWarmup}). Never blocks indefinitely: any failure here is treated
   * the same as an empty list — fail-open, matching every other best-effort call in this
   * component that is subject to the class-level auth gap.
   *
   * @param teamId the session's team, resolved from {@link sessionDetail}
   */
  private checkPendingActions(teamId: number): void {
    this.retroApi.listPendingActions(teamId).subscribe({
      next: actions => {
        this.pendingActions.set(actions);
        this.showWarmup.set(actions.length > 0);
        this.warmupResolved.set(true);
      },
      error: () => {
        this.showWarmup.set(false);
        this.warmupResolved.set(true);
      },
    });
  }

  /**
   * Appends a newly created action to {@link sessionActions}, deduplicated by id (US20.3.1) —
   * the caller's own creation can reach this both from the HTTP response and the echoed
   * `ACTION_CREATED` realtime event; every other participant's only ever from the latter.
   */
  private addSessionAction(action: RetroActionResponse): void {
    this.sessionActions.update(current => (current.some(a => a.id === action.id) ? current : [...current, action]));
  }

  private onTopicMessage(body: string): void {
    let event: RetroSessionTopicEvent;
    try {
      event = JSON.parse(body) as RetroSessionTopicEvent;
    } catch {
      return;
    }
    switch (event.type) {
      case 'CARD_ADDED':
        this.applyMaskedCardAdded(event);
        break;
      case 'PHASE_CHANGED':
        this.applyPhaseChanged(event);
        break;
      case 'CARDS_REVEALED':
        this.applyCardsRevealed(event);
        break;
      case 'VOTE_CAST':
      case 'VOTE_UNCAST':
        this.voteCounts.update(current => ({ ...current, [event.cardId]: event.voteCount }));
        break;
      case 'SESSION_CLOSED':
        this.applySessionClosed(event);
        break;
      case 'ACTION_CREATED':
        this.applyActionCreated(event);
        break;
    }
  }

  private onFacilitatorMessage(body: string): void {
    let event: CardAddedFacilitatorEvent;
    try {
      event = JSON.parse(body) as CardAddedFacilitatorEvent;
    } catch {
      return;
    }
    this.facilitatorCards.update(current => {
      const existing = current[event.columnKey] ?? [];
      return {
        ...current,
        [event.columnKey]: [...existing, { id: event.cardId, content: event.content, anonymous: event.anonymous }],
      };
    });
  }

  /** Parses and applies a `VOTE_BALANCE` event received on the caller's private queue (US20.1.2b). */
  private onVoteBalanceMessage(body: string): void {
    let event: VoteBalanceEvent;
    try {
      event = JSON.parse(body) as VoteBalanceEvent;
    } catch {
      return;
    }
    // Server-authoritative: always overwrites, never merges with the local optimistic estimate.
    this.votesRemaining.set(event.votesRemaining);
    this.votesAllowed.set(event.votesAllowed);
  }

  private applyMaskedCardAdded(event: CardAddedMaskedEvent): void {
    this.maskedCounts.update(current => ({ ...current, [event.columnKey]: event.cardCount }));
  }

  private applyPhaseChanged(event: PhaseChangedEvent): void {
    this.phase.set(event.currentPhase);
    if (event.currentPhase !== 'CONTRIBUTION') {
      this.stopCountdown();
    }
    if (event.rankedCards) {
      this.rankedCards.set(event.rankedCards);
    }
    if (event.currentPhase === 'VOTE') {
      this.retroWs.queryVoteBalance();
    }
  }

  private applyCardsRevealed(event: CardsRevealedEvent): void {
    this.revealedColumns.set(event.columns);
  }

  /** Applies a `SESSION_CLOSED` event (US20.1.2c) — switches the room to its terminal, read-only state. */
  private applySessionClosed(event: SessionClosedEvent): void {
    this.phase.set('CLOSED');
    this.closedAt.set(event.closedAt);
    this.stopCountdown();
  }

  /**
   * Applies an `ACTION_CREATED` event (US20.3.1) — lets every participant (not just the one who
   * created it) see the new action appear in {@link sessionActions} without reloading.
   */
  private applyActionCreated(event: ActionCreatedEvent): void {
    this.addSessionAction(event.action);
  }

  private resolveJoinErrorKey(error: HttpErrorResponse): string {
    if (error.status === 404) {
      return 'retro.sessionRoom.error.notFound';
    }
    if (error.status === 410) {
      return 'retro.sessionRoom.error.expired';
    }
    return 'retro.sessionRoom.error.generic';
  }
}

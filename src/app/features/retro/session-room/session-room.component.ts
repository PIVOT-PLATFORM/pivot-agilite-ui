import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { RetroApiService } from '../data-access/retro-api.service';
import { RetroSessionWsService } from '../data-access/retro-ws.service';
import {
  CardAddedFacilitatorEvent,
  CardAddedMaskedEvent,
  CardsRevealedEvent,
  PhaseChangedEvent,
  RetroFormatColumn,
  RetroParticipantAccessResponse,
  RetroPhase,
  RetroSessionResponse,
  RetroSessionTopicEvent,
  RevealedCard,
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
 */
@Component({
  selector: 'app-session-room',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
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
    this.retroWs.connect(
      access.topicDestination,
      access.accessToken,
      access.submitDestination,
      access.facilitatorTopicDestination,
    );
    // Sequenced deliberately: loadColumns() reads sessionDetail() to know which format's
    // columns to fetch, so it must only run once loadSessionDetailBestEffort() has settled
    // (success or failure) — never in parallel, which would race depending on which HTTP call
    // happens to resolve first.
    this.loadSessionDetailBestEffort();
  }

  /** Best-effort: only succeeds for an authenticated caller once real auth is wired in. */
  private loadSessionDetailBestEffort(): void {
    this.retroApi.getById(this.sessionId()).subscribe({
      next: detail => {
        this.sessionDetail.set(detail);
        this.phase.set(detail.currentPhase);
        this.startCountdownIfConfigured(detail);
        this.loadColumns();
      },
      error: () => {
        // Expected today (no bearer token attached anywhere in this app yet) — the room still
        // works fully from realtime events alone, just without a countdown display, and
        // loadColumns() falls back to a generic column set (no known format to look up).
        this.loadColumns();
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

  private applyMaskedCardAdded(event: CardAddedMaskedEvent): void {
    this.maskedCounts.update(current => ({ ...current, [event.columnKey]: event.cardCount }));
  }

  private applyPhaseChanged(event: PhaseChangedEvent): void {
    this.phase.set(event.currentPhase);
    if (event.currentPhase !== 'CONTRIBUTION') {
      this.stopCountdown();
    }
  }

  private applyCardsRevealed(event: CardsRevealedEvent): void {
    this.revealedColumns.set(event.columns);
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

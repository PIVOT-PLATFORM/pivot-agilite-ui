import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AntiRepeatMode, WheelDrawResponse, WheelResponse, WheelSpinResponse } from '../models/wheel.model';
import { ToastService } from '../services/toast.service';
import { WheelApiService } from '../services/wheel-api.service';
import { WheelWsService } from '../services/wheel-ws.service';

/**
 * Wheel detail page (US14.2.1/US14.3.1) — triggers a weighted anti-repeat draw and displays the
 * result, live, whether it was triggered locally or broadcast from another participant.
 *
 * The result region is a single {@code aria-live="polite"} container holding the actual visible
 * result text (same pattern as {@link ToastService}'s live region, rather than a hidden
 * echo-text paragraph) — a screen reader announces additions/removals within a live region by
 * default (`aria-relevant="additions text"`), so clearing then re-populating this region on every
 * spin is sufficient without a second, hidden copy of the same text. The same region is used for
 * a WebSocket-broadcast result (US14.3.1): a participant who did not click the spin button
 * themselves still hears/reads the announcement.
 *
 * US14.3.1 wires a live subscription to `/topic/agilite/wheels/{wheelId}` ({@link WheelWsService})
 * so every current viewer sees a draw appear in real time, not just the one who triggered it.
 * Animation of the wheel itself (CSS rotation) remains out of scope — Gate 1 decision, see
 * `us-diffusion-ws.md`.
 */
@Component({
  selector: 'app-wheel-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, TranslocoPipe],
  template: `
    <section class="wheel-detail">
      @if (loadError()) {
        <div role="alert">
          <p>{{ 'wheels.detail.loadError' | transloco }}</p>
          <a routerLink="/wheels">{{ 'wheels.list.title' | transloco }}</a>
        </div>
      } @else if (wheel(); as w) {
        <h1>{{ w.name }}</h1>

        <div>
          <label for="wheel-anti-repeat-mode">{{ 'wheels.detail.modeLabel' | transloco }}</label>
          <select
            id="wheel-anti-repeat-mode"
            [value]="antiRepeatMode()"
            [disabled]="spinning()"
            (change)="onModeChange($event)"
          >
            <option value="reduced_weight">{{ 'wheels.detail.mode.reduced_weight' | transloco }}</option>
            <option value="exclude">{{ 'wheels.detail.mode.exclude' | transloco }}</option>
          </select>
        </div>

        <button
          type="button"
          [disabled]="spinning() || w.entries.length === 0"
          [attr.aria-disabled]="spinning() ? 'true' : null"
          (click)="spin()"
        >
          {{ (spinning() ? 'wheels.detail.spinning' : 'wheels.detail.spin') | transloco }}
        </button>

        @if (spinNetworkError()) {
          <div role="alert">
            <p>{{ 'wheels.detail.spinError' | transloco }}</p>
          </div>
        }

        <div class="wheel-detail__result" aria-live="polite">
          @if (lastResultLabel(); as label) {
            <p>{{ 'wheels.detail.result.announce' | transloco : { label } }}</p>
          }
        </div>

        <section>
          <h2>{{ 'wheels.detail.history.title' | transloco }}</h2>
          @if (draws().length === 0) {
            <p>{{ 'wheels.detail.history.empty' | transloco }}</p>
          } @else {
            <ul>
              @for (draw of draws(); track draw.drawnAt) {
                <li>
                  <span>{{ draw.label }}</span>
                  <time [attr.datetime]="draw.drawnAt">{{ draw.drawnAt | date : 'medium' }}</time>
                </li>
              }
            </ul>
          }
        </section>
      }
    </section>
  `,
})
export class WheelDetailComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly wheelApi = inject(WheelApiService);
  private readonly wheelWs = inject(WheelWsService);
  private readonly toastService = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly wheelId: string;

  /** The wheel being viewed, or `null` until loaded. */
  readonly wheel = signal<WheelResponse | null>(null);

  /** `true` if the wheel failed to load. */
  readonly loadError = signal(false);

  /** `true` while a `spin` request is in flight — disables the spin button. */
  readonly spinning = signal(false);

  /** `true` if the last `spin` attempt failed with a network/5xx error. */
  readonly spinNetworkError = signal(false);

  /** The anti-repeat mode to use for the next spin (component-local state, not persisted). */
  readonly antiRepeatMode = signal<AntiRepeatMode>('reduced_weight');

  /**
   * The label of the most recently drawn entry, or `null` if none yet — cleared at the start of
   * every spin attempt so a failed request never leaves a stale result looking like a fresh one.
   */
  readonly lastResultLabel = signal<string | null>(null);

  /** The wheel's draw history, most recent first. */
  readonly draws = signal<WheelDrawResponse[]>([]);

  constructor() {
    this.wheelId = this.route.snapshot.paramMap.get('wheelId') ?? '';
  }

  /** Loads the wheel and its draw history, and opens the live broadcast subscription. */
  ngOnInit(): void {
    this.loadWheel();
    this.loadDraws();

    this.wheelWs.messages$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(body => this.onWheelMessage(body));
    // EN17.3 gap (documented in us-diffusion-ws.md and WheelApiService): no real bearer token is
    // available in this repo yet — the subscription is wired against the real contract, but its
    // SUBSCRIBE will be denied server-side exactly like every REST call already is without one.
    this.wheelWs.connect(this.wheelId, null);
  }

  /** Closes the live broadcast subscription when navigating away from this page. */
  ngOnDestroy(): void {
    this.wheelWs.disconnect();
  }

  /**
   * Handles a broadcast draw result (US14.3.1) — announces it in the same result region a
   * locally-triggered spin uses, and adds it to the history unless it is already present
   * (dedupes the case where the caller who triggered the spin is also subscribed to their own
   * wheel's topic and would otherwise see the draw twice — see `us-diffusion-ws.md`).
   *
   * @param body the raw STOMP message body — the exact `WheelSpinResponse` shape
   */
  private onWheelMessage(body: string): void {
    let response: WheelSpinResponse;
    try {
      response = JSON.parse(body) as WheelSpinResponse;
    } catch {
      return;
    }
    this.lastResultLabel.set(response.label);
    const alreadyPresent = this.draws().some(
      draw => draw.entryId === response.entryId && draw.drawnAt === response.drawnAt,
    );
    if (!alreadyPresent) {
      this.draws.update(current => [
        { entryId: response.entryId, label: response.label, drawnAt: response.drawnAt },
        ...current,
      ]);
    }
  }

  /** (Re)loads the wheel being viewed. */
  loadWheel(): void {
    this.wheelApi.getWheel(this.wheelId).subscribe({
      next: (wheel) => this.wheel.set(wheel),
      error: () => this.loadError.set(true),
    });
  }

  /** (Re)loads the wheel's draw history. */
  loadDraws(): void {
    this.wheelApi.listDraws(this.wheelId).subscribe({
      next: (draws) => this.draws.set(draws),
      error: () => {
        // History is secondary to the spin action itself — a failed load here does not block
        // spinning, and a stale/empty history list is preferable to blocking the whole page.
      },
    });
  }

  /** Updates the anti-repeat mode from the mode selector. */
  onModeChange(event: Event): void {
    this.antiRepeatMode.set((event.target as HTMLSelectElement).value as AntiRepeatMode);
  }

  /**
   * Triggers a weighted anti-repeat draw. Double-clicks are prevented by disabling the button
   * while {@link spinning} is `true`; the previous result is cleared immediately so a failure
   * never leaves the old result on screen looking like the outcome of this new attempt.
   */
  spin(): void {
    if (this.spinning()) {
      return;
    }
    this.spinning.set(true);
    this.spinNetworkError.set(false);
    this.lastResultLabel.set(null);

    this.wheelApi.spinWheel(this.wheelId, this.antiRepeatMode()).subscribe({
      next: (result) => {
        this.spinning.set(false);
        this.lastResultLabel.set(result.label);
        this.loadWheel();
        this.loadDraws();
      },
      error: () => {
        this.spinning.set(false);
        this.spinNetworkError.set(true);
        this.toastService.show('wheels.detail.spinError', 'error');
      },
    });
  }
}

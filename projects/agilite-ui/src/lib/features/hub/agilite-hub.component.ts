import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import {
  HubTab,
  HubView,
  TeamMember,
  WHEEL_SEG_ANGLE,
  buildHubView,
  memberById,
  pickWheelTarget,
} from './agilite-hub.model';

/** Duration (ms) of the wheel spin animation — kept in sync with the CSS transition. */
const SPIN_MS = 3450;

/**
 * Agilité module landing hub — the aggregated dashboard mounted at the module's `''` route
 * (the shell's `/agilite`, previously empty). Three tabs: **Daily** (standup board + sprint tasks +
 * history), **Roue d'équipe** (weighted random draw wheel), **Capacity** (velocity + charge vs
 * capacity).
 *
 * **Data status.** Only the wheel/retro/poker sub-features have a real backend
 * (`pivot-agilite-core`) today; Daily & Capacity have none yet (documented schema gap). This hub
 * therefore renders the pure demo view from {@link buildHubView} — the visual shell of the target
 * feature. Wiring each tab to a real endpoint (wheel API first) is the follow-up; the pure model
 * split ({@link agilite-hub.model}) keeps that swap isolated from this component.
 *
 * i18n: labels are still inline pending the module-wide Transloco catalogue wiring (a separate gap
 * shared by every pilotage/agilité screen) — externalised in the same follow-up.
 */
@Component({
  selector: 'app-agilite-hub',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './agilite-hub.component.html',
  styleUrl: './agilite-hub.component.scss',
})
export class AgiliteHubComponent {
  protected readonly tab = signal<HubTab>('daily');
  protected readonly wheelRotation = signal(0);
  protected readonly spinning = signal(false);
  protected readonly resultId = signal<string | null>(null);

  protected readonly view: HubView = buildHubView();
  protected readonly segAngle = WHEEL_SEG_ANGLE;

  protected readonly result = computed<TeamMember | null>(() => memberById(this.resultId()));

  protected select(tab: HubTab): void {
    this.tab.set(tab);
  }

  protected spin(): void {
    if (this.spinning()) {
      return;
    }
    const { memberId, rotation } = pickWheelTarget(this.wheelRotation(), Math.random());
    this.spinning.set(true);
    this.resultId.set(null);
    this.wheelRotation.set(rotation);
    setTimeout(() => {
      this.spinning.set(false);
      this.resultId.set(memberId);
    }, SPIN_MS);
  }
}

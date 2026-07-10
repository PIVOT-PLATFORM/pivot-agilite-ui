import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { TeamResponse, WheelResponse } from '../models/wheel.model';
import { ToastService } from '../services/toast.service';
import { WheelApiService } from '../services/wheel-api.service';

/**
 * Lists the wheels of the caller's active team, and lets the caller create, edit, or delete one.
 *
 * There is no shell-level "active team" concept yet (`@pivot/ui-core`/`TeamService`, EN17.3, not
 * consumable) — this component resolves the caller's teams itself (`GET /api/agilite/teams`) and
 * keeps the selected team as local, session-only state (US14.1.1 AC, "Hors périmètre").
 */
@Component({
  selector: 'app-wheel-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, TranslocoPipe],
  template: `
    <section class="wheel-list">
      <h1>{{ 'wheels.list.title' | transloco }}</h1>

      @if (teams().length === 0) {
        <p>{{ 'wheels.list.noTeams' | transloco }}</p>
      } @else {
        <label for="wheel-team-select">{{ 'wheels.list.selectTeam' | transloco }}</label>
        <select id="wheel-team-select" [value]="selectedTeamId()" (change)="onTeamChange($event)">
          @for (team of teams(); track team.id) {
            <option [value]="team.id">{{ team.name }}</option>
          }
        </select>
      }

      @if (selectedTeamId() !== null) {
        <a [routerLink]="['/wheels/new']" [queryParams]="{ teamId: selectedTeamId() }">
          {{ 'wheels.list.create' | transloco }}
        </a>

        @if (loadError()) {
          <div role="alert">
            <p>{{ 'wheels.list.loadError' | transloco }}</p>
            <button type="button" (click)="loadWheels()">{{ 'wheels.list.retry' | transloco }}</button>
          </div>
        } @else if (wheels().length === 0) {
          <p>{{ 'wheels.list.empty' | transloco }}</p>
        } @else {
          <ul>
            @for (wheel of wheels(); track wheel.id) {
              <li>
                <a [routerLink]="['/wheels', wheel.id]">{{ wheel.name }}</a>
                <a [routerLink]="['/wheels', wheel.id, 'edit']">{{ 'wheels.list.edit' | transloco }}</a>
                <button type="button" (click)="requestDelete(wheel, $event)">
                  {{ 'wheels.list.delete' | transloco }}
                </button>
              </li>
            }
          </ul>
        }
      }

      @if (pendingDelete(); as wheel) {
        <div class="dialog-backdrop">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="wheel-confirm-delete-title"
            aria-describedby="wheel-confirm-delete-message"
          >
            <h2 id="wheel-confirm-delete-title">{{ 'wheels.confirmDelete.title' | transloco }}</h2>
            <p id="wheel-confirm-delete-message">{{ 'wheels.confirmDelete.message' | transloco : { name: wheel.name } }}</p>
            <button type="button" (click)="confirmDelete(wheel)">
              {{ 'wheels.confirmDelete.confirm' | transloco }}
            </button>
            <button type="button" #cancelButton (click)="cancelDelete()">
              {{ 'wheels.confirmDelete.cancel' | transloco }}
            </button>
          </div>
        </div>
      }

      @if (toast(); as t) {
        <div [attr.role]="t.kind">
          <span>{{ t.message }}</span>
          <button type="button" (click)="dismissToast()">{{ 'wheels.list.dismiss' | transloco }}</button>
        </div>
      }
    </section>
  `,
})
export class WheelListComponent implements OnInit {
  private readonly wheelApi = inject(WheelApiService);
  private readonly toastService = inject(ToastService);
  private readonly transloco = inject(TranslocoService);

  private readonly cancelButton = viewChild<ElementRef<HTMLButtonElement>>('cancelButton');
  private triggerElement: HTMLElement | null = null;

  /** Teams the caller belongs to. */
  readonly teams = signal<TeamResponse[]>([]);

  /** Currently selected team, or `null` until teams have loaded. */
  readonly selectedTeamId = signal<number | null>(null);

  /** Wheels of the currently selected team. */
  readonly wheels = signal<WheelResponse[]>([]);

  /** `true` if the last wheel-list fetch failed. */
  readonly loadError = signal(false);

  /** The wheel pending delete confirmation, or `null`. */
  readonly pendingDelete = signal<WheelResponse | null>(null);

  /** The current toast to display, forwarded from {@link ToastService}. */
  readonly toast = this.toastService.current;

  constructor() {
    effect(() => {
      if (this.pendingDelete()) {
        this.cancelButton()?.nativeElement.focus();
      }
    });
  }

  /** Loads the caller's teams and, once available, the wheels of the first one. */
  ngOnInit(): void {
    this.wheelApi.listTeams().subscribe({
      next: (teams) => {
        this.teams.set(teams);
        if (teams.length > 0) {
          this.selectedTeamId.set(teams[0].id);
          this.loadWheels();
        }
      },
      error: () => this.loadError.set(true),
    });
  }

  /** Handles a team selection change from the `<select>` element. */
  onTeamChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.selectedTeamId.set(Number(value));
    this.loadWheels();
  }

  /** (Re)loads the wheels of the currently selected team. */
  loadWheels(): void {
    const teamId = this.selectedTeamId();
    if (teamId === null) {
      return;
    }
    this.loadError.set(false);
    this.wheelApi.listWheels(teamId).subscribe({
      next: (wheels) => this.wheels.set(wheels),
      error: () => this.loadError.set(true),
    });
  }

  /**
   * Opens the delete confirmation dialog for a wheel, remembering the triggering button so
   * focus can be restored to it once the dialog closes.
   *
   * @param wheel the wheel to potentially delete
   * @param event the click event that triggered this action
   */
  requestDelete(wheel: WheelResponse, event: Event): void {
    this.triggerElement = event.currentTarget as HTMLElement;
    this.pendingDelete.set(wheel);
  }

  /** Cancels the pending delete and restores focus to the triggering button. */
  cancelDelete(): void {
    this.pendingDelete.set(null);
    this.restoreFocus();
  }

  /**
   * Confirms deletion of the pending wheel, refreshes the list on success, and restores focus.
   *
   * @param wheel the wheel to delete
   */
  confirmDelete(wheel: WheelResponse): void {
    this.wheelApi.deleteWheel(wheel.id).subscribe({
      next: () => {
        this.pendingDelete.set(null);
        this.restoreFocus();
        this.toastService.success(this.transloco.translate('wheels.list.deleteSuccess'));
        this.loadWheels();
      },
      error: () => {
        this.pendingDelete.set(null);
        this.restoreFocus();
        this.toastService.error(this.transloco.translate('wheels.list.deleteError'));
      },
    });
  }

  /** Dismisses the current toast. */
  dismissToast(): void {
    this.toastService.dismiss();
  }

  private restoreFocus(): void {
    this.triggerElement?.focus();
    this.triggerElement = null;
  }
}

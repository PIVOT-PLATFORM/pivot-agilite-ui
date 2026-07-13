import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { TeamMemberResponse, WheelEntryRequest, WheelEntryType } from '../models/wheel.model';
import { extractErrorCode } from '../services/wheel-error.util';
import { ToastService } from '../services/toast.service';
import { WheelApiService } from '../services/wheel-api.service';

/** Local editable representation of a wheel entry, before it is mapped to a {@link WheelEntryRequest}. */
interface DraftEntry {
  readonly type: WheelEntryType;
  readonly teamMemberId?: number;
  readonly label: string;
  readonly weight: number;
}

/**
 * Creates a new wheel, or edits an existing one — same component for both modes, selected by
 * route (`/wheels/new?teamId=` vs `/wheels/:wheelId/edit`).
 */
@Component({
  selector: 'app-wheel-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, TranslocoPipe],
  template: `
    <section class="wheel-form">
      <h1>{{ (isEdit ? 'wheels.form.editTitle' : 'wheels.form.createTitle') | transloco }}</h1>

      @if (loadError()) {
        <div role="alert">
          <p>{{ 'wheels.form.loadError' | transloco }}</p>
          <a routerLink="/wheels">{{ 'wheels.list.title' | transloco }}</a>
        </div>
      } @else {
        @if (saveNetworkError()) {
          <div role="alert">
            <p>{{ 'wheels.form.saveError' | transloco }}</p>
            <button type="button" (click)="save()">{{ 'wheels.form.retry' | transloco }}</button>
          </div>
        }

        <div>
          <label for="wheel-name">{{ 'wheels.form.nameLabel' | transloco }}</label>
          <input
            id="wheel-name"
            type="text"
            [value]="name()"
            (input)="onNameInput($event)"
            [attr.aria-invalid]="fieldErrorCode() === 'INVALID_NAME' ? 'true' : null"
            [attr.aria-describedby]="fieldErrorCode() === 'INVALID_NAME' ? 'wheel-name-error' : null"
          />
          @if (fieldErrorCode() === 'INVALID_NAME') {
            <p id="wheel-name-error">{{ 'wheels.form.errors.INVALID_NAME' | transloco }}</p>
          }
        </div>

        <fieldset>
          <legend>{{ 'wheels.form.entriesTitle' | transloco }}</legend>

          @if (entries().length === 0) {
            <p id="wheel-entries-empty" role="status">{{ 'wheels.form.entriesEmpty' | transloco }}</p>
          }
          @if (fieldErrorCode() === 'DUPLICATE_ENTRY' || fieldErrorCode() === 'INVALID_ENTRY_TEAM_MEMBER') {
            <p role="alert">{{ 'wheels.form.errors.' + fieldErrorCode() | transloco }}</p>
          }

          <ul>
            @for (entry of entries(); track $index) {
              <li>
                <span>{{ entry.label }}</span>
                <label [attr.for]="'wheel-entry-weight-' + $index">{{ 'wheels.form.weightLabel' | transloco }}</label>
                <input
                  [id]="'wheel-entry-weight-' + $index"
                  type="number"
                  min="1"
                  max="10"
                  [value]="entry.weight"
                  (change)="onWeightChange($index, $event)"
                  [attr.aria-invalid]="fieldErrorCode() === 'INVALID_WEIGHT' ? 'true' : null"
                />
                <button type="button" (click)="removeEntry($index)">{{ 'wheels.form.remove' | transloco }}</button>
              </li>
            }
          </ul>

          <div>
            <label for="wheel-member-picker">{{ 'wheels.form.memberPickerLabel' | transloco }}</label>
            <select
              id="wheel-member-picker"
              [value]="selectedMemberId() ?? ''"
              (change)="onMemberSelect($event)"
            >
              <option value=""></option>
              @for (member of availableMembers(); track member.id) {
                <option [value]="member.id">{{ member.displayName }}</option>
              }
            </select>
            <button type="button" [disabled]="selectedMemberId() === null" (click)="addMember()">
              {{ 'wheels.form.addMember' | transloco }}
            </button>
          </div>

          <div>
            <label for="wheel-free-text">{{ 'wheels.form.freeTextLabel' | transloco }}</label>
            <input
              id="wheel-free-text"
              type="text"
              [value]="freeTextValue()"
              (input)="onFreeTextInput($event)"
            />
            <button type="button" [disabled]="!freeTextValue().trim()" (click)="addFreeText()">
              {{ 'wheels.form.addFreeText' | transloco }}
            </button>
            @if (duplicateWarning()) {
              <p role="alert">{{ 'wheels.form.errors.DUPLICATE_ENTRY' | transloco }}</p>
            }
          </div>
        </fieldset>

        <button
          type="button"
          [disabled]="!canSave()"
          [attr.aria-describedby]="entries().length === 0 ? 'wheel-entries-empty' : null"
          (click)="save()"
        >
          {{ (saving() ? 'wheels.form.saving' : 'wheels.form.save') | transloco }}
        </button>
      }
    </section>
  `,
})
export class WheelFormComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly wheelApi = inject(WheelApiService);
  private readonly toastService = inject(ToastService);

  /** `true` when editing an existing wheel, `false` when creating a new one. */
  readonly isEdit: boolean;

  private readonly wheelId: string | null;
  private queryTeamId: number | null = null;

  readonly teamId = signal<number | null>(null);
  readonly name = signal('');
  readonly entries = signal<DraftEntry[]>([]);
  readonly teamMembers = signal<TeamMemberResponse[]>([]);
  readonly selectedMemberId = signal<number | null>(null);
  readonly freeTextValue = signal('');
  readonly saving = signal(false);
  readonly loadError = signal(false);
  readonly saveNetworkError = signal(false);
  readonly fieldErrorCode = signal<string | null>(null);
  readonly duplicateWarning = signal(false);

  /** Team members not already added as an entry — feeds the member picker's options. */
  readonly availableMembers = computed(() =>
    this.teamMembers().filter(
      (member) => !this.entries().some((entry) => entry.type === 'team_member' && entry.teamMemberId === member.id),
    ),
  );

  /** `true` once the form can be submitted (a name and at least one entry, not already saving). */
  readonly canSave = computed(() => this.name().trim().length > 0 && this.entries().length > 0 && !this.saving());

  constructor() {
    this.wheelId = this.route.snapshot.paramMap.get('wheelId');
    this.isEdit = this.wheelId !== null;
    const teamIdParam = this.route.snapshot.queryParamMap.get('teamId');
    this.queryTeamId = teamIdParam !== null ? Number(teamIdParam) : null;
  }

  /** Loads the wheel being edited (edit mode) or the target team's members (create mode). */
  ngOnInit(): void {
    if (this.isEdit && this.wheelId !== null) {
      this.wheelApi.getWheel(this.wheelId).subscribe({
        next: (wheel) => {
          this.teamId.set(wheel.teamId);
          this.name.set(wheel.name);
          this.entries.set(
            wheel.entries.map((entry) => ({
              type: entry.type,
              teamMemberId: entry.teamMemberId ?? undefined,
              label: entry.label,
              weight: entry.weight,
            })),
          );
          this.loadTeamMembers(wheel.teamId);
        },
        error: () => this.loadError.set(true),
      });
      return;
    }

    if (this.queryTeamId === null) {
      this.loadError.set(true);
      return;
    }
    this.teamId.set(this.queryTeamId);
    this.loadTeamMembers(this.queryTeamId);
  }

  /** Updates the wheel name from the name input. */
  onNameInput(event: Event): void {
    this.name.set((event.target as HTMLInputElement).value);
  }

  /** Updates the pending member-picker selection. */
  onMemberSelect(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.selectedMemberId.set(value === '' ? null : Number(value));
  }

  /** Updates the pending free-text value. */
  onFreeTextInput(event: Event): void {
    this.freeTextValue.set((event.target as HTMLInputElement).value);
  }

  /** Updates an entry's weight, clamped to the 1–10 range. */
  onWeightChange(index: number, event: Event): void {
    const raw = Number((event.target as HTMLInputElement).value);
    const clamped = Math.min(10, Math.max(1, Math.round(raw) || 1));
    this.entries.update((list) => list.map((entry, i) => (i === index ? { ...entry, weight: clamped } : entry)));
  }

  /** Adds the currently selected team member as a new entry (default weight 1). */
  addMember(): void {
    const memberId = this.selectedMemberId();
    if (memberId === null) {
      return;
    }
    const member = this.teamMembers().find((m) => m.id === memberId);
    if (!member) {
      return;
    }
    this.entries.update((list) => [
      ...list,
      { type: 'team_member', teamMemberId: member.id, label: member.displayName, weight: 1 },
    ]);
    this.selectedMemberId.set(null);
  }

  /** Adds the current free-text value as a new entry (default weight 1), rejecting duplicates. */
  addFreeText(): void {
    const label = this.freeTextValue().trim();
    if (!label) {
      return;
    }
    const isDuplicate = this.entries().some(
      (entry) => entry.type === 'free_text' && entry.label.trim().toLowerCase() === label.toLowerCase(),
    );
    if (isDuplicate) {
      this.duplicateWarning.set(true);
      return;
    }
    this.duplicateWarning.set(false);
    this.entries.update((list) => [...list, { type: 'free_text', label, weight: 1 }]);
    this.freeTextValue.set('');
  }

  /** Removes an entry from the local draft (no network call). */
  removeEntry(index: number): void {
    this.entries.update((list) => list.filter((_, i) => i !== index));
  }

  /** Submits the wheel (create or update, depending on route). */
  save(): void {
    if (!this.canSave()) {
      return;
    }
    this.saving.set(true);
    this.fieldErrorCode.set(null);
    this.saveNetworkError.set(false);

    const payloadEntries: WheelEntryRequest[] = this.entries().map((entry) =>
      entry.type === 'team_member'
        ? { type: 'team_member', teamMemberId: entry.teamMemberId, weight: entry.weight }
        : { type: 'free_text', label: entry.label, weight: entry.weight },
    );

    const onSuccess = (): void => {
      this.saving.set(false);
      this.toastService.show('wheels.form.saveSuccess', 'success');
      this.router.navigate(['/wheels']);
    };
    const onError = (error: unknown): void => {
      this.saving.set(false);
      const code = extractErrorCode(error);
      if (code) {
        this.fieldErrorCode.set(code);
      } else {
        this.saveNetworkError.set(true);
      }
    };

    if (this.isEdit && this.wheelId !== null) {
      this.wheelApi
        .updateWheel(this.wheelId, { name: this.name().trim(), entries: payloadEntries })
        .subscribe({ next: onSuccess, error: onError });
    } else {
      const teamId = this.teamId();
      if (teamId === null) {
        this.saving.set(false);
        return;
      }
      this.wheelApi
        .createWheel({ teamId, name: this.name().trim(), entries: payloadEntries })
        .subscribe({ next: onSuccess, error: onError });
    }
  }

  private loadTeamMembers(teamId: number): void {
    this.wheelApi.listTeamMembers(teamId).subscribe({
      next: (members) => this.teamMembers.set(members),
      error: () => this.loadError.set(true),
    });
  }
}

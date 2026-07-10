import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  ElementRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormBuilder, FormControl, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { RetroApiService } from '../data-access/retro-api.service';
import {
  CreateRetroFormatRequest,
  CreateRetroSessionRequest,
  RetroFormat,
  RetroFormatDefinition,
  RetroProblemDetail,
  RetroSessionResponse,
} from '../data-access/retro.models';

/**
 * Maps a `ProblemDetail.code` (400/404 responses) to an i18n key under
 * `retro.createSession.error`. Any code not listed here — or an error with no `code` at
 * all — falls back to `retro.createSession.error.generic`. Shared between the session
 * creation call and the custom-format creation call (US20.2.1) — the two endpoints never
 * emit overlapping codes.
 */
const CODE_ERROR_KEYS: Record<string, string> = {
  INVALID_TITLE: 'retro.createSession.error.INVALID_TITLE',
  INVALID_FORMAT: 'retro.createSession.error.INVALID_FORMAT',
  INVALID_TIMER: 'retro.createSession.error.INVALID_TIMER',
  INVALID_VOTE_COUNT: 'retro.createSession.error.INVALID_VOTE_COUNT',
  // US20.2.1 — `POST /retro/sessions` with a custom format.
  CUSTOM_FORMAT_ID_REQUIRED: 'retro.createSession.error.CUSTOM_FORMAT_ID_REQUIRED',
  CUSTOM_FORMAT_NOT_FOUND: 'retro.createSession.error.CUSTOM_FORMAT_NOT_FOUND',
  CUSTOM_FORMAT_ID_NOT_ALLOWED: 'retro.createSession.error.CUSTOM_FORMAT_ID_NOT_ALLOWED',
  // US20.2.1 — `POST /retro/formats` (custom format creation).
  INVALID_FORMAT_LABEL: 'retro.createSession.error.INVALID_FORMAT_LABEL',
  CUSTOM_FORMAT_INVALID_COLUMN_COUNT: 'retro.createSession.error.CUSTOM_FORMAT_INVALID_COLUMN_COUNT',
  INVALID_COLUMN_LABEL: 'retro.createSession.error.INVALID_COLUMN_LABEL',
};

/** Maps a plain HTTP status (no usable `code`) to an i18n key. */
const STATUS_ERROR_KEYS: Record<number, string> = {
  401: 'retro.createSession.error.unauthorized',
  403: 'retro.createSession.error.teamAccessDenied',
  404: 'retro.createSession.error.teamNotFound',
};

const GENERIC_ERROR_KEY = 'retro.createSession.error.generic';

/** Bounds for the custom format column builder (US20.2.1) — mirrors the backend contract. */
const MIN_CUSTOM_COLUMNS = 2;
const MAX_CUSTOM_COLUMNS = 8;

/** A positive integer when non-empty; empty/null/undefined is valid (field is optional). */
function positiveIntegerIfPresent(control: { value: unknown }): ValidationErrors | null {
  const raw = control.value;
  const value = typeof raw === 'string' ? raw.trim() : raw;
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) && Number.isInteger(num) && num > 0 ? null : { positiveInteger: true };
}

/** Loading state of the `GET /retro/formats` catalogue (US20.2.1). */
type FormatsState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'loaded'; formats: RetroFormatDefinition[] };

/**
 * Creation form for a retrospective session (US20.1.1), extended with a format
 * picker + custom format column builder (US20.2.1).
 *
 * Client-side validation mirrors the backend contract exactly (title required
 * ≤100 chars, teamId required positive integer, format required — a system format key or
 * `CUSTOM`, timers/vote count optional-but-positive-if-filled, custom format label/columns
 * required when `CUSTOM` is chosen) but the backend remains the sole source of truth —
 * every constraint here is re-validated server-side.
 *
 * **Team picker placeholder:** there is no real team-picker infrastructure in this
 * repo yet (no `@pivot/ui-core` `TenantService`, no team-listing endpoint consumed
 * anywhere). Rather than build a fake team-search/autocomplete against
 * infrastructure that doesn't exist, this form uses a plain numeric "ID de
 * l'équipe" field. This is a deliberate, temporary placeholder — a real team
 * picker belongs to the shell/`@pivot/ui-core` once available.
 *
 * **Timers entered directly in seconds** (matching `contributionTimerSeconds` /
 * `voteTimerSeconds` / `actionTimerSeconds` 1:1) rather than via a friendlier
 * minutes input, to avoid a minutes→seconds conversion/rounding layer for this
 * first version. Can be revisited without changing {@link RetroApiService}.
 *
 * **Format picker (US20.2.1):** the 4 system formats are rendered as a native radio-button
 * group ("cards" visually, `<input type="radio">` under the hood for free keyboard/AT
 * semantics — no ARIA-only div soup), sourced from {@link RetroApiService.listFormats} so
 * the column preview shown on each card always matches the backend catalogue. A 5th,
 * static "custom format" radio reveals a column builder (2-8 column-label inputs, add/remove
 * bounded, `aria-live` announcements, explicit focus management). On submit, a chosen custom
 * format is first created via {@link RetroApiService.createFormat}, and the returned key is
 * sent as `customFormatId` alongside `format: 'CUSTOM'` in the session creation request.
 *
 * **Auth gap:** submitting calls `RetroApiService.create` (and, for a custom format,
 * `RetroApiService.createFormat` first) — both currently have no bearer token attached (see
 * that service's TSDoc) — so submission/format loading will 401 until `@pivot/ui-core` is
 * wired into this app. The form/component are otherwise fully functional and are built to
 * the final contract.
 */
@Component({
  selector: 'app-create-session',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslocoPipe],
  templateUrl: './create-session.component.html',
  styleUrl: './create-session.component.scss',
})
export class CreateSessionComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly retroApi = inject(RetroApiService);
  private readonly transloco = inject(TranslocoService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly minCustomColumns = MIN_CUSTOM_COLUMNS;
  protected readonly maxCustomColumns = MAX_CUSTOM_COLUMNS;

  protected readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(100)]],
    teamId: ['', [Validators.required, positiveIntegerIfPresent]],
    format: ['' as RetroFormat | '', [Validators.required]],
    sprintRef: ['', [Validators.maxLength(100)]],
    contributionTimerSeconds: ['', [positiveIntegerIfPresent]],
    voteTimerSeconds: ['', [positiveIntegerIfPresent]],
    actionTimerSeconds: ['', [positiveIntegerIfPresent]],
    voteCountPerParticipant: ['', [positiveIntegerIfPresent]],
  });

  /**
   * The custom format's own label and column labels (US20.2.1). Kept **outside** {@link form}
   * on purpose: their validity must only gate submission when `format === 'CUSTOM'` — folding
   * them into the same `FormGroup` would make an invalid/empty custom builder block
   * submission of a perfectly valid *system*-format session.
   */
  protected readonly customFormatLabel = this.fb.nonNullable.control('', [
    Validators.required,
    Validators.maxLength(60),
  ]);
  protected readonly customColumns = this.fb.array<FormControl<string>>([
    this.newColumnControl(),
    this.newColumnControl(),
  ]);

  protected readonly formatsState = signal<FormatsState>({ status: 'loading' });

  /** The 4 system formats from the loaded catalogue, in the order the backend returns them. */
  protected readonly systemFormats = computed<RetroFormatDefinition[]>(() => {
    const state = this.formatsState();
    return state.status === 'loaded' ? state.formats.filter(f => f.system) : [];
  });

  protected readonly submitting = signal(false);
  protected readonly session = signal<RetroSessionResponse | null>(null);
  protected readonly errorKey = signal<string | null>(null);
  protected readonly copied = signal(false);

  /** `aria-live="polite"` announcement text for the custom column builder (US20.2.1). */
  protected readonly columnAnnouncement = signal('');

  /**
   * The label of the custom format created for the *current* submission, if any (US20.2.1).
   * `RetroSessionResponse` only carries the `customFormatId` UUID, not a human label — this
   * signal fills that gap for the result summary using the label we already know locally
   * from the `createFormat()` response, without an extra round trip.
   */
  protected readonly lastCustomFormatLabel = signal<string | null>(null);

  /** Screen-reader announcement text for the aria-live region once a session is created. */
  protected readonly announceText = computed(() => {
    const created = this.session();
    if (!created) {
      return '';
    }
    return this.transloco.translate('retro.createSession.result.announce', { joinCode: created.joinCode });
  });

  ngOnInit(): void {
    this.loadFormats();
  }

  /** (Re)loads the format catalogue — also used as the "retry" action on load failure. */
  protected loadFormats(): void {
    this.formatsState.set({ status: 'loading' });
    this.retroApi.listFormats().subscribe({
      next: response => this.formatsState.set({ status: 'loaded', formats: response.formats }),
      error: () => this.formatsState.set({ status: 'error' }),
    });
  }

  /** Column names joined for the format card preview, e.g. "Commencer · Arrêter · Continuer". */
  protected columnPreview(format: RetroFormatDefinition): string {
    return format.columns.map(c => c.label).join(' · ');
  }

  /** Adds a column to the custom format builder, up to {@link maxCustomColumns}. */
  protected addColumn(): void {
    if (this.customColumns.length >= MAX_CUSTOM_COLUMNS) {
      return;
    }
    this.customColumns.push(this.newColumnControl());
    const newIndex = this.customColumns.length - 1;
    this.columnAnnouncement.set(
      this.transloco.translate('retro.createSession.customFormat.columnAdded', { position: newIndex + 1 }),
    );
    this.cdr.detectChanges();
    this.focusColumnLabel(newIndex);
  }

  /**
   * Removes a column from the custom format builder, down to {@link minCustomColumns}.
   * Moves focus to the previous column's label input (or the new first one, if the first
   * column was removed) — focus is never left on `<body>`.
   */
  protected removeColumn(index: number): void {
    if (this.customColumns.length <= MIN_CUSTOM_COLUMNS) {
      return;
    }
    this.customColumns.removeAt(index);
    this.columnAnnouncement.set(
      this.transloco.translate('retro.createSession.customFormat.columnRemoved', { position: index + 1 }),
    );
    this.cdr.detectChanges();
    const focusIndex = index > 0 ? index - 1 : 0;
    this.focusColumnLabel(focusIndex);
  }

  protected submit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const format = raw.format as RetroFormat;

    if (format === 'CUSTOM' && !this.isCustomFormatValid()) {
      this.customFormatLabel.markAsTouched();
      this.customColumns.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.errorKey.set(null);
    this.session.set(null);

    if (format === 'CUSTOM') {
      this.createCustomFormatThenSession();
    } else {
      this.createSession(format);
    }
  }

  /** Resets the form to create another session after a successful creation. */
  protected createAnother(): void {
    this.session.set(null);
    this.errorKey.set(null);
    this.copied.set(false);
    this.form.reset({
      title: '',
      teamId: '',
      format: '',
      sprintRef: '',
      contributionTimerSeconds: '',
      voteTimerSeconds: '',
      actionTimerSeconds: '',
      voteCountPerParticipant: '',
    });
    this.customFormatLabel.reset('');
    while (this.customColumns.length > MIN_CUSTOM_COLUMNS) {
      this.customColumns.removeAt(this.customColumns.length - 1);
    }
    this.customColumns.controls.forEach(c => c.reset(''));
    this.lastCustomFormatLabel.set(null);
  }

  protected async copyJoinCode(): Promise<void> {
    const created = this.session();
    if (!created) {
      return;
    }
    try {
      await navigator.clipboard.writeText(created.joinCode);
      this.copied.set(true);
    } catch {
      this.copied.set(false);
    }
  }

  /** Formats an ISO instant (`expiresAt`/`createdAt`) in the active Transloco language. */
  protected formatInstant(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return iso;
    }
    return new Intl.DateTimeFormat(this.transloco.getActiveLang(), {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  }

  private newColumnControl(): FormControl<string> {
    return this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(40)]);
  }

  private isCustomFormatValid(): boolean {
    return this.customFormatLabel.valid && this.customColumns.valid;
  }

  private focusColumnLabel(index: number): void {
    const el = this.elementRef.nativeElement.querySelector<HTMLInputElement>(`#retro-custom-column-${index}`);
    el?.focus();
  }

  private createCustomFormatThenSession(): void {
    const request: CreateRetroFormatRequest = {
      label: this.customFormatLabel.value.trim(),
      columns: this.customColumns.controls.map(c => ({ label: c.value.trim() })),
    };
    this.retroApi.createFormat(request).subscribe({
      next: createdFormat => {
        this.lastCustomFormatLabel.set(createdFormat.label);
        this.createSession('CUSTOM', createdFormat.key);
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.errorKey.set(this.resolveErrorKey(err));
      },
    });
  }

  private createSession(format: RetroFormat, customFormatId?: string): void {
    const raw = this.form.getRawValue();
    const request: CreateRetroSessionRequest = {
      title: raw.title.trim(),
      format,
      teamId: Number(raw.teamId),
      ...(customFormatId ? { customFormatId } : {}),
      ...(raw.sprintRef.trim() ? { sprintRef: raw.sprintRef.trim() } : {}),
      ...(raw.contributionTimerSeconds ? { contributionTimerSeconds: Number(raw.contributionTimerSeconds) } : {}),
      ...(raw.voteTimerSeconds ? { voteTimerSeconds: Number(raw.voteTimerSeconds) } : {}),
      ...(raw.actionTimerSeconds ? { actionTimerSeconds: Number(raw.actionTimerSeconds) } : {}),
      ...(raw.voteCountPerParticipant ? { voteCountPerParticipant: Number(raw.voteCountPerParticipant) } : {}),
    };

    this.retroApi.create(request).subscribe({
      next: created => {
        this.submitting.set(false);
        this.session.set(created);
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.errorKey.set(this.resolveErrorKey(err));
      },
    });
  }

  private resolveErrorKey(err: HttpErrorResponse): string {
    const body = err.error as RetroProblemDetail | null | undefined;
    const code = body?.code;
    if (code && CODE_ERROR_KEYS[code]) {
      return CODE_ERROR_KEYS[code];
    }
    return STATUS_ERROR_KEYS[err.status] ?? GENERIC_ERROR_KEY;
  }
}

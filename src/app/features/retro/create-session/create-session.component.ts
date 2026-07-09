import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { RetroApiService } from '../data-access/retro-api.service';
import { RETRO_FORMATS, RetroFormat, RetroProblemDetail, RetroSessionResponse } from '../data-access/retro.models';

/**
 * Maps a `ProblemDetail.code` (400 responses) to an i18n key under
 * `retro.createSession.error`. Any code not listed here — or a 400 with no `code`
 * at all — falls back to `retro.createSession.error.generic`.
 */
const CODE_ERROR_KEYS: Record<string, string> = {
  INVALID_TITLE: 'retro.createSession.error.INVALID_TITLE',
  INVALID_FORMAT: 'retro.createSession.error.INVALID_FORMAT',
  INVALID_TIMER: 'retro.createSession.error.INVALID_TIMER',
  INVALID_VOTE_COUNT: 'retro.createSession.error.INVALID_VOTE_COUNT',
};

/** Maps a plain HTTP status (no usable `code`) to an i18n key. */
const STATUS_ERROR_KEYS: Record<number, string> = {
  401: 'retro.createSession.error.unauthorized',
  403: 'retro.createSession.error.teamAccessDenied',
  404: 'retro.createSession.error.teamNotFound',
};

const GENERIC_ERROR_KEY = 'retro.createSession.error.generic';

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

/**
 * Creation form for a retrospective session (US20.1.1).
 *
 * Client-side validation mirrors the backend contract exactly (title required
 * ≤100 chars, teamId required positive integer, format required from the 5-value
 * enum, timers/vote count optional-but-positive-if-filled) but the backend remains
 * the sole source of truth — every constraint here is re-validated server-side.
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
 * **Auth gap:** submitting calls `RetroApiService.create`, which today has no
 * bearer token attached (see that service's TSDoc) — so submission will 401 until
 * `@pivot/ui-core` is wired into this app. The form/component are otherwise fully
 * functional and are built to the final contract.
 */
@Component({
  selector: 'app-create-session',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslocoPipe],
  templateUrl: './create-session.component.html',
  styleUrl: './create-session.component.scss',
})
export class CreateSessionComponent {
  private readonly fb = inject(FormBuilder);
  private readonly retroApi = inject(RetroApiService);
  private readonly transloco = inject(TranslocoService);

  /** The 5 valid retrospective formats, for the `<select>` options. */
  protected readonly formats: readonly RetroFormat[] = RETRO_FORMATS;

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

  protected readonly submitting = signal(false);
  protected readonly session = signal<RetroSessionResponse | null>(null);
  protected readonly errorKey = signal<string | null>(null);
  protected readonly copied = signal(false);

  /** Screen-reader announcement text for the aria-live region once a session is created. */
  protected readonly announceText = computed(() => {
    const created = this.session();
    if (!created) {
      return '';
    }
    return this.transloco.translate('retro.createSession.result.announce', { joinCode: created.joinCode });
  });

  protected submit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.errorKey.set(null);
    this.session.set(null);

    const raw = this.form.getRawValue();
    const request = {
      title: raw.title.trim(),
      format: raw.format as RetroFormat,
      teamId: Number(raw.teamId),
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

  private resolveErrorKey(err: HttpErrorResponse): string {
    const body = err.error as RetroProblemDetail | null | undefined;
    const code = body?.code;
    if (code && CODE_ERROR_KEYS[code]) {
      return CODE_ERROR_KEYS[code];
    }
    return STATUS_ERROR_KEYS[err.status] ?? GENERIC_ERROR_KEY;
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
}

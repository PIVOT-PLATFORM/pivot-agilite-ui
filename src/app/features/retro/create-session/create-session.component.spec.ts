import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import { CreateSessionComponent } from './create-session.component';
import { RetroApiService } from '../data-access/retro-api.service';
import { RetroSessionResponse } from '../data-access/retro.models';

/** Minimal fr/en translations covering every key exercised by these tests. */
const FR_TRANSLATIONS = {
  retro: {
    createSession: {
      title: 'Créer une session de rétrospective',
      form: {
        titleLabel: 'Titre',
        titleRequired: 'Le titre est requis.',
        titleMaxLength: 'Le titre doit contenir 100 caractères maximum.',
        teamIdLabel: "ID de l'équipe",
        teamIdHint: 'Sélecteur à venir.',
        teamIdRequired: "L'identifiant de l'équipe est requis.",
        teamIdPositive: "L'identifiant de l'équipe doit être un nombre entier positif.",
        formatLabel: 'Format',
        formatPlaceholder: 'Choisir un format',
        formatRequired: 'Le format est requis.',
        format: {
          START_STOP_CONTINUE: 'Start / Stop / Continue',
          KIF_KAF: 'KIF / KAF',
          FOUR_L: '4L',
          MAD_SAD_GLAD: 'Mad / Sad / Glad',
          CUSTOM: 'Personnalisé',
        },
        sprintRefLabel: 'Référence du sprint (optionnel)',
        sprintRefMaxLength: 'La référence du sprint doit contenir 100 caractères maximum.',
        timersLegend: 'Minuteurs par phase',
        contributionTimerLabel: 'Minuteur de contribution (secondes)',
        voteTimerLabel: 'Minuteur de vote (secondes)',
        actionTimerLabel: "Minuteur d'actions (secondes)",
        timerPositive: 'Le minuteur doit être un nombre entier de secondes strictement positif.',
        voteCountLabel: 'Nombre de votes par participant',
        voteCountPositive: 'Le nombre de votes doit être un nombre entier strictement positif.',
        submit: 'Créer la session',
        submitting: 'Création en cours…',
      },
      result: {
        heading: 'Session créée',
        joinCodeLabel: 'Code de participation',
        copy: 'Copier le code',
        copied: 'Code copié !',
        announce: 'Session créée. Code de participation : {{joinCode}}.',
        titleLabel: 'Titre',
        formatLabel: 'Format',
        phaseLabel: 'Phase actuelle',
        expiresAtLabel: 'Expire le',
        phase: {
          CONTRIBUTION: 'Contribution',
          REVUE: 'Revue',
          VOTE: 'Vote',
          ACTION: 'Actions',
          CLOSED: 'Clôturée',
        },
        createAnother: 'Créer une autre session',
      },
      error: {
        INVALID_TITLE: 'Le titre est invalide.',
        INVALID_FORMAT: 'Le format sélectionné est invalide.',
        INVALID_TIMER: 'Un des minuteurs doit être strictement positif.',
        INVALID_VOTE_COUNT: 'Le nombre de votes doit être strictement positif.',
        teamNotFound: 'Équipe introuvable.',
        teamAccessDenied: "Vous n'êtes pas membre de cette équipe.",
        unauthorized: 'Authentification requise.',
        generic: 'Une erreur est survenue.',
      },
    },
  },
};

const SESSION_RESPONSE: RetroSessionResponse = {
  id: '11111111-1111-1111-1111-111111111111',
  title: 'Rétro Sprint 8',
  format: 'START_STOP_CONTINUE',
  teamId: 42,
  facilitatorUserId: 7,
  joinCode: 'A3F9K2',
  currentPhase: 'CONTRIBUTION',
  contributionTimerSeconds: null,
  voteTimerSeconds: null,
  actionTimerSeconds: null,
  voteCountPerParticipant: 3,
  sprintRef: null,
  expiresAt: '2026-07-11T00:00:00Z',
  createdAt: '2026-07-10T00:00:00Z',
};

describe('CreateSessionComponent', () => {
  let fixture: ComponentFixture<CreateSessionComponent>;
  let component: CreateSessionComponent;
  let retroApi: { create: ReturnType<typeof vi.fn> };

  function setInputValue(id: string, value: string): void {
    const input: HTMLInputElement | null = fixture.nativeElement.querySelector(`#${id}`);
    if (!input) {
      throw new Error(`No input found for #${id}`);
    }
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  function setSelectValue(id: string, value: string): void {
    const select: HTMLSelectElement | null = fixture.nativeElement.querySelector(`#${id}`);
    if (!select) {
      throw new Error(`No select found for #${id}`);
    }
    select.value = value;
    select.dispatchEvent(new Event('change'));
  }

  function fillValidMinimalForm(): void {
    setInputValue('retro-title', 'Rétro Sprint 8');
    setInputValue('retro-team-id', '42');
    setSelectValue('retro-format', 'START_STOP_CONTINUE');
  }

  function submitForm(): void {
    const form: HTMLFormElement = fixture.nativeElement.querySelector('form');
    form.dispatchEvent(new Event('submit'));
  }

  beforeEach(async () => {
    retroApi = { create: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [
        CreateSessionComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: FR_TRANSLATIONS, en: FR_TRANSLATIONS },
          // `availableLangs` must be set explicitly — Transloco's internal `isLang()` treats
          // an empty list as "no known langs", which makes it misclassify every lang as a
          // scope and silently fail to load translations (all keys fall back to `lang.key`).
          translocoConfig: { availableLangs: ['fr', 'en'], defaultLang: 'fr' },
        }),
      ],
      providers: [{ provide: RetroApiService, useValue: retroApi }],
    }).compileComponents();

    fixture = TestBed.createComponent(CreateSessionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    // Transloco loads the active lang asynchronously (even with a synchronous `of()` testing
    // loader) — let that microtask settle and re-render before assertions run.
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('creates the component and renders the form', () => {
    expect(component).toBeTruthy();
    expect(fixture.nativeElement.querySelector('form')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Créer une session de rétrospective');
  });

  describe('client-side validation', () => {
    it('does not call the API and marks fields touched when the form is submitted empty', () => {
      submitForm();
      fixture.detectChanges();

      expect(retroApi.create).not.toHaveBeenCalled();
      expect(fixture.nativeElement.textContent).toContain('Le titre est requis.');
      expect(fixture.nativeElement.textContent).toContain("L'identifiant de l'équipe est requis.");
      expect(fixture.nativeElement.textContent).toContain('Le format est requis.');
    });

    it('rejects a title over 100 characters', () => {
      setInputValue('retro-title', 'a'.repeat(101));
      fixture.detectChanges();

      expect(component['form'].controls.title.hasError('maxlength')).toBe(true);
    });

    it('rejects a non-positive team id', () => {
      setInputValue('retro-team-id', '0');
      fixture.detectChanges();

      expect(component['form'].controls.teamId.hasError('positiveInteger')).toBe(true);
    });

    it('accepts an empty optional timer field (optional-but-positive-if-filled)', () => {
      setInputValue('retro-contribution-timer', '');
      fixture.detectChanges();

      expect(component['form'].controls.contributionTimerSeconds.valid).toBe(true);
    });

    it('rejects a zero/negative optional timer field', () => {
      setInputValue('retro-contribution-timer', '0');
      fixture.detectChanges();

      expect(component['form'].controls.contributionTimerSeconds.hasError('positiveInteger')).toBe(true);

      setInputValue('retro-vote-timer', '-5');
      fixture.detectChanges();
      expect(component['form'].controls.voteTimerSeconds.hasError('positiveInteger')).toBe(true);
    });

    it('rejects a zero/negative vote count', () => {
      setInputValue('retro-vote-count', '0');
      fixture.detectChanges();

      expect(component['form'].controls.voteCountPerParticipant.hasError('positiveInteger')).toBe(true);
    });

    it('does not submit while a positive-but-optional field is invalid, even if required fields are valid', () => {
      fillValidMinimalForm();
      setInputValue('retro-contribution-timer', '-1');
      fixture.detectChanges();

      submitForm();
      fixture.detectChanges();

      expect(retroApi.create).not.toHaveBeenCalled();
    });
  });

  describe('submit — success path', () => {
    it('calls RetroApiService.create with the exact request shape (optional fields omitted when blank)', () => {
      retroApi.create.mockReturnValue(of(SESSION_RESPONSE));
      fillValidMinimalForm();
      fixture.detectChanges();

      submitForm();

      expect(retroApi.create).toHaveBeenCalledWith({
        title: 'Rétro Sprint 8',
        format: 'START_STOP_CONTINUE',
        teamId: 42,
      });
    });

    it('includes optional fields when filled', () => {
      retroApi.create.mockReturnValue(of(SESSION_RESPONSE));
      fillValidMinimalForm();
      setInputValue('retro-sprint-ref', 'Sprint 8');
      setInputValue('retro-contribution-timer', '300');
      setInputValue('retro-vote-timer', '180');
      setInputValue('retro-action-timer', '120');
      setInputValue('retro-vote-count', '5');
      fixture.detectChanges();

      submitForm();

      expect(retroApi.create).toHaveBeenCalledWith({
        title: 'Rétro Sprint 8',
        format: 'START_STOP_CONTINUE',
        teamId: 42,
        sprintRef: 'Sprint 8',
        contributionTimerSeconds: 300,
        voteTimerSeconds: 180,
        actionTimerSeconds: 120,
        voteCountPerParticipant: 5,
      });
    });

    it('renders the created joinCode and session details after an async success (OnPush + zoneless signal update)', () => {
      retroApi.create.mockReturnValue(of(SESSION_RESPONSE));
      fillValidMinimalForm();
      fixture.detectChanges();

      submitForm();
      fixture.detectChanges();

      const text = fixture.nativeElement.textContent;
      expect(text).toContain('A3F9K2');
      expect(text).toContain('Session créée');
      expect(text).toContain('Rétro Sprint 8');
      expect(text).toContain('Start / Stop / Continue');
      expect(text).toContain('Contribution');
      // Form is no longer rendered once a session exists.
      expect(fixture.nativeElement.querySelector('form')).toBeNull();
    });

    it('resets to the form when "create another" is clicked', () => {
      retroApi.create.mockReturnValue(of(SESSION_RESPONSE));
      fillValidMinimalForm();
      fixture.detectChanges();
      submitForm();
      fixture.detectChanges();

      const again: HTMLButtonElement = fixture.nativeElement.querySelector('.create-session__another');
      again.click();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('form')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('.create-session__result')).toBeNull();
    });

    it('copies the join code to the clipboard and shows confirmation feedback', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        configurable: true,
      });

      retroApi.create.mockReturnValue(of(SESSION_RESPONSE));
      fillValidMinimalForm();
      fixture.detectChanges();
      submitForm();
      fixture.detectChanges();

      const copyBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.create-session__copy');
      copyBtn.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(writeText).toHaveBeenCalledWith('A3F9K2');
      expect(fixture.nativeElement.textContent).toContain('Code copié !');
    });

    it('does not show confirmation feedback when the clipboard write fails (e.g. denied permission)', async () => {
      const writeText = vi.fn().mockRejectedValue(new Error('denied'));
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        configurable: true,
      });

      retroApi.create.mockReturnValue(of(SESSION_RESPONSE));
      fillValidMinimalForm();
      fixture.detectChanges();
      submitForm();
      fixture.detectChanges();

      const copyBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.create-session__copy');
      copyBtn.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(writeText).toHaveBeenCalledWith('A3F9K2');
      expect(fixture.nativeElement.textContent).toContain('Copier le code');
      expect(fixture.nativeElement.textContent).not.toContain('Code copié !');
    });
  });

  describe('submit — error path', () => {
    it('maps a 400 ProblemDetail.code (INVALID_TITLE) to its dedicated message', () => {
      retroApi.create.mockReturnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              error: { code: 'INVALID_TITLE' },
              status: 400,
              statusText: 'Bad Request',
            }),
        ),
      );
      fillValidMinimalForm();
      fixture.detectChanges();

      submitForm();
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain('Le titre est invalide.');
    });

    it('maps a 403 (team access denied) to its dedicated message', () => {
      retroApi.create.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 403, statusText: 'Forbidden' })),
      );
      fillValidMinimalForm();
      fixture.detectChanges();

      submitForm();
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain("Vous n'êtes pas membre de cette équipe.");
    });

    it('maps a 404 (team not found) to its dedicated message', () => {
      retroApi.create.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 404, statusText: 'Not Found' })),
      );
      fillValidMinimalForm();
      fixture.detectChanges();

      submitForm();
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain('Équipe introuvable.');
    });

    it('maps a 401 (no/invalid token — expected bootstrap gap) to its dedicated message', () => {
      retroApi.create.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 401, statusText: 'Unauthorized' })),
      );
      fillValidMinimalForm();
      fixture.detectChanges();

      submitForm();
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain('Authentification requise.');
    });

    it('falls back to the generic message for an unmapped code / unmapped status', () => {
      retroApi.create.mockReturnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              error: { code: 'SOME_UNKNOWN_CODE' },
              status: 500,
              statusText: 'Internal Server Error',
            }),
        ),
      );
      fillValidMinimalForm();
      fixture.detectChanges();

      submitForm();
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain('Une erreur est survenue.');
    });

    it('allows retrying after an error without leftover stale error state', () => {
      retroApi.create.mockReturnValueOnce(
        throwError(() => new HttpErrorResponse({ status: 404, statusText: 'Not Found' })),
      );
      fillValidMinimalForm();
      fixture.detectChanges();
      submitForm();
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Équipe introuvable.');

      retroApi.create.mockReturnValueOnce(of(SESSION_RESPONSE));
      submitForm();
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).not.toContain('Équipe introuvable.');
      expect(fixture.nativeElement.textContent).toContain('A3F9K2');
    });
  });
});

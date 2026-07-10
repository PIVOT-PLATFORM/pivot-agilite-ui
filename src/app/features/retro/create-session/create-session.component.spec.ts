import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Subject, of, throwError } from 'rxjs';
import { CreateSessionComponent } from './create-session.component';
import { RetroApiService } from '../data-access/retro-api.service';
import { RetroFormatDefinition, RetroFormatsResponse, RetroSessionResponse } from '../data-access/retro.models';

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
        formatColumnCount: '{{count}} colonnes',
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
      formatsLoading: 'Chargement des formats…',
      formatsError: 'Impossible de charger les formats.',
      formatsRetry: 'Réessayer',
      customFormat: {
        cardHint: 'Créer un format personnalisé',
        legend: 'Format personnalisé',
        labelField: 'Nom du format personnalisé',
        labelRequired: 'Le nom du format personnalisé est requis.',
        labelMaxLength: 'Le nom du format personnalisé doit contenir 60 caractères maximum.',
        columnsHint: 'Entre 2 et 8 colonnes.',
        columnLabel: 'Libellé de la colonne {{position}}',
        columnRequired: 'Le libellé de la colonne est requis.',
        columnMaxLength: 'Le libellé de la colonne doit contenir 40 caractères maximum.',
        addColumn: 'Ajouter une colonne',
        removeColumn: 'Supprimer cette colonne',
        columnAdded: 'Colonne {{position}} ajoutée.',
        columnRemoved: 'Colonne {{position}} supprimée.',
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
        CUSTOM_FORMAT_ID_REQUIRED: 'Un format personnalisé doit être sélectionné ou créé.',
        CUSTOM_FORMAT_NOT_FOUND: 'Le format personnalisé sélectionné est introuvable.',
        CUSTOM_FORMAT_ID_NOT_ALLOWED: 'Le format personnalisé ne doit être fourni que pour le format personnalisé.',
        INVALID_FORMAT_LABEL: 'Le nom du format personnalisé est invalide.',
        CUSTOM_FORMAT_INVALID_COLUMN_COUNT: 'Le format personnalisé doit comporter entre 2 et 8 colonnes.',
        INVALID_COLUMN_LABEL: "Le libellé d'une colonne est invalide.",
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

const CUSTOM_SESSION_RESPONSE: RetroSessionResponse = {
  ...SESSION_RESPONSE,
  format: 'CUSTOM',
  customFormatId: '22222222-2222-2222-2222-222222222222',
};

const FORMATS_RESPONSE: RetroFormatsResponse = {
  formats: [
    {
      key: 'START_STOP_CONTINUE',
      label: 'Start / Stop / Continue',
      system: true,
      columns: [
        { key: 'START', label: 'Commencer', color: '#2E7D32', description: null, icon: null },
        { key: 'STOP', label: 'Arrêter', color: '#C62828', description: null, icon: null },
        { key: 'CONTINUE', label: 'Continuer', color: '#1565C0', description: null, icon: null },
      ],
    },
    {
      key: 'KIF_KAF',
      label: 'KIF / KAF',
      system: true,
      columns: [
        { key: 'KIF', label: 'Kif', color: null, description: null, icon: null },
        { key: 'KAF', label: 'Kaf', color: null, description: null, icon: null },
      ],
    },
    {
      key: 'FOUR_L',
      label: '4L',
      system: true,
      columns: [
        { key: 'LIKED', label: 'Aimé', color: null, description: null, icon: null },
        { key: 'LEARNED', label: 'Appris', color: null, description: null, icon: null },
        { key: 'LACKED', label: 'Manqué', color: null, description: null, icon: null },
        { key: 'LONGED_FOR', label: 'Souhaité', color: null, description: null, icon: null },
      ],
    },
    {
      key: 'MAD_SAD_GLAD',
      label: 'Mad / Sad / Glad',
      system: true,
      columns: [
        { key: 'MAD', label: 'Mad', color: null, description: null, icon: null },
        { key: 'SAD', label: 'Sad', color: null, description: null, icon: null },
        { key: 'GLAD', label: 'Glad', color: null, description: null, icon: null },
      ],
    },
  ],
};

const CREATED_CUSTOM_FORMAT: RetroFormatDefinition = {
  key: '22222222-2222-2222-2222-222222222222',
  label: 'Mon format',
  system: false,
  columns: [
    { key: 'COLONNE_1', label: 'Colonne A', color: null, description: null, icon: null },
    { key: 'COLONNE_2', label: 'Colonne B', color: null, description: null, icon: null },
  ],
};

describe('CreateSessionComponent', () => {
  let fixture: ComponentFixture<CreateSessionComponent>;
  let component: CreateSessionComponent;
  let retroApi: { create: ReturnType<typeof vi.fn>; listFormats: ReturnType<typeof vi.fn>; createFormat: ReturnType<typeof vi.fn> };

  function setInputValue(id: string, value: string): void {
    const input: HTMLInputElement | null = fixture.nativeElement.querySelector(`#${id}`);
    if (!input) {
      throw new Error(`No input found for #${id}`);
    }
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  /** Clicks a radio input (native click toggles `checked` + fires `change`, like a real user). */
  function selectRadio(id: string): void {
    const input: HTMLInputElement | null = fixture.nativeElement.querySelector(`#${id}`);
    if (!input) {
      throw new Error(`No radio found for #${id}`);
    }
    input.click();
  }

  function fillValidMinimalForm(): void {
    setInputValue('retro-title', 'Rétro Sprint 8');
    setInputValue('retro-team-id', '42');
    selectRadio('retro-format-START_STOP_CONTINUE');
  }

  function submitForm(): void {
    const form: HTMLFormElement = fixture.nativeElement.querySelector('form');
    form.dispatchEvent(new Event('submit'));
  }

  beforeEach(async () => {
    retroApi = {
      create: vi.fn(),
      listFormats: vi.fn().mockReturnValue(of(FORMATS_RESPONSE)),
      createFormat: vi.fn(),
    };

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
    // Attached to the document so `.focus()` calls (column builder focus management) are
    // observable via `document.activeElement` in these tests, like a real rendered page.
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    // Transloco loads the active lang asynchronously (even with a synchronous `of()` testing
    // loader) — let that microtask settle and re-render before assertions run.
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.nativeElement.remove();
  });

  it('creates the component and renders the form', () => {
    expect(component).toBeTruthy();
    expect(fixture.nativeElement.querySelector('form')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Créer une session de rétrospective');
  });

  describe('format picker (US20.2.1)', () => {
    it('loads the format catalogue on init and renders the 4 system formats as radio cards with a column preview', () => {
      expect(retroApi.listFormats).toHaveBeenCalledTimes(1);

      const text = fixture.nativeElement.textContent;
      expect(text).toContain('Start / Stop / Continue');
      expect(text).toContain('Commencer · Arrêter · Continuer');
      expect(text).toContain('KIF / KAF');
      expect(text).toContain('4L');
      expect(text).toContain('Mad / Sad / Glad');

      expect(fixture.nativeElement.querySelector('#retro-format-START_STOP_CONTINUE')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('#retro-format-KIF_KAF')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('#retro-format-FOUR_L')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('#retro-format-MAD_SAD_GLAD')).toBeTruthy();
    });

    it('renders a selectable "custom format" card alongside the 4 system ones', () => {
      const customRadio: HTMLInputElement | null = fixture.nativeElement.querySelector('#retro-format-custom');
      expect(customRadio).toBeTruthy();
      expect(customRadio?.type).toBe('radio');
      expect(fixture.nativeElement.textContent).toContain('Personnalisé');
    });

    it('shows a loading state while the format catalogue request is pending', async () => {
      const pending = new Subject<RetroFormatsResponse>();
      retroApi.listFormats.mockReturnValue(pending);

      const freshFixture = TestBed.createComponent(CreateSessionComponent);
      freshFixture.detectChanges();
      await freshFixture.whenStable();
      freshFixture.detectChanges();

      expect(freshFixture.nativeElement.textContent).toContain('Chargement des formats…');
      expect(freshFixture.nativeElement.querySelector('#retro-format-START_STOP_CONTINUE')).toBeNull();

      pending.next(FORMATS_RESPONSE);
      pending.complete();
      freshFixture.detectChanges();

      expect(freshFixture.nativeElement.querySelector('#retro-format-START_STOP_CONTINUE')).toBeTruthy();
    });

    it('shows an error state with a retry action when the format catalogue fails to load', () => {
      retroApi.listFormats.mockClear();
      retroApi.listFormats.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 401 })));

      const freshFixture = TestBed.createComponent(CreateSessionComponent);
      freshFixture.detectChanges();

      expect(freshFixture.nativeElement.textContent).toContain('Impossible de charger les formats.');
      const retryBtn: HTMLButtonElement = freshFixture.nativeElement.querySelector('.create-session__format-retry');
      expect(retryBtn).toBeTruthy();

      retroApi.listFormats.mockReturnValue(of(FORMATS_RESPONSE));
      retryBtn.click();
      freshFixture.detectChanges();

      expect(retroApi.listFormats).toHaveBeenCalledTimes(2);
      expect(freshFixture.nativeElement.querySelector('#retro-format-START_STOP_CONTINUE')).toBeTruthy();
    });

    it('updates the form value when a system format card is selected', () => {
      selectRadio('retro-format-KIF_KAF');
      fixture.detectChanges();

      expect(component['form'].controls.format.value).toBe('KIF_KAF');
    });

    it('does not reveal the custom format builder until the custom card is selected', () => {
      expect(fixture.nativeElement.querySelector('.create-session__custom-format')).toBeNull();

      selectRadio('retro-format-custom');
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.create-session__custom-format')).toBeTruthy();
    });
  });

  describe('custom format column builder (US20.2.1)', () => {
    beforeEach(() => {
      selectRadio('retro-format-custom');
      fixture.detectChanges();
    });

    it('starts with exactly 2 column label inputs (the minimum bound)', () => {
      expect(component['customColumns'].length).toBe(2);
      expect(fixture.nativeElement.querySelector('#retro-custom-column-0')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('#retro-custom-column-1')).toBeTruthy();
    });

    it('disables the remove button while only 2 columns remain', () => {
      const removeButtons: NodeListOf<HTMLButtonElement> = fixture.nativeElement.querySelectorAll(
        '.create-session__remove-column',
      );
      removeButtons.forEach(btn => expect(btn.disabled).toBe(true));
    });

    it('adds a column, up to the 8-column maximum, and disables "add" at the bound', () => {
      for (let i = 2; i < 8; i++) {
        const addBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.create-session__add-column');
        addBtn.click();
        fixture.detectChanges();
      }

      expect(component['customColumns'].length).toBe(8);
      const addBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.create-session__add-column');
      expect(addBtn.disabled).toBe(true);
    });

    it('moves focus to the newly added column label input, and announces it via aria-live', () => {
      const addBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.create-session__add-column');
      addBtn.click();
      fixture.detectChanges();

      const newInput: HTMLInputElement = fixture.nativeElement.querySelector('#retro-custom-column-2');
      expect(document.activeElement).toBe(newInput);
      expect(component['columnAnnouncement']()).toBe('Colonne 3 ajoutée.');
    });

    it('removes a column and re-enables "add" below the maximum', () => {
      const addBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.create-session__add-column');
      addBtn.click();
      fixture.detectChanges();
      expect(component['customColumns'].length).toBe(3);

      const removeButtons: NodeListOf<HTMLButtonElement> = fixture.nativeElement.querySelectorAll(
        '.create-session__remove-column',
      );
      removeButtons[2].click();
      fixture.detectChanges();

      expect(component['customColumns'].length).toBe(2);
    });

    it('moves focus to the previous column after removing a non-first column', () => {
      const addBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.create-session__add-column');
      addBtn.click();
      fixture.detectChanges();

      const removeButtons: NodeListOf<HTMLButtonElement> = fixture.nativeElement.querySelectorAll(
        '.create-session__remove-column',
      );
      removeButtons[2].click();
      fixture.detectChanges();

      expect(document.activeElement).toBe(fixture.nativeElement.querySelector('#retro-custom-column-1'));
      expect(component['columnAnnouncement']()).toBe('Colonne 3 supprimée.');
    });

    it('never disables both remove buttons below the minimum: cannot go under 2 columns', () => {
      const removeButtons: NodeListOf<HTMLButtonElement> = fixture.nativeElement.querySelectorAll(
        '.create-session__remove-column',
      );
      // A disabled native button does not dispatch `click` handlers at all — exercise the
      // defense-in-depth guard directly to prove `removeColumn` itself refuses to go under
      // the minimum, not just that the disabled attribute prevents the click.
      expect(removeButtons[0].disabled).toBe(true);
      component['removeColumn'](0);
      fixture.detectChanges();

      expect(component['customColumns'].length).toBe(2);
    });

    it('ignores addColumn calls beyond the 8-column maximum (defense in depth)', () => {
      for (let i = 2; i < 8; i++) {
        component['addColumn']();
      }
      expect(component['customColumns'].length).toBe(8);

      component['addColumn']();

      expect(component['customColumns'].length).toBe(8);
    });

    it('requires a non-empty label for the custom format name and every column on submit', () => {
      setInputValue('retro-title', 'Rétro Sprint 8');
      setInputValue('retro-team-id', '42');

      submitForm();
      fixture.detectChanges();

      expect(retroApi.createFormat).not.toHaveBeenCalled();
      expect(retroApi.create).not.toHaveBeenCalled();
      expect(fixture.nativeElement.textContent).toContain('Le nom du format personnalisé est requis.');
      expect(fixture.nativeElement.textContent).toContain('Le libellé de la colonne est requis.');
    });
  });

  describe('submit — success path (system format)', () => {
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
      expect(retroApi.createFormat).not.toHaveBeenCalled();
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

    it('resets the custom column builder back to 2 columns when "create another" is clicked after a custom submission', () => {
      retroApi.createFormat.mockReturnValue(of(CREATED_CUSTOM_FORMAT));
      retroApi.create.mockReturnValue(of(CUSTOM_SESSION_RESPONSE));
      setInputValue('retro-title', 'Rétro Sprint 8');
      setInputValue('retro-team-id', '42');
      selectRadio('retro-format-custom');
      fixture.detectChanges();
      component['addColumn'](); // 3 columns before submitting
      setInputValue('retro-custom-format-label', 'Mon format');
      setInputValue('retro-custom-column-0', 'Colonne A');
      setInputValue('retro-custom-column-1', 'Colonne B');
      setInputValue('retro-custom-column-2', 'Colonne C');
      fixture.detectChanges();
      submitForm();
      fixture.detectChanges();

      const again: HTMLButtonElement = fixture.nativeElement.querySelector('.create-session__another');
      again.click();
      fixture.detectChanges();

      expect(component['customColumns'].length).toBe(2);
      expect(component['customFormatLabel'].value).toBe('');
      expect(component['lastCustomFormatLabel']()).toBeNull();
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

  describe('submit — success path (custom format, US20.2.1)', () => {
    function fillValidCustomForm(): void {
      setInputValue('retro-title', 'Rétro Sprint 8');
      setInputValue('retro-team-id', '42');
      selectRadio('retro-format-custom');
      fixture.detectChanges();
      setInputValue('retro-custom-format-label', 'Mon format');
      setInputValue('retro-custom-column-0', 'Colonne A');
      setInputValue('retro-custom-column-1', 'Colonne B');
    }

    it('creates the custom format first, then the session with the returned key as customFormatId', () => {
      retroApi.createFormat.mockReturnValue(of(CREATED_CUSTOM_FORMAT));
      retroApi.create.mockReturnValue(of(CUSTOM_SESSION_RESPONSE));
      fillValidCustomForm();
      fixture.detectChanges();

      submitForm();

      expect(retroApi.createFormat).toHaveBeenCalledWith({
        label: 'Mon format',
        columns: [{ label: 'Colonne A' }, { label: 'Colonne B' }],
      });
      expect(retroApi.create).toHaveBeenCalledWith({
        title: 'Rétro Sprint 8',
        format: 'CUSTOM',
        teamId: 42,
        customFormatId: '22222222-2222-2222-2222-222222222222',
      });
    });

    it('never sends customFormatId when a system format is submitted', () => {
      retroApi.create.mockReturnValue(of(SESSION_RESPONSE));
      fillValidMinimalForm();
      fixture.detectChanges();

      submitForm();

      const call = retroApi.create.mock.calls[0][0];
      expect(call).not.toHaveProperty('customFormatId');
    });

    it('shows the created custom format label in the result summary', () => {
      retroApi.createFormat.mockReturnValue(of(CREATED_CUSTOM_FORMAT));
      retroApi.create.mockReturnValue(of(CUSTOM_SESSION_RESPONSE));
      fillValidCustomForm();
      fixture.detectChanges();

      submitForm();
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain('Mon format');
    });

    it('does not create the session if custom format creation fails', () => {
      retroApi.createFormat.mockReturnValue(
        throwError(() => new HttpErrorResponse({ error: { code: 'INVALID_FORMAT_LABEL' }, status: 400 })),
      );
      fillValidCustomForm();
      fixture.detectChanges();

      submitForm();
      fixture.detectChanges();

      expect(retroApi.create).not.toHaveBeenCalled();
      expect(fixture.nativeElement.textContent).toContain('Le nom du format personnalisé est invalide.');
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

    describe('US20.2.1 — new session-creation error codes', () => {
      function fillValidCustomFormSelectionOnly(): void {
        setInputValue('retro-title', 'Rétro Sprint 8');
        setInputValue('retro-team-id', '42');
        selectRadio('retro-format-custom');
        fixture.detectChanges();
        setInputValue('retro-custom-format-label', 'Mon format');
        setInputValue('retro-custom-column-0', 'Colonne A');
        setInputValue('retro-custom-column-1', 'Colonne B');
      }

      it('maps CUSTOM_FORMAT_ID_REQUIRED to its dedicated message', () => {
        retroApi.createFormat.mockReturnValue(of(CREATED_CUSTOM_FORMAT));
        retroApi.create.mockReturnValue(
          throwError(() => new HttpErrorResponse({ error: { code: 'CUSTOM_FORMAT_ID_REQUIRED' }, status: 400 })),
        );
        fillValidCustomFormSelectionOnly();
        fixture.detectChanges();

        submitForm();
        fixture.detectChanges();

        expect(fixture.nativeElement.textContent).toContain('Un format personnalisé doit être sélectionné ou créé.');
      });

      it('maps CUSTOM_FORMAT_NOT_FOUND (404) to its dedicated message, distinct from the generic team-not-found one', () => {
        retroApi.createFormat.mockReturnValue(of(CREATED_CUSTOM_FORMAT));
        retroApi.create.mockReturnValue(
          throwError(() => new HttpErrorResponse({ error: { code: 'CUSTOM_FORMAT_NOT_FOUND' }, status: 404 })),
        );
        fillValidCustomFormSelectionOnly();
        fixture.detectChanges();

        submitForm();
        fixture.detectChanges();

        const text = fixture.nativeElement.textContent;
        expect(text).toContain('Le format personnalisé sélectionné est introuvable.');
        expect(text).not.toContain('Équipe introuvable.');
      });

      it('maps CUSTOM_FORMAT_ID_NOT_ALLOWED to its dedicated message', () => {
        retroApi.createFormat.mockReturnValue(of(CREATED_CUSTOM_FORMAT));
        retroApi.create.mockReturnValue(
          throwError(() => new HttpErrorResponse({ error: { code: 'CUSTOM_FORMAT_ID_NOT_ALLOWED' }, status: 400 })),
        );
        fillValidCustomFormSelectionOnly();
        fixture.detectChanges();

        submitForm();
        fixture.detectChanges();

        expect(fixture.nativeElement.textContent).toContain(
          'Le format personnalisé ne doit être fourni que pour le format personnalisé.',
        );
      });
    });

    describe('US20.2.1 — new custom-format-creation error codes', () => {
      function fillValidCustomFormSelectionOnly(): void {
        setInputValue('retro-title', 'Rétro Sprint 8');
        setInputValue('retro-team-id', '42');
        selectRadio('retro-format-custom');
        fixture.detectChanges();
        setInputValue('retro-custom-format-label', 'Mon format');
        setInputValue('retro-custom-column-0', 'Colonne A');
        setInputValue('retro-custom-column-1', 'Colonne B');
      }

      it('maps INVALID_FORMAT_LABEL to its dedicated message', () => {
        retroApi.createFormat.mockReturnValue(
          throwError(() => new HttpErrorResponse({ error: { code: 'INVALID_FORMAT_LABEL' }, status: 400 })),
        );
        fillValidCustomFormSelectionOnly();
        fixture.detectChanges();

        submitForm();
        fixture.detectChanges();

        expect(fixture.nativeElement.textContent).toContain('Le nom du format personnalisé est invalide.');
      });

      it('maps CUSTOM_FORMAT_INVALID_COLUMN_COUNT to its dedicated message', () => {
        retroApi.createFormat.mockReturnValue(
          throwError(
            () => new HttpErrorResponse({ error: { code: 'CUSTOM_FORMAT_INVALID_COLUMN_COUNT' }, status: 400 }),
          ),
        );
        fillValidCustomFormSelectionOnly();
        fixture.detectChanges();

        submitForm();
        fixture.detectChanges();

        expect(fixture.nativeElement.textContent).toContain(
          'Le format personnalisé doit comporter entre 2 et 8 colonnes.',
        );
      });

      it('maps INVALID_COLUMN_LABEL to its dedicated message', () => {
        retroApi.createFormat.mockReturnValue(
          throwError(() => new HttpErrorResponse({ error: { code: 'INVALID_COLUMN_LABEL' }, status: 400 })),
        );
        fillValidCustomFormSelectionOnly();
        fixture.detectChanges();

        submitForm();
        fixture.detectChanges();

        expect(fixture.nativeElement.textContent).toContain("Le libellé d'une colonne est invalide.");
      });
    });
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
});

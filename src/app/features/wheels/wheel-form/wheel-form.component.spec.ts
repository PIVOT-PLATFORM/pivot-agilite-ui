import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { vi } from 'vitest';
import { environment } from '../../../../environments/environment';
import { WheelResponse } from '../models/wheel.model';
import { WheelFormComponent } from './wheel-form.component';

const wheel: WheelResponse = {
  id: 'w-1',
  name: 'Retro roulette',
  teamId: 1,
  tenantId: 1,
  entries: [
    { id: 'e-1', type: 'team_member', teamMemberId: 10, label: 'Ada Lovelace', weight: 2 },
    { id: 'e-2', type: 'free_text', teamMemberId: null, label: 'Guest', weight: 1 },
  ],
  lastDrawnEntryId: null,
  createdAt: '2026-07-10T00:00:00Z',
  updatedAt: '2026-07-10T00:00:00Z',
};

describe('WheelFormComponent — create mode', () => {
  let httpMock: HttpTestingController;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WheelFormComponent, TranslocoTestingModule.forRoot({ langs: { fr: {}, en: {} } })],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({}),
              queryParamMap: convertToParamMap({ teamId: '1' }),
            },
          },
        },
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
  });

  afterEach(() => httpMock.verify());

  function createFixture() {
    const fixture = TestBed.createComponent(WheelFormComponent);
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiUrl}/teams/1/members`).flush([{ id: 10, userId: 100, displayName: 'Ada Lovelace' }]);
    fixture.detectChanges();
    return fixture;
  }

  it('is not in edit mode and loads the target team members', () => {
    const fixture = createFixture();
    expect(fixture.componentInstance.isEdit).toBe(false);
    expect(fixture.componentInstance.availableMembers()).toEqual([{ id: 10, userId: 100, displayName: 'Ada Lovelace' }]);
  });

  it('drives the member picker and the free-text input through real DOM events', () => {
    const fixture = createFixture();
    const cmp = fixture.componentInstance;
    const el: HTMLElement = fixture.nativeElement;

    const picker = el.querySelector('#wheel-member-picker') as HTMLSelectElement;
    picker.value = '10';
    picker.dispatchEvent(new Event('change'));
    expect(cmp.selectedMemberId()).toBe(10);

    const memberAddButton = picker.parentElement?.querySelector('button') as HTMLButtonElement;
    memberAddButton.dispatchEvent(new Event('click'));
    fixture.detectChanges();
    expect(cmp.entries()).toEqual([{ type: 'team_member', teamMemberId: 10, label: 'Ada Lovelace', weight: 1 }]);

    const freeText = el.querySelector('#wheel-free-text') as HTMLInputElement;
    freeText.value = 'Guest';
    freeText.dispatchEvent(new Event('input'));
    expect(cmp.freeTextValue()).toBe('Guest');

    const freeTextAddButton = freeText.parentElement?.querySelector('button') as HTMLButtonElement;
    freeTextAddButton.dispatchEvent(new Event('click'));
    fixture.detectChanges();
    expect(cmp.entries().length).toBe(2);
  });

  it('save button click submits the wheel and navigates on success', () => {
    const fixture = createFixture();
    const cmp = fixture.componentInstance;
    const el: HTMLElement = fixture.nativeElement;
    cmp.name.set('Retro roulette');
    cmp.onFreeTextInput({ target: { value: 'Guest' } } as unknown as Event);
    cmp.addFreeText();
    fixture.detectChanges();

    const saveButton = Array.from(el.querySelectorAll('button')).at(-1) as HTMLButtonElement;
    saveButton.dispatchEvent(new Event('click'));

    httpMock.expectOne(`${environment.apiUrl}/wheels`).flush({
      id: 'w-2',
      name: 'Retro roulette',
      teamId: 1,
      tenantId: 1,
      entries: [],
      lastDrawnEntryId: null,
      createdAt: '2026-07-10T00:00:00Z',
      updatedAt: '2026-07-10T00:00:00Z',
    });

    expect(router.navigate).toHaveBeenCalledWith(['/wheels']);
  });

  it('disables save while there are no entries, enables it once one is added', () => {
    const fixture = createFixture();
    const cmp = fixture.componentInstance;
    cmp.name.set('Retro roulette');
    expect(cmp.canSave()).toBe(false);

    cmp.onFreeTextInput({ target: { value: 'Bob' } } as unknown as Event);
    cmp.addFreeText();
    expect(cmp.canSave()).toBe(true);
  });

  it('adds a team-member entry, then a free-text entry, and removes one', () => {
    const fixture = createFixture();
    const cmp = fixture.componentInstance;
    cmp.name.set('Retro roulette');

    cmp.onMemberSelect({ target: { value: '10' } } as unknown as Event);
    cmp.addMember();
    expect(cmp.entries()).toEqual([{ type: 'team_member', teamMemberId: 10, label: 'Ada Lovelace', weight: 1 }]);
    expect(cmp.availableMembers()).toEqual([]);

    cmp.onFreeTextInput({ target: { value: 'Guest' } } as unknown as Event);
    cmp.addFreeText();
    expect(cmp.entries().length).toBe(2);
    expect(cmp.canSave()).toBe(true);

    cmp.removeEntry(0);
    expect(cmp.entries()).toEqual([{ type: 'free_text', label: 'Guest', weight: 1 }]);

    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Guest');
  });

  it('sets loadError when the target team\'s members cannot be loaded', () => {
    const fixture = TestBed.createComponent(WheelFormComponent);
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiUrl}/teams/1/members`).flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.componentInstance.loadError()).toBe(true);
  });

  it('save() is a defensive no-op if teamId is somehow unresolved in create mode', () => {
    const fixture = createFixture();
    const cmp = fixture.componentInstance;
    cmp.name.set('Retro roulette');
    cmp.onFreeTextInput({ target: { value: 'Guest' } } as unknown as Event);
    cmp.addFreeText();
    cmp.teamId.set(null);

    cmp.save();

    expect(cmp.saving()).toBe(false);
    httpMock.expectNone(`${environment.apiUrl}/wheels`);
  });

  it('save() is a no-op when canSave() is false (defensive guard)', () => {
    const fixture = createFixture();
    const cmp = fixture.componentInstance;
    expect(cmp.canSave()).toBe(false);

    cmp.save();

    expect(cmp.saving()).toBe(false);
    httpMock.expectNone(`${environment.apiUrl}/wheels`);
  });

  it('addMember() is a no-op when the selected member id is unknown', () => {
    const fixture = createFixture();
    const cmp = fixture.componentInstance;
    cmp.selectedMemberId.set(999);

    cmp.addMember();

    expect(cmp.entries()).toEqual([]);
  });

  it('addFreeText() is a no-op for a whitespace-only value', () => {
    const fixture = createFixture();
    const cmp = fixture.componentInstance;
    cmp.onFreeTextInput({ target: { value: '   ' } } as unknown as Event);

    cmp.addFreeText();

    expect(cmp.entries()).toEqual([]);
  });

  it('addMember() is a no-op when no member is selected', () => {
    const fixture = createFixture();
    const cmp = fixture.componentInstance;

    cmp.addMember();

    expect(cmp.entries()).toEqual([]);
  });

  it('onNameInput() updates the name signal from the input element', () => {
    const fixture = createFixture();
    const cmp = fixture.componentInstance;

    cmp.onNameInput({ target: { value: 'New name' } } as unknown as Event);

    expect(cmp.name()).toBe('New name');
  });

  it('rejects a duplicate free-text entry (case/whitespace-insensitive)', () => {
    const fixture = createFixture();
    const cmp = fixture.componentInstance;

    cmp.onFreeTextInput({ target: { value: 'Guest' } } as unknown as Event);
    cmp.addFreeText();
    cmp.onFreeTextInput({ target: { value: '  guest  ' } } as unknown as Event);
    cmp.addFreeText();

    expect(cmp.entries().length).toBe(1);
    expect(cmp.duplicateWarning()).toBe(true);
  });

  it('clamps weight input to the 1-10 range', () => {
    const fixture = createFixture();
    const cmp = fixture.componentInstance;
    cmp.onFreeTextInput({ target: { value: 'Guest' } } as unknown as Event);
    cmp.addFreeText();

    cmp.onWeightChange(0, { target: { value: '42' } } as unknown as Event);
    expect(cmp.entries()[0].weight).toBe(10);

    cmp.onWeightChange(0, { target: { value: '0' } } as unknown as Event);
    expect(cmp.entries()[0].weight).toBe(1);
  });

  it('save() posts the wheel and navigates to the list on success', () => {
    const fixture = createFixture();
    const cmp = fixture.componentInstance;
    const navigateSpy = router.navigate as unknown as ReturnType<typeof vi.fn>;

    cmp.name.set('Retro roulette');
    cmp.onFreeTextInput({ target: { value: 'Guest' } } as unknown as Event);
    cmp.addFreeText();
    cmp.save();

    const req = httpMock.expectOne(`${environment.apiUrl}/wheels`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ teamId: 1, name: 'Retro roulette', entries: [{ type: 'free_text', label: 'Guest', weight: 1 }] });
    req.flush(wheel);

    expect(navigateSpy).toHaveBeenCalledWith(['/wheels']);
  });

  it('save() surfaces a known error code inline instead of a generic toast', () => {
    const fixture = createFixture();
    const cmp = fixture.componentInstance;
    cmp.name.set('Retro roulette');
    cmp.onFreeTextInput({ target: { value: 'Guest' } } as unknown as Event);
    cmp.addFreeText();
    cmp.save();

    const req = httpMock.expectOne(`${environment.apiUrl}/wheels`);
    req.flush({ title: 'Validation failed', code: 'DUPLICATE_ENTRY' }, { status: 400, statusText: 'Bad Request' });

    expect(cmp.fieldErrorCode()).toBe('DUPLICATE_ENTRY');
    expect(cmp.saveNetworkError()).toBe(false);
  });

  it('save() falls back to a network-error banner when the response has no code', () => {
    const fixture = createFixture();
    const cmp = fixture.componentInstance;
    cmp.name.set('Retro roulette');
    cmp.onFreeTextInput({ target: { value: 'Guest' } } as unknown as Event);
    cmp.addFreeText();
    cmp.save();

    const req = httpMock.expectOne(`${environment.apiUrl}/wheels`);
    req.flush('boom', { status: 500, statusText: 'Server Error' });

    expect(cmp.saveNetworkError()).toBe(true);
    expect(cmp.fieldErrorCode()).toBeNull();
  });
});

describe('WheelFormComponent — create mode without a teamId', () => {
  it('sets loadError when navigated to without a teamId query param', async () => {
    await TestBed.configureTestingModule({
      imports: [WheelFormComponent, TranslocoTestingModule.forRoot({ langs: { fr: {}, en: {} } })],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: convertToParamMap({}), queryParamMap: convertToParamMap({}) },
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(WheelFormComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.loadError()).toBe(true);
    TestBed.inject(HttpTestingController).verify();
  });
});

describe('WheelFormComponent — edit mode', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WheelFormComponent, TranslocoTestingModule.forRoot({ langs: { fr: {}, en: {} } })],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ wheelId: 'w-1' }),
              queryParamMap: convertToParamMap({}),
            },
          },
        },
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  afterEach(() => httpMock.verify());

  it('loads the existing wheel and its team members, pre-filling name and entries', () => {
    const fixture = TestBed.createComponent(WheelFormComponent);
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiUrl}/wheels/w-1`).flush(wheel);
    httpMock.expectOne(`${environment.apiUrl}/teams/1/members`).flush([{ id: 10, userId: 100, displayName: 'Ada Lovelace' }]);
    fixture.detectChanges();

    const cmp = fixture.componentInstance;
    expect(cmp.isEdit).toBe(true);
    expect(cmp.name()).toBe('Retro roulette');
    expect(cmp.entries()).toEqual([
      { type: 'team_member', teamMemberId: 10, label: 'Ada Lovelace', weight: 2 },
      { type: 'free_text', teamMemberId: undefined, label: 'Guest', weight: 1 },
    ]);
    // the already-added member must not appear again in the picker
    expect(cmp.availableMembers()).toEqual([]);
  });

  it('sets loadError when the wheel cannot be loaded (not found / not a member)', () => {
    const fixture = TestBed.createComponent(WheelFormComponent);
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiUrl}/wheels/w-1`).flush('not found', { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();

    expect(fixture.componentInstance.loadError()).toBe(true);
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[role="alert"]')).toBeTruthy();
  });

  it('save() puts the updated wheel without a teamId in the body', () => {
    const fixture = TestBed.createComponent(WheelFormComponent);
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiUrl}/wheels/w-1`).flush(wheel);
    httpMock.expectOne(`${environment.apiUrl}/teams/1/members`).flush([{ id: 10, userId: 100, displayName: 'Ada Lovelace' }]);
    fixture.detectChanges();

    fixture.componentInstance.save();
    const req = httpMock.expectOne(`${environment.apiUrl}/wheels/w-1`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.teamId).toBeUndefined();
    req.flush(wheel);
  });
});

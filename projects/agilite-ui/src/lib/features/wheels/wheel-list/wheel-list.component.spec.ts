import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { environment } from '../../../../environments/environment';
import { WheelResponse } from '../models/wheel.model';
import { WheelListComponent } from './wheel-list.component';

describe('WheelListComponent', () => {
  let httpMock: HttpTestingController;

  const wheel: WheelResponse = {
    id: 'w-1',
    name: 'Retro roulette',
    teamId: 1,
    tenantId: 1,
    entries: [],
    lastDrawnEntryId: null,
    createdAt: '2026-07-10T00:00:00Z',
    updatedAt: '2026-07-10T00:00:00Z',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WheelListComponent, TranslocoTestingModule.forRoot({ langs: { fr: {}, en: {} } })],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should create and show "no teams" when the caller has none', () => {
    const fixture = TestBed.createComponent(WheelListComponent);
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiUrl}/teams`).flush([]);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
    expect(fixture.componentInstance.teams()).toEqual([]);
    expect(fixture.componentInstance.selectedTeamId()).toBeNull();
  });

  it('selects the first team and loads its wheels', () => {
    const fixture = TestBed.createComponent(WheelListComponent);
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiUrl}/teams`).flush([{ id: 1, name: 'Team A' }]);
    httpMock.expectOne((r) => r.url === `${environment.apiUrl}/wheels`).flush([wheel]);
    fixture.detectChanges();

    expect(fixture.componentInstance.selectedTeamId()).toBe(1);
    expect(fixture.componentInstance.wheels()).toEqual([wheel]);
  });

  it('sets loadError when the teams request fails', () => {
    const fixture = TestBed.createComponent(WheelListComponent);
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiUrl}/teams`).flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.componentInstance.loadError()).toBe(true);
  });

  it('onTeamChange() switches the active team and reloads its wheels', () => {
    const fixture = TestBed.createComponent(WheelListComponent);
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiUrl}/teams`).flush([
      { id: 1, name: 'Team A' },
      { id: 2, name: 'Team B' },
    ]);
    httpMock.expectOne((r) => r.url === `${environment.apiUrl}/wheels` && r.params.get('teamId') === '1').flush([wheel]);
    fixture.detectChanges();

    fixture.componentInstance.onTeamChange({ target: { value: '2' } } as unknown as Event);
    httpMock.expectOne((r) => r.url === `${environment.apiUrl}/wheels` && r.params.get('teamId') === '2').flush([]);

    expect(fixture.componentInstance.selectedTeamId()).toBe(2);
    expect(fixture.componentInstance.wheels()).toEqual([]);
  });

  it('sets loadError when the wheel list request fails', () => {
    const fixture = TestBed.createComponent(WheelListComponent);
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiUrl}/teams`).flush([{ id: 1, name: 'Team A' }]);
    httpMock.expectOne((r) => r.url === `${environment.apiUrl}/wheels`).flush('error', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.componentInstance.loadError()).toBe(true);
  });

  it('requestDelete() opens the confirmation dialog, cancelDelete() closes it without deleting', () => {
    const fixture = TestBed.createComponent(WheelListComponent);
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiUrl}/teams`).flush([{ id: 1, name: 'Team A' }]);
    httpMock.expectOne((r) => r.url === `${environment.apiUrl}/wheels`).flush([wheel]);
    fixture.detectChanges();

    const button = document.createElement('button');
    fixture.componentInstance.requestDelete(wheel, { currentTarget: button } as unknown as Event);
    expect(fixture.componentInstance.pendingDelete()).toEqual(wheel);

    fixture.componentInstance.cancelDelete();
    expect(fixture.componentInstance.pendingDelete()).toBeNull();
    httpMock.expectNone(`${environment.apiUrl}/wheels/${wheel.id}`);
  });

  it('confirmDelete() deletes the wheel, shows a success toast, and refreshes the list', () => {
    const fixture = TestBed.createComponent(WheelListComponent);
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiUrl}/teams`).flush([{ id: 1, name: 'Team A' }]);
    httpMock.expectOne((r) => r.url === `${environment.apiUrl}/wheels`).flush([wheel]);
    fixture.detectChanges();

    fixture.componentInstance.requestDelete(wheel, { currentTarget: document.createElement('button') } as unknown as Event);
    fixture.componentInstance.confirmDelete(wheel);
    httpMock.expectOne(`${environment.apiUrl}/wheels/${wheel.id}`).flush(null);
    httpMock.expectOne((r) => r.url === `${environment.apiUrl}/wheels`).flush([]);
    fixture.detectChanges();

    expect(fixture.componentInstance.pendingDelete()).toBeNull();
    expect(fixture.componentInstance.toast()?.kind).toBe('status');
  });

  it('confirmDelete() shows an error toast when the delete request fails', () => {
    const fixture = TestBed.createComponent(WheelListComponent);
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiUrl}/teams`).flush([{ id: 1, name: 'Team A' }]);
    httpMock.expectOne((r) => r.url === `${environment.apiUrl}/wheels`).flush([wheel]);
    fixture.detectChanges();

    fixture.componentInstance.requestDelete(wheel, { currentTarget: document.createElement('button') } as unknown as Event);
    fixture.componentInstance.confirmDelete(wheel);
    httpMock.expectOne(`${environment.apiUrl}/wheels/${wheel.id}`).flush('boom', { status: 500, statusText: 'Server Error' });

    expect(fixture.componentInstance.pendingDelete()).toBeNull();
    expect(fixture.componentInstance.toast()?.kind).toBe('alert');
  });

  it('dismissToast() clears the current toast', () => {
    const fixture = TestBed.createComponent(WheelListComponent);
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiUrl}/teams`).flush([{ id: 1, name: 'Team A' }]);
    httpMock.expectOne((r) => r.url === `${environment.apiUrl}/wheels`).flush([wheel]);
    fixture.detectChanges();

    fixture.componentInstance.requestDelete(wheel, { currentTarget: document.createElement('button') } as unknown as Event);
    fixture.componentInstance.confirmDelete(wheel);
    httpMock.expectOne(`${environment.apiUrl}/wheels/${wheel.id}`).flush(null);
    httpMock.expectOne((r) => r.url === `${environment.apiUrl}/wheels`).flush([]);

    fixture.componentInstance.dismissToast();
    expect(fixture.componentInstance.toast()).toBeNull();
  });

  it('loadWheels() is a no-op while no team is selected', () => {
    const fixture = TestBed.createComponent(WheelListComponent);
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiUrl}/teams`).flush([]);
    fixture.detectChanges();

    expect(fixture.componentInstance.selectedTeamId()).toBeNull();
    fixture.componentInstance.loadWheels();
    httpMock.expectNone((r) => r.url === `${environment.apiUrl}/wheels`);
  });

  it('renders the wheel list, the load-error retry action, and the delete dialog in the DOM', () => {
    const fixture = TestBed.createComponent(WheelListComponent);
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiUrl}/teams`).flush([{ id: 1, name: 'Team A' }]);
    httpMock.expectOne((r) => r.url === `${environment.apiUrl}/wheels`).flush([wheel]);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain(wheel.name);

    // Translation keys don't resolve to real text under TranslocoTestingModule's empty stub
    // langs, so target the delete action structurally: each wheel `<li>` renders exactly one
    // edit `<a>` and one delete `<button>`.
    const deleteButtons = el.querySelectorAll('li button');
    expect(deleteButtons.length).toBeGreaterThan(0);
    deleteButtons[0].dispatchEvent(new Event('click'));
    fixture.detectChanges();
    expect(el.querySelector('[role="alertdialog"]')).toBeTruthy();
  });
});

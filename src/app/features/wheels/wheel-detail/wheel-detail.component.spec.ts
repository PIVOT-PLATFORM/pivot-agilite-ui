import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Subject } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { WheelDrawResponse, WheelResponse } from '../models/wheel.model';
import { WheelWsService } from '../services/wheel-ws.service';
import { WheelDetailComponent } from './wheel-detail.component';

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

const spinResponse = {
  wheelId: 'w-1',
  entryId: 'e-1',
  label: 'Ada Lovelace',
  drawnAt: '2026-07-10T00:00:00Z',
  antiRepeatMode: 'reduced_weight',
};

const existingDraw: WheelDrawResponse = {
  entryId: 'e-2',
  label: 'Guest',
  drawnAt: '2026-07-09T00:00:00Z',
};

describe('WheelDetailComponent', () => {
  let httpMock: HttpTestingController;
  let wsConnectSpy: ReturnType<typeof vi.fn>;
  let wsDisconnectSpy: ReturnType<typeof vi.fn>;
  let wsMessages$: Subject<string>;

  beforeEach(async () => {
    wsConnectSpy = vi.fn();
    wsDisconnectSpy = vi.fn();
    wsMessages$ = new Subject<string>();

    await TestBed.configureTestingModule({
      imports: [WheelDetailComponent, TranslocoTestingModule.forRoot({ langs: { fr: {}, en: {} } })],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ wheelId: 'w-1' }) } },
        },
        {
          provide: WheelWsService,
          useValue: { connect: wsConnectSpy, disconnect: wsDisconnectSpy, messages$: wsMessages$ },
        },
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function createFixture(draws: WheelDrawResponse[] = [existingDraw]) {
    const fixture = TestBed.createComponent(WheelDetailComponent);
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiUrl}/wheels/w-1`).flush(wheel);
    httpMock.expectOne((r) => r.url === `${environment.apiUrl}/wheels/w-1/draws`).flush(draws);
    fixture.detectChanges();
    return fixture;
  }

  it('loads the wheel and its draw history on init', () => {
    const fixture = createFixture();
    expect(fixture.componentInstance.wheel()).toEqual(wheel);
    expect(fixture.componentInstance.draws()).toEqual([existingDraw]);
  });

  it('shows the load error banner when the wheel fails to load', () => {
    const fixture = TestBed.createComponent(WheelDetailComponent);
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiUrl}/wheels/w-1`).flush(null, { status: 404, statusText: 'Not Found' });
    httpMock.expectOne((r) => r.url === `${environment.apiUrl}/wheels/w-1/draws`).flush([]);
    fixture.detectChanges();

    expect(fixture.componentInstance.loadError()).toBe(true);
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[role="alert"]')).toBeTruthy();
  });

  it('renders the empty-history message when there are no draws yet', () => {
    const fixture = createFixture([]);
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('wheels.detail.history.empty');
  });

  it('disables the spin button while a spin request is in flight, then re-enables it', () => {
    const fixture = createFixture();
    const el: HTMLElement = fixture.nativeElement;
    const button = el.querySelector('button') as HTMLButtonElement;

    button.dispatchEvent(new Event('click'));
    fixture.detectChanges();
    expect(fixture.componentInstance.spinning()).toBe(true);
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-disabled')).toBe('true');

    const spinReq = httpMock.expectOne(`${environment.apiUrl}/wheels/w-1/spin`);
    spinReq.flush(spinResponse);
    httpMock.expectOne(`${environment.apiUrl}/wheels/w-1`).flush(wheel);
    httpMock.expectOne((r) => r.url === `${environment.apiUrl}/wheels/w-1/draws`).flush([existingDraw]);
    fixture.detectChanges();

    expect(fixture.componentInstance.spinning()).toBe(false);
    expect(button.disabled).toBe(false);
  });

  it('displays the drawn entry label in the aria-live result region on success', () => {
    const fixture = createFixture();
    const el: HTMLElement = fixture.nativeElement;
    const button = el.querySelector('button') as HTMLButtonElement;

    button.click();
    httpMock.expectOne(`${environment.apiUrl}/wheels/w-1/spin`).flush(spinResponse);
    httpMock.expectOne(`${environment.apiUrl}/wheels/w-1`).flush(wheel);
    httpMock.expectOne((r) => r.url === `${environment.apiUrl}/wheels/w-1/draws`).flush([existingDraw]);
    fixture.detectChanges();

    expect(fixture.componentInstance.lastResultLabel()).toBe('Ada Lovelace');
    // TranslocoTestingModule's stub does not interpolate params, so the rendered text is the raw
    // key rather than the substituted label — the label itself is asserted on the component's
    // signal above; here we only assert the aria-live region actually rendered the announce key.
    const liveRegion = el.querySelector('.wheel-detail__result[aria-live="polite"]');
    expect(liveRegion?.textContent).toContain('wheels.detail.result.announce');
  });

  it('sends the selected antiRepeatMode on the next spin', () => {
    const fixture = createFixture();
    const el: HTMLElement = fixture.nativeElement;

    const select = el.querySelector('#wheel-anti-repeat-mode') as HTMLSelectElement;
    select.value = 'exclude';
    select.dispatchEvent(new Event('change'));
    expect(fixture.componentInstance.antiRepeatMode()).toBe('exclude');

    const button = el.querySelector('button') as HTMLButtonElement;
    button.click();
    const spinReq = httpMock.expectOne(`${environment.apiUrl}/wheels/w-1/spin`);
    expect(spinReq.request.body).toEqual({ antiRepeatMode: 'exclude' });
    spinReq.flush({ ...spinResponse, antiRepeatMode: 'exclude' });
    httpMock.expectOne(`${environment.apiUrl}/wheels/w-1`).flush(wheel);
    httpMock.expectOne((r) => r.url === `${environment.apiUrl}/wheels/w-1/draws`).flush([existingDraw]);
  });

  it('on a network/5xx error: shows an alert toast, re-enables the button, and clears any stale result', () => {
    const fixture = createFixture();
    const el: HTMLElement = fixture.nativeElement;
    const button = el.querySelector('button') as HTMLButtonElement;

    // First, a successful spin leaves a result on screen.
    button.click();
    httpMock.expectOne(`${environment.apiUrl}/wheels/w-1/spin`).flush(spinResponse);
    httpMock.expectOne(`${environment.apiUrl}/wheels/w-1`).flush(wheel);
    httpMock.expectOne((r) => r.url === `${environment.apiUrl}/wheels/w-1/draws`).flush([existingDraw]);
    fixture.detectChanges();
    expect(fixture.componentInstance.lastResultLabel()).toBe('Ada Lovelace');

    // Second spin fails — the stale result must not remain displayed as if it were the new one.
    button.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.lastResultLabel()).toBeNull();

    httpMock
      .expectOne(`${environment.apiUrl}/wheels/w-1/spin`)
      .flush(null, { status: 500, statusText: 'Internal Server Error' });
    fixture.detectChanges();

    expect(fixture.componentInstance.spinning()).toBe(false);
    expect(button.disabled).toBe(false);
    expect(fixture.componentInstance.lastResultLabel()).toBeNull();
    expect(el.querySelector('[role="alert"]')).toBeTruthy();
  });

  it('refreshes the draw history to include the new draw first after a successful spin', () => {
    const fixture = createFixture([existingDraw]);
    const el: HTMLElement = fixture.nativeElement;
    const button = el.querySelector('button') as HTMLButtonElement;
    const newDraw: WheelDrawResponse = { entryId: 'e-1', label: 'Ada Lovelace', drawnAt: '2026-07-10T00:00:00Z' };

    button.click();
    httpMock.expectOne(`${environment.apiUrl}/wheels/w-1/spin`).flush(spinResponse);
    httpMock.expectOne(`${environment.apiUrl}/wheels/w-1`).flush(wheel);
    httpMock.expectOne((r) => r.url === `${environment.apiUrl}/wheels/w-1/draws`).flush([newDraw, existingDraw]);
    fixture.detectChanges();

    expect(fixture.componentInstance.draws()).toEqual([newDraw, existingDraw]);
  });

  // ── US14.3.1 — real-time broadcast ──

  it('opens the WS subscription for this wheel on init (EN17.3 gap: no token available yet)', () => {
    createFixture();
    expect(wsConnectSpy).toHaveBeenCalledWith('w-1', null);
  });

  it('closes the WS subscription when the component is destroyed', () => {
    const fixture = createFixture();
    fixture.destroy();
    expect(wsDisconnectSpy).toHaveBeenCalledTimes(1);
  });

  it('displays a broadcast draw result live, in the same aria-live region as a local spin', () => {
    const fixture = createFixture();
    const el: HTMLElement = fixture.nativeElement;

    wsMessages$.next(JSON.stringify(spinResponse));
    fixture.detectChanges();

    expect(fixture.componentInstance.lastResultLabel()).toBe('Ada Lovelace');
    const liveRegion = el.querySelector('.wheel-detail__result[aria-live="polite"]');
    expect(liveRegion?.textContent).toContain('wheels.detail.result.announce');
  });

  it('prepends a broadcast draw result to the history', () => {
    const fixture = createFixture([existingDraw]);

    wsMessages$.next(JSON.stringify(spinResponse));
    fixture.detectChanges();

    expect(fixture.componentInstance.draws()).toEqual([
      { entryId: spinResponse.entryId, label: spinResponse.label, drawnAt: spinResponse.drawnAt },
      existingDraw,
    ]);
  });

  it('ignores a malformed broadcast message instead of throwing', () => {
    const fixture = createFixture([existingDraw]);

    expect(() => {
      wsMessages$.next('not-json');
      fixture.detectChanges();
    }).not.toThrow();
    expect(fixture.componentInstance.draws()).toEqual([existingDraw]);
  });

  it('dedupes a broadcast that matches a draw already in the history (own spin also received over WS)', () => {
    const fixture = createFixture([existingDraw]);
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;

    // The caller's own spin already refreshed the history via GET /draws with the real row...
    button.click();
    httpMock.expectOne(`${environment.apiUrl}/wheels/w-1/spin`).flush(spinResponse);
    httpMock.expectOne(`${environment.apiUrl}/wheels/w-1`).flush(wheel);
    httpMock
      .expectOne((r) => r.url === `${environment.apiUrl}/wheels/w-1/draws`)
      .flush([
        { entryId: spinResponse.entryId, label: spinResponse.label, drawnAt: spinResponse.drawnAt },
        existingDraw,
      ]);
    fixture.detectChanges();

    // ...then the broadcast of that same spin arrives over WS too — must not duplicate the row.
    wsMessages$.next(JSON.stringify(spinResponse));
    fixture.detectChanges();

    expect(fixture.componentInstance.draws()).toEqual([
      { entryId: spinResponse.entryId, label: spinResponse.label, drawnAt: spinResponse.drawnAt },
      existingDraw,
    ]);
  });

  it('a participant who never clicks spin still sees the announcement from a broadcast (a11y AC)', () => {
    const fixture = createFixture();
    expect(fixture.componentInstance.lastResultLabel()).toBeNull();

    wsMessages$.next(JSON.stringify(spinResponse));
    fixture.detectChanges();

    expect(fixture.componentInstance.lastResultLabel()).toBe(spinResponse.label);
  });
});

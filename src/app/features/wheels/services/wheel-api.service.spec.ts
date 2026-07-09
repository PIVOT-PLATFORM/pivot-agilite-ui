import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { CreateWheelRequest, UpdateWheelRequest, WheelResponse } from '../models/wheel.model';
import { WheelApiService } from './wheel-api.service';

describe('WheelApiService', () => {
  let service: WheelApiService;
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

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(WheelApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('listTeams() calls GET /teams', () => {
    service.listTeams().subscribe();
    const req = httpMock.expectOne(`${environment.apiUrl}/teams`);
    expect(req.request.method).toBe('GET');
    req.flush([{ id: 1, name: 'Team A' }]);
  });

  it('listTeamMembers() calls GET /teams/{teamId}/members', () => {
    service.listTeamMembers(1).subscribe();
    const req = httpMock.expectOne(`${environment.apiUrl}/teams/1/members`);
    expect(req.request.method).toBe('GET');
    req.flush([{ id: 1, userId: 10, displayName: 'Ada Lovelace' }]);
  });

  it('listWheels() calls GET /wheels with teamId query param', () => {
    service.listWheels(1).subscribe();
    const req = httpMock.expectOne((r) => r.url === `${environment.apiUrl}/wheels` && r.params.get('teamId') === '1');
    expect(req.request.method).toBe('GET');
    req.flush([wheel]);
  });

  it('getWheel() calls GET /wheels/{wheelId}', () => {
    service.getWheel('w-1').subscribe();
    const req = httpMock.expectOne(`${environment.apiUrl}/wheels/w-1`);
    expect(req.request.method).toBe('GET');
    req.flush(wheel);
  });

  it('createWheel() calls POST /wheels with the request body', () => {
    const body: CreateWheelRequest = { teamId: 1, name: 'Retro roulette', entries: [{ type: 'free_text', label: 'Bob' }] };
    service.createWheel(body).subscribe();
    const req = httpMock.expectOne(`${environment.apiUrl}/wheels`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    req.flush(wheel);
  });

  it('updateWheel() calls PUT /wheels/{wheelId} with the request body', () => {
    const body: UpdateWheelRequest = { name: 'Renamed', entries: [{ type: 'free_text', label: 'Bob' }] };
    service.updateWheel('w-1', body).subscribe();
    const req = httpMock.expectOne(`${environment.apiUrl}/wheels/w-1`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(body);
    req.flush(wheel);
  });

  it('deleteWheel() calls DELETE /wheels/{wheelId}', () => {
    service.deleteWheel('w-1').subscribe();
    const req = httpMock.expectOne(`${environment.apiUrl}/wheels/w-1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });
});

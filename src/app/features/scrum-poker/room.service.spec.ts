import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { RoomResponse } from './room.model';
import { RoomService } from './room.service';

describe('RoomService', () => {
  let service: RoomService;
  let httpMock: HttpTestingController;

  const mockRoom: RoomResponse = {
    id: 42,
    name: 'Sprint 8 estimation',
    inviteCode: 'K7M2XQ',
    sequence: 'FIBONACCI',
    cardValues: ['0', '1', '2', '3', '5', '8', '13', '21', '34', '55', '89', '?'],
    facilitatorUserId: 7,
    active: true,
    createdAt: '2026-07-10T10:00:00Z',
    expiresAt: '2026-07-11T10:00:00Z',
    wsTopic: '/topic/agilite/poker/42',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(RoomService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  /**
   * Given a room name, when createRoom() is called, then it POSTs to /poker/rooms with the
   * name in the body and resolves with the created room.
   */
  it('createRoom() posts to poker/rooms with the given name', () => {
    let result: RoomResponse | undefined;
    service.createRoom({ name: 'Sprint 8 estimation' }).subscribe(r => (result = r));

    const req = httpMock.expectOne(`${environment.apiUrl}/poker/rooms`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ name: 'Sprint 8 estimation' });
    req.flush(mockRoom);

    expect(result).toEqual(mockRoom);
  });

  /**
   * Given a room id, when getRoom() is called, then it GETs /poker/rooms/{id} and resolves
   * with the room.
   */
  it('getRoom() gets poker/rooms/{id}', () => {
    let result: RoomResponse | undefined;
    service.getRoom(42).subscribe(r => (result = r));

    const req = httpMock.expectOne(`${environment.apiUrl}/poker/rooms/42`);
    expect(req.request.method).toBe('GET');
    req.flush(mockRoom);

    expect(result).toEqual(mockRoom);
  });

  /**
   * Error case: given the backend rejects the request with 404, when getRoom() is called,
   * then the observable errors instead of silently resolving.
   */
  it('getRoom() propagates a 404 error', () => {
    let errorStatus: number | undefined;
    service.getRoom(999).subscribe({
      error: err => (errorStatus = err.status),
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/poker/rooms/999`);
    req.flush('Not Found', { status: 404, statusText: 'Not Found' });

    expect(errorStatus).toBe(404);
  });
});

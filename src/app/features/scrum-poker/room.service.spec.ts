import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { JoinRoomResponse, RoomResponse } from './room.model';
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

  const mockJoinedRoom: JoinRoomResponse = {
    roomId: '9f4e6b1a-6c3d-4b8e-8f2a-1234567890ab',
    name: 'Sprint 8 estimation',
    sequence: 'FIBONACCI',
    cardValues: ['0', '1', '2', '3', '5', '8', '13', '21', '34', '55', '89', '?'],
    active: true,
    expiresAt: '2026-07-11T10:00:00Z',
    wsTopic: '/topic/agilite/poker/9f4e6b1a-6c3d-4b8e-8f2a-1234567890ab',
    accessToken: 'opaque-access-token',
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

  // ── joinRoom() (US09.1.2) ──

  /**
   * Given an invite code, when joinRoom() is called, then it POSTs to /poker/rooms/join with
   * the code in the body and resolves with the joined room (including wsTopic/accessToken).
   */
  it('joinRoom() posts to poker/rooms/join with the given code', () => {
    let result: JoinRoomResponse | undefined;
    service.joinRoom({ code: 'K7M2XQ' }).subscribe(r => (result = r));

    const req = httpMock.expectOne(`${environment.apiUrl}/poker/rooms/join`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ code: 'K7M2XQ' });
    req.flush(mockJoinedRoom);

    expect(result).toEqual(mockJoinedRoom);
  });

  /**
   * Error case: given the backend rejects with 400 (INVALID_CODE), when joinRoom() is called,
   * then the observable errors with that status and the ProblemDetail body preserved.
   */
  it('joinRoom() propagates a 400 INVALID_CODE error', () => {
    let error: { status?: number; error?: unknown } | undefined;
    service.joinRoom({ code: 'BAD' }).subscribe({
      error: err => (error = err),
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/poker/rooms/join`);
    req.flush({ code: 'INVALID_CODE' }, { status: 400, statusText: 'Bad Request' });

    expect(error?.status).toBe(400);
    expect((error?.error as { code?: string })?.code).toBe('INVALID_CODE');
  });

  /**
   * Error case: given the backend rejects with 404 (unknown/expired/cross-tenant code —
   * indistinguishable server-side), when joinRoom() is called, then the observable errors
   * with a 404 status.
   */
  it('joinRoom() propagates a 404 error', () => {
    let errorStatus: number | undefined;
    service.joinRoom({ code: 'ABCDEF' }).subscribe({
      error: err => (errorStatus = err.status),
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/poker/rooms/join`);
    req.flush('Not Found', { status: 404, statusText: 'Not Found' });

    expect(errorStatus).toBe(404);
  });

  /**
   * Error case: given the backend rejects with 401 (missing/invalid bearer token), when
   * joinRoom() is called, then the observable errors with a 401 status.
   */
  it('joinRoom() propagates a 401 error', () => {
    let errorStatus: number | undefined;
    service.joinRoom({ code: 'ABCDEF' }).subscribe({
      error: err => (errorStatus = err.status),
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/poker/rooms/join`);
    req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

    expect(errorStatus).toBe(401);
  });
});

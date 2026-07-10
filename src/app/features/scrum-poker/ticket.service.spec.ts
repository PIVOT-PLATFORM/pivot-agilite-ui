import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { RevealResponse, TicketResponse } from './ticket.model';
import { TicketService } from './ticket.service';

describe('TicketService', () => {
  let service: TicketService;
  let httpMock: HttpTestingController;

  const ROOM_ID = '9f4e6b1a-6c3d-4b8e-8f2a-1234567890ab';

  const mockTicket: TicketResponse = {
    id: 'ticket-1',
    roomId: ROOM_ID,
    title: 'Estimate JIRA-123',
    status: 'VOTING',
    createdAt: '2026-07-10T10:00:00Z',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TicketService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  /**
   * Given a room id and title, when createTicket() is called, then it POSTs to
   * poker/rooms/{roomId}/tickets with the title in the body and resolves with the created ticket.
   */
  it('createTicket() posts to poker/rooms/{roomId}/tickets with the given title', () => {
    let result: TicketResponse | undefined;
    service.createTicket(ROOM_ID, { title: 'Estimate JIRA-123' }).subscribe(r => (result = r));

    const req = httpMock.expectOne(`${environment.apiUrl}/poker/rooms/${ROOM_ID}/tickets`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ title: 'Estimate JIRA-123' });
    req.flush(mockTicket);

    expect(result).toEqual(mockTicket);
  });

  /**
   * Error case: given the backend rejects with 403 (not the facilitator), when createTicket()
   * is called, then the observable errors with a 403 status and the FACILITATOR_ONLY code.
   */
  it('createTicket() propagates a 403 FACILITATOR_ONLY error', () => {
    let error: { status?: number; error?: unknown } | undefined;
    service.createTicket(ROOM_ID, { title: 'Title' }).subscribe({ error: err => (error = err) });

    const req = httpMock.expectOne(`${environment.apiUrl}/poker/rooms/${ROOM_ID}/tickets`);
    req.flush({ code: 'FACILITATOR_ONLY' }, { status: 403, statusText: 'Forbidden' });

    expect(error?.status).toBe(403);
    expect((error?.error as { code?: string })?.code).toBe('FACILITATOR_ONLY');
  });

  /**
   * Error case: given the backend rejects with 409 (a ticket is already active), when
   * createTicket() is called, then the observable errors with a 409 status and the
   * ACTIVE_TICKET_EXISTS code.
   */
  it('createTicket() propagates a 409 ACTIVE_TICKET_EXISTS error', () => {
    let error: { status?: number; error?: unknown } | undefined;
    service.createTicket(ROOM_ID, { title: 'Title' }).subscribe({ error: err => (error = err) });

    const req = httpMock.expectOne(`${environment.apiUrl}/poker/rooms/${ROOM_ID}/tickets`);
    req.flush({ code: 'ACTIVE_TICKET_EXISTS' }, { status: 409, statusText: 'Conflict' });

    expect(error?.status).toBe(409);
    expect((error?.error as { code?: string })?.code).toBe('ACTIVE_TICKET_EXISTS');
  });

  /**
   * Given a room id, when getCurrentTicket() is called, then it GETs
   * poker/rooms/{roomId}/tickets/current and resolves with the ticket.
   */
  it('getCurrentTicket() gets poker/rooms/{roomId}/tickets/current', () => {
    let result: TicketResponse | null | undefined;
    service.getCurrentTicket(ROOM_ID).subscribe(r => (result = r));

    const req = httpMock.expectOne(`${environment.apiUrl}/poker/rooms/${ROOM_ID}/tickets/current`);
    expect(req.request.method).toBe('GET');
    req.flush(mockTicket);

    expect(result).toEqual(mockTicket);
  });

  /**
   * Given no active ticket, when getCurrentTicket() is called, then it resolves with `null`
   * (a legitimate room state, not an error).
   */
  it('getCurrentTicket() resolves with null when no ticket is currently active', () => {
    let result: TicketResponse | null | undefined;
    service.getCurrentTicket(ROOM_ID).subscribe(r => (result = r));

    const req = httpMock.expectOne(`${environment.apiUrl}/poker/rooms/${ROOM_ID}/tickets/current`);
    req.flush(null);

    expect(result).toBeNull();
  });

  /**
   * Given a room id and ticket id, when revealTicket() is called, then it POSTs to
   * poker/rooms/{roomId}/tickets/{ticketId}/reveal with no body and resolves with the reveal
   * response (revealed ticket, raw values, consensus).
   */
  it('revealTicket() posts to poker/rooms/{roomId}/tickets/{ticketId}/reveal', () => {
    const mockReveal: RevealResponse = {
      id: 'ticket-1',
      roomId: ROOM_ID,
      title: 'Estimate JIRA-123',
      status: 'REVEALED',
      createdAt: '2026-07-10T10:00:00Z',
      revealedAt: '2026-07-10T10:05:00Z',
      values: ['5', '8', '5'],
      consensus: { mean: 6, median: 5, majority: '5' },
    };
    let result: RevealResponse | undefined;
    service.revealTicket(ROOM_ID, 'ticket-1').subscribe(r => (result = r));

    const req = httpMock.expectOne(`${environment.apiUrl}/poker/rooms/${ROOM_ID}/tickets/ticket-1/reveal`);
    expect(req.request.method).toBe('POST');
    req.flush(mockReveal);

    expect(result).toEqual(mockReveal);
  });

  /**
   * Error case: given the backend rejects with 409 (ticket already revealed), when
   * revealTicket() is called, then the observable errors with a 409 status and the
   * TICKET_ALREADY_REVEALED code.
   */
  it('revealTicket() propagates a 409 TICKET_ALREADY_REVEALED error', () => {
    let error: { status?: number; error?: unknown } | undefined;
    service.revealTicket(ROOM_ID, 'ticket-1').subscribe({ error: err => (error = err) });

    const req = httpMock.expectOne(`${environment.apiUrl}/poker/rooms/${ROOM_ID}/tickets/ticket-1/reveal`);
    req.flush({ code: 'TICKET_ALREADY_REVEALED' }, { status: 409, statusText: 'Conflict' });

    expect(error?.status).toBe(409);
    expect((error?.error as { code?: string })?.code).toBe('TICKET_ALREADY_REVEALED');
  });
});

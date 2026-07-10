import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CreateTicketRequest, TicketResponse } from './ticket.model';

/**
 * HTTP client for the planning poker ticket API (US09.2.1).
 *
 * Mirrors {@link RoomService}'s auth story: no bearer-token logic lives here — `@pivot/ui-core`'s
 * `AuthInterceptor` attaches it transparently once this module is lazy-loaded under the
 * `pivot-ui` shell (EN17.3, not yet consumable).
 */
@Injectable({ providedIn: 'root' })
export class TicketService {
  private readonly http = inject(HttpClient);

  /**
   * Builds the tickets base URL for a given room.
   *
   * @param roomId the room's id
   * @returns the base URL for that room's ticket endpoints
   */
  private ticketsUrl(roomId: string): string {
    return `${environment.apiUrl}/poker/rooms/${roomId}/tickets`;
  }

  /**
   * Creates a new ticket in a room — restricted server-side to that room's facilitator.
   *
   * @param roomId  the target room
   * @param request the ticket creation request (title)
   * @returns an observable of the created ticket
   */
  createTicket(roomId: string, request: CreateTicketRequest): Observable<TicketResponse> {
    return this.http.post<TicketResponse>(this.ticketsUrl(roomId), request);
  }

  /**
   * Fetches the room's currently open (`VOTING`) ticket, if any — used to render the active
   * ticket for a participant who joins (or reconnects) after the `TICKET_CREATED` broadcast has
   * already gone out.
   *
   * @param roomId the target room
   * @returns an observable of the current ticket, or `null` if none is currently open
   */
  getCurrentTicket(roomId: string): Observable<TicketResponse | null> {
    return this.http.get<TicketResponse | null>(`${this.ticketsUrl(roomId)}/current`);
  }
}

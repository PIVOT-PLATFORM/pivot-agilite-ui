import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CreateRoomRequest, RoomResponse } from './room.model';

/**
 * HTTP client for the planning poker room API (US09.1.1).
 *
 * No authentication logic lives here: the `Authorization: Bearer` header is attached
 * transparently to every `HttpClient` request by `@pivot/ui-core`'s `AuthInterceptor` once this
 * module is lazy-loaded under the `pivot-ui` shell (EN17.3, not yet consumable — see
 * `CLAUDE.md`). This service requires zero changes when that lands.
 */
@Injectable({ providedIn: 'root' })
export class RoomService {
  private readonly http = inject(HttpClient);

  private readonly baseUrl = `${environment.apiUrl}/poker/rooms`;

  /**
   * Creates a new planning poker room. The caller becomes its facilitator automatically
   * (resolved server-side from the bearer token — never sent by this client).
   *
   * @param request the room creation request (room name)
   * @returns an observable of the created room
   */
  createRoom(request: CreateRoomRequest): Observable<RoomResponse> {
    return this.http.post<RoomResponse>(this.baseUrl, request);
  }

  /**
   * Fetches a single room by id, scoped server-side to the caller's tenant.
   *
   * @param roomId the room id
   * @returns an observable of the room
   */
  getRoom(roomId: number): Observable<RoomResponse> {
    return this.http.get<RoomResponse>(`${this.baseUrl}/${roomId}`);
  }
}

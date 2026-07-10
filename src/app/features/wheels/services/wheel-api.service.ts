import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  AntiRepeatMode,
  CreateWheelRequest,
  TeamMemberResponse,
  TeamResponse,
  UpdateWheelRequest,
  WheelDrawResponse,
  WheelResponse,
  WheelSpinResponse,
} from '../models/wheel.model';

/**
 * HTTP client for the wheel feature's backend (`pivot-agilite-core`, `${environment.apiUrl}`).
 *
 * No `Authorization` header is attached here: bearer token attachment is delegated to
 * `@pivot/ui-core`'s `AuthInterceptor` once that package is consumable (EN17.3) — see this
 * repo's CLAUDE.md, section "Auth (déléguée)". `tenantId`/`userId` are never sent by this
 * service; the backend resolves them exclusively from the bearer token.
 */
@Injectable({ providedIn: 'root' })
export class WheelApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;

  /**
   * Lists the caller's own teams.
   *
   * @returns the teams the caller belongs to
   */
  listTeams(): Observable<TeamResponse[]> {
    return this.http.get<TeamResponse[]>(`${this.baseUrl}/teams`);
  }

  /**
   * Lists the members of a team the caller belongs to.
   *
   * @param teamId the team's identifier
   * @returns the team's members
   */
  listTeamMembers(teamId: number): Observable<TeamMemberResponse[]> {
    return this.http.get<TeamMemberResponse[]>(`${this.baseUrl}/teams/${teamId}/members`);
  }

  /**
   * Lists the wheels belonging to a team the caller belongs to.
   *
   * @param teamId the team's identifier
   * @returns the team's wheels (no pagination — small expected volume per team)
   */
  listWheels(teamId: number): Observable<WheelResponse[]> {
    const params = new HttpParams().set('teamId', teamId);
    return this.http.get<WheelResponse[]>(`${this.baseUrl}/wheels`, { params });
  }

  /**
   * Fetches a single wheel by id.
   *
   * @param wheelId the wheel's identifier
   * @returns the wheel, with its entries
   */
  getWheel(wheelId: string): Observable<WheelResponse> {
    return this.http.get<WheelResponse>(`${this.baseUrl}/wheels/${wheelId}`);
  }

  /**
   * Creates a new wheel.
   *
   * @param request the wheel to create — `entries` must contain at least one entry
   * @returns the created wheel
   */
  createWheel(request: CreateWheelRequest): Observable<WheelResponse> {
    return this.http.post<WheelResponse>(`${this.baseUrl}/wheels`, request);
  }

  /**
   * Replaces a wheel's name and entries. `teamId` is immutable and not part of this request.
   *
   * @param wheelId the wheel's identifier
   * @param request the new name and full entries list
   * @returns the updated wheel
   */
  updateWheel(wheelId: string, request: UpdateWheelRequest): Observable<WheelResponse> {
    return this.http.put<WheelResponse>(`${this.baseUrl}/wheels/${wheelId}`, request);
  }

  /**
   * Permanently deletes a wheel and all its entries.
   *
   * @param wheelId the wheel's identifier
   */
  deleteWheel(wheelId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/wheels/${wheelId}`);
  }

  /**
   * Performs a weighted, anti-repeat draw on a wheel (US14.2.1).
   *
   * @param wheelId        the wheel's identifier
   * @param antiRepeatMode the anti-repeat mode for this draw; omitted defaults to
   *                       `'reduced_weight'` server-side
   * @returns the draw result
   */
  spinWheel(wheelId: string, antiRepeatMode?: AntiRepeatMode): Observable<WheelSpinResponse> {
    return this.http.post<WheelSpinResponse>(
      `${this.baseUrl}/wheels/${wheelId}/spin`,
      antiRepeatMode ? { antiRepeatMode } : {},
    );
  }

  /**
   * Lists the most recent draws of a wheel, most recent first (US14.2.1).
   *
   * @param wheelId the wheel's identifier
   * @param limit   the maximum number of draws to return (1-100, server default 20)
   * @returns the most recent draws, most recent first
   */
  listDraws(wheelId: string, limit?: number): Observable<WheelDrawResponse[]> {
    let params = new HttpParams();
    if (limit !== undefined) {
      params = params.set('limit', limit);
    }
    return this.http.get<WheelDrawResponse[]>(`${this.baseUrl}/wheels/${wheelId}/draws`, { params });
  }
}

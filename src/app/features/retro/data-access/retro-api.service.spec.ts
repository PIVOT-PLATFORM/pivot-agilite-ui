import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { RetroApiService } from './retro-api.service';
import {
  CreateRetroFormatRequest,
  CreateRetroSessionRequest,
  RetroFormatDefinition,
  RetroFormatsResponse,
  RetroSessionJoinResponse,
  RetroSessionResponse,
} from './retro.models';

describe('RetroApiService', () => {
  let service: RetroApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(RetroApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('create', () => {
    const request: CreateRetroSessionRequest = {
      title: 'Rétro Sprint 8',
      format: 'START_STOP_CONTINUE',
      teamId: 42,
    };

    const response: RetroSessionResponse = {
      id: '11111111-1111-1111-1111-111111111111',
      title: 'Rétro Sprint 8',
      format: 'START_STOP_CONTINUE',
      teamId: 42,
      facilitatorUserId: 7,
      joinCode: 'A3F9K2',
      currentPhase: 'CONTRIBUTION',
      contributionTimerSeconds: null,
      voteTimerSeconds: null,
      actionTimerSeconds: null,
      voteCountPerParticipant: 3,
      sprintRef: null,
      expiresAt: '2026-07-11T00:00:00Z',
      createdAt: '2026-07-10T00:00:00Z',
    };

    it('POSTs to /retro/sessions with the exact request body and returns the created session', () => {
      let result: RetroSessionResponse | undefined;

      service.create(request).subscribe(r => (result = r));

      const req = httpMock.expectOne(`${environment.apiUrl}/retro/sessions`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(request);
      req.flush(response, { status: 201, statusText: 'Created' });

      expect(result).toEqual(response);
    });

    it('propagates a 400 error with a ProblemDetail code (e.g. invalid title)', () => {
      let error: unknown;

      service.create(request).subscribe({ error: e => (error = e) });

      const req = httpMock.expectOne(`${environment.apiUrl}/retro/sessions`);
      req.flush(
        { type: 'about:blank', title: 'Bad Request', status: 400, code: 'INVALID_TITLE' },
        { status: 400, statusText: 'Bad Request' },
      );

      expect(error).toBeDefined();
      expect((error as { status: number }).status).toBe(400);
      expect((error as { error: { code: string } }).error.code).toBe('INVALID_TITLE');
    });

    it('propagates a 401 error (expected in this bootstrap phase — no bearer token attached)', () => {
      let error: unknown;

      service.create(request).subscribe({ error: e => (error = e) });

      const req = httpMock.expectOne(`${environment.apiUrl}/retro/sessions`);
      req.flush({ title: 'Unauthorized', status: 401 }, { status: 401, statusText: 'Unauthorized' });

      expect((error as { status: number }).status).toBe(401);
    });

    it('propagates a 403 error (caller not a team member)', () => {
      let error: unknown;

      service.create(request).subscribe({ error: e => (error = e) });

      const req = httpMock.expectOne(`${environment.apiUrl}/retro/sessions`);
      req.flush({ title: 'Forbidden', status: 403 }, { status: 403, statusText: 'Forbidden' });

      expect((error as { status: number }).status).toBe(403);
    });

    it('propagates a 404 error (team not found or belongs to another tenant)', () => {
      let error: unknown;

      service.create(request).subscribe({ error: e => (error = e) });

      const req = httpMock.expectOne(`${environment.apiUrl}/retro/sessions`);
      req.flush({ title: 'Not Found', status: 404 }, { status: 404, statusText: 'Not Found' });

      expect((error as { status: number }).status).toBe(404);
    });
  });

  describe('resolveByJoinCode', () => {
    const joinResponse: RetroSessionJoinResponse = {
      id: '11111111-1111-1111-1111-111111111111',
      title: 'Rétro Sprint 8',
      format: 'START_STOP_CONTINUE',
      currentPhase: 'CONTRIBUTION',
      expiresAt: '2026-07-11T00:00:00Z',
    };

    it('GETs /retro/sessions/join/{joinCode} and returns public session metadata', () => {
      let result: RetroSessionJoinResponse | undefined;

      service.resolveByJoinCode('A3F9K2').subscribe(r => (result = r));

      const req = httpMock.expectOne(`${environment.apiUrl}/retro/sessions/join/A3F9K2`);
      expect(req.request.method).toBe('GET');
      req.flush(joinResponse);

      expect(result).toEqual(joinResponse);
    });

    it('propagates a 404 error (unknown join code)', () => {
      let error: unknown;

      service.resolveByJoinCode('ZZZZZZ').subscribe({ error: e => (error = e) });

      const req = httpMock.expectOne(`${environment.apiUrl}/retro/sessions/join/ZZZZZZ`);
      req.flush({ title: 'Not Found', status: 404 }, { status: 404, statusText: 'Not Found' });

      expect((error as { status: number }).status).toBe(404);
    });

    it('propagates a 410 error (session expired or closed)', () => {
      let error: unknown;

      service.resolveByJoinCode('A3F9K2').subscribe({ error: e => (error = e) });

      const req = httpMock.expectOne(`${environment.apiUrl}/retro/sessions/join/A3F9K2`);
      req.flush({ title: 'Gone', status: 410 }, { status: 410, statusText: 'Gone' });

      expect((error as { status: number }).status).toBe(410);
    });
  });

  describe('listFormats', () => {
    const formatsResponse: RetroFormatsResponse = {
      formats: [
        {
          key: 'START_STOP_CONTINUE',
          label: 'Start / Stop / Continue',
          system: true,
          columns: [
            { key: 'START', label: 'Commencer', color: '#2E7D32', description: 'desc', icon: 'play_arrow' },
            { key: 'STOP', label: 'Arrêter', color: '#C62828', description: 'desc', icon: 'stop' },
            { key: 'CONTINUE', label: 'Continuer', color: '#1565C0', description: 'desc', icon: 'autorenew' },
          ],
        },
        {
          key: '11111111-1111-1111-1111-111111111111',
          label: 'Notre format',
          system: false,
          columns: [{ key: 'COL_1', label: 'Colonne 1', color: null, description: null, icon: null }],
        },
      ],
    };

    it('GETs /retro/formats and returns the system + tenant custom format catalogue', () => {
      let result: RetroFormatsResponse | undefined;

      service.listFormats().subscribe(r => (result = r));

      const req = httpMock.expectOne(`${environment.apiUrl}/retro/formats`);
      expect(req.request.method).toBe('GET');
      req.flush(formatsResponse);

      expect(result).toEqual(formatsResponse);
    });

    it('propagates a 401 error (expected in this bootstrap phase — no bearer token attached)', () => {
      let error: unknown;

      service.listFormats().subscribe({ error: e => (error = e) });

      const req = httpMock.expectOne(`${environment.apiUrl}/retro/formats`);
      req.flush({ title: 'Unauthorized', status: 401 }, { status: 401, statusText: 'Unauthorized' });

      expect((error as { status: number }).status).toBe(401);
    });
  });

  describe('createFormat', () => {
    const request: CreateRetroFormatRequest = {
      label: 'Notre format',
      columns: [{ label: 'Colonne 1' }, { label: 'Colonne 2' }],
    };

    const response: RetroFormatDefinition = {
      key: '11111111-1111-1111-1111-111111111111',
      label: 'Notre format',
      system: false,
      columns: [
        { key: 'COLONNE_1', label: 'Colonne 1', color: null, description: null, icon: null },
        { key: 'COLONNE_2', label: 'Colonne 2', color: null, description: null, icon: null },
      ],
    };

    it('POSTs to /retro/formats with the exact request body and returns the created format', () => {
      let result: RetroFormatDefinition | undefined;

      service.createFormat(request).subscribe(r => (result = r));

      const req = httpMock.expectOne(`${environment.apiUrl}/retro/formats`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(request);
      req.flush(response, { status: 201, statusText: 'Created' });

      expect(result).toEqual(response);
    });

    it('propagates a 400 error with a ProblemDetail code (e.g. invalid column count)', () => {
      let error: unknown;

      service.createFormat(request).subscribe({ error: e => (error = e) });

      const req = httpMock.expectOne(`${environment.apiUrl}/retro/formats`);
      req.flush(
        {
          type: 'about:blank',
          title: 'Bad Request',
          status: 400,
          code: 'CUSTOM_FORMAT_INVALID_COLUMN_COUNT',
        },
        { status: 400, statusText: 'Bad Request' },
      );

      expect(error).toBeDefined();
      expect((error as { status: number }).status).toBe(400);
      expect((error as { error: { code: string } }).error.code).toBe('CUSTOM_FORMAT_INVALID_COLUMN_COUNT');
    });

    it('propagates a 401 error (expected in this bootstrap phase — no bearer token attached)', () => {
      let error: unknown;

      service.createFormat(request).subscribe({ error: e => (error = e) });

      const req = httpMock.expectOne(`${environment.apiUrl}/retro/formats`);
      req.flush({ title: 'Unauthorized', status: 401 }, { status: 401, statusText: 'Unauthorized' });

      expect((error as { status: number }).status).toBe(401);
    });
  });
});

import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { RetroApiService } from './retro-api.service';
import {
  CloseContributionResponse,
  CloseSessionResponse,
  CloseVoteResponse,
  CreateRetroActionRequest,
  CreateRetroFormatRequest,
  CreateRetroSessionRequest,
  OpenVoteResponse,
  RetroActionResponse,
  RetroFormatDefinition,
  RetroFormatsResponse,
  RetroParticipantAccessResponse,
  RetroSessionJoinResponse,
  RetroSessionResponse,
  RetroTeamMemberResponse,
  RevealResponse,
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

  describe('getById', () => {
    const sessionId = '11111111-1111-1111-1111-111111111111';
    const response: RetroSessionResponse = {
      id: sessionId,
      title: 'Rétro Sprint 8',
      format: 'START_STOP_CONTINUE',
      teamId: 42,
      facilitatorUserId: 7,
      joinCode: 'A3F9K2',
      currentPhase: 'CONTRIBUTION',
      contributionTimerSeconds: 600,
      voteTimerSeconds: null,
      actionTimerSeconds: null,
      voteCountPerParticipant: 3,
      sprintRef: null,
      expiresAt: '2026-07-11T00:00:00Z',
      createdAt: '2026-07-10T00:00:00Z',
    };

    it('GETs /retro/sessions/{id} and returns the full session detail', () => {
      let result: RetroSessionResponse | undefined;

      service.getById(sessionId).subscribe(r => (result = r));

      const req = httpMock.expectOne(`${environment.apiUrl}/retro/sessions/${sessionId}`);
      expect(req.request.method).toBe('GET');
      req.flush(response);

      expect(result).toEqual(response);
    });

    it('propagates a 401 error (expected in this bootstrap phase — no bearer token attached)', () => {
      let error: unknown;

      service.getById(sessionId).subscribe({ error: e => (error = e) });

      const req = httpMock.expectOne(`${environment.apiUrl}/retro/sessions/${sessionId}`);
      req.flush({ title: 'Unauthorized', status: 401 }, { status: 401, statusText: 'Unauthorized' });

      expect((error as { status: number }).status).toBe(401);
    });
  });

  describe('joinRealtimeSession', () => {
    const sessionId = '11111111-1111-1111-1111-111111111111';
    const response: RetroParticipantAccessResponse = {
      accessToken: 'opaque-token',
      ttlSeconds: 3600,
      facilitator: false,
      topicDestination: `/topic/agilite/retro/${sessionId}`,
      facilitatorTopicDestination: null,
      submitDestination: `/app/agilite/retro/${sessionId}/cards`,
      voteDestination: `/app/agilite/retro/${sessionId}/votes`,
      voteUncastDestination: `/app/agilite/retro/${sessionId}/votes/uncast`,
      voteBalanceDestination: `/app/agilite/retro/${sessionId}/votes/balance`,
    };

    it('POSTs to /retro/sessions/{id}/participants with an empty body and returns the access grant', () => {
      let result: RetroParticipantAccessResponse | undefined;

      service.joinRealtimeSession(sessionId).subscribe(r => (result = r));

      const req = httpMock.expectOne(`${environment.apiUrl}/retro/sessions/${sessionId}/participants`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      req.flush(response, { status: 201, statusText: 'Created' });

      expect(result).toEqual(response);
    });

    it('propagates a 410 error (session expired or already closed)', () => {
      let error: unknown;

      service.joinRealtimeSession(sessionId).subscribe({ error: e => (error = e) });

      const req = httpMock.expectOne(`${environment.apiUrl}/retro/sessions/${sessionId}/participants`);
      req.flush({ title: 'Gone', status: 410 }, { status: 410, statusText: 'Gone' });

      expect((error as { status: number }).status).toBe(410);
    });

    it('propagates a 404 error (unknown session)', () => {
      let error: unknown;

      service.joinRealtimeSession(sessionId).subscribe({ error: e => (error = e) });

      const req = httpMock.expectOne(`${environment.apiUrl}/retro/sessions/${sessionId}/participants`);
      req.flush({ title: 'Not Found', status: 404 }, { status: 404, statusText: 'Not Found' });

      expect((error as { status: number }).status).toBe(404);
    });
  });

  describe('closeContribution', () => {
    const sessionId = '11111111-1111-1111-1111-111111111111';

    it('POSTs to /retro/sessions/{id}/contribution/close and returns the new phase', () => {
      let result: CloseContributionResponse | undefined;

      service.closeContribution(sessionId).subscribe(r => (result = r));

      const req = httpMock.expectOne(`${environment.apiUrl}/retro/sessions/${sessionId}/contribution/close`);
      expect(req.request.method).toBe('POST');
      req.flush({ currentPhase: 'REVUE' });

      expect(result).toEqual({ currentPhase: 'REVUE' });
    });

    it('propagates a 403 error (caller is not the facilitator)', () => {
      let error: unknown;

      service.closeContribution(sessionId).subscribe({ error: e => (error = e) });

      const req = httpMock.expectOne(`${environment.apiUrl}/retro/sessions/${sessionId}/contribution/close`);
      req.flush({ title: 'Forbidden', status: 403 }, { status: 403, statusText: 'Forbidden' });

      expect((error as { status: number }).status).toBe(403);
    });

    it('propagates a 409 error (session not currently in CONTRIBUTION)', () => {
      let error: unknown;

      service.closeContribution(sessionId).subscribe({ error: e => (error = e) });

      const req = httpMock.expectOne(`${environment.apiUrl}/retro/sessions/${sessionId}/contribution/close`);
      req.flush({ title: 'Conflict', status: 409 }, { status: 409, statusText: 'Conflict' });

      expect((error as { status: number }).status).toBe(409);
    });
  });

  describe('reveal', () => {
    const sessionId = '11111111-1111-1111-1111-111111111111';
    const response: RevealResponse = {
      sessionId,
      cardCount: 2,
      columns: { 'went-well': [{ id: 'card-1', content: 'Great teamwork' }] },
    };

    it('POSTs to /retro/sessions/{id}/reveal and returns the revealed cards grouped by column', () => {
      let result: RevealResponse | undefined;

      service.reveal(sessionId).subscribe(r => (result = r));

      const req = httpMock.expectOne(`${environment.apiUrl}/retro/sessions/${sessionId}/reveal`);
      expect(req.request.method).toBe('POST');
      req.flush(response);

      expect(result).toEqual(response);
    });

    it('propagates a 409 error (session has not yet reached REVUE)', () => {
      let error: unknown;

      service.reveal(sessionId).subscribe({ error: e => (error = e) });

      const req = httpMock.expectOne(`${environment.apiUrl}/retro/sessions/${sessionId}/reveal`);
      req.flush({ title: 'Conflict', status: 409 }, { status: 409, statusText: 'Conflict' });

      expect((error as { status: number }).status).toBe(409);
    });
  });

  describe('openVote', () => {
    const sessionId = '11111111-1111-1111-1111-111111111111';

    it('POSTs to /retro/sessions/{id}/vote/open and returns the new phase', () => {
      let result: OpenVoteResponse | undefined;

      service.openVote(sessionId).subscribe(r => (result = r));

      const req = httpMock.expectOne(`${environment.apiUrl}/retro/sessions/${sessionId}/vote/open`);
      expect(req.request.method).toBe('POST');
      req.flush({ currentPhase: 'VOTE' });

      expect(result).toEqual({ currentPhase: 'VOTE' });
    });

    it('propagates a 403 error (caller is not the facilitator)', () => {
      let error: unknown;

      service.openVote(sessionId).subscribe({ error: e => (error = e) });

      const req = httpMock.expectOne(`${environment.apiUrl}/retro/sessions/${sessionId}/vote/open`);
      req.flush({ title: 'Forbidden', status: 403 }, { status: 403, statusText: 'Forbidden' });

      expect((error as { status: number }).status).toBe(403);
    });

    it('propagates a 409 error (session has not yet reached REVUE)', () => {
      let error: unknown;

      service.openVote(sessionId).subscribe({ error: e => (error = e) });

      const req = httpMock.expectOne(`${environment.apiUrl}/retro/sessions/${sessionId}/vote/open`);
      req.flush({ title: 'Conflict', status: 409 }, { status: 409, statusText: 'Conflict' });

      expect((error as { status: number }).status).toBe(409);
    });
  });

  describe('closeVote', () => {
    const sessionId = '11111111-1111-1111-1111-111111111111';

    it('POSTs to /retro/sessions/{id}/vote/close and returns the new phase', () => {
      let result: CloseVoteResponse | undefined;

      service.closeVote(sessionId).subscribe(r => (result = r));

      const req = httpMock.expectOne(`${environment.apiUrl}/retro/sessions/${sessionId}/vote/close`);
      expect(req.request.method).toBe('POST');
      req.flush({ currentPhase: 'ACTION' });

      expect(result).toEqual({ currentPhase: 'ACTION' });
    });

    it('propagates a 403 error (caller is not the facilitator)', () => {
      let error: unknown;

      service.closeVote(sessionId).subscribe({ error: e => (error = e) });

      const req = httpMock.expectOne(`${environment.apiUrl}/retro/sessions/${sessionId}/vote/close`);
      req.flush({ title: 'Forbidden', status: 403 }, { status: 403, statusText: 'Forbidden' });

      expect((error as { status: number }).status).toBe(403);
    });

    it('propagates a 409 error (session not currently in VOTE)', () => {
      let error: unknown;

      service.closeVote(sessionId).subscribe({ error: e => (error = e) });

      const req = httpMock.expectOne(`${environment.apiUrl}/retro/sessions/${sessionId}/vote/close`);
      req.flush({ title: 'Conflict', status: 409 }, { status: 409, statusText: 'Conflict' });

      expect((error as { status: number }).status).toBe(409);
    });
  });

  describe('closeSession', () => {
    const sessionId = '11111111-1111-1111-1111-111111111111';

    it('POSTs to /retro/sessions/{id}/close and returns the new phase', () => {
      let result: CloseSessionResponse | undefined;

      service.closeSession(sessionId).subscribe(r => (result = r));

      const req = httpMock.expectOne(`${environment.apiUrl}/retro/sessions/${sessionId}/close`);
      expect(req.request.method).toBe('POST');
      req.flush({ currentPhase: 'CLOSED' });

      expect(result).toEqual({ currentPhase: 'CLOSED' });
    });

    it('propagates a 403 error (caller is not the facilitator)', () => {
      let error: unknown;

      service.closeSession(sessionId).subscribe({ error: e => (error = e) });

      const req = httpMock.expectOne(`${environment.apiUrl}/retro/sessions/${sessionId}/close`);
      req.flush({ title: 'Forbidden', status: 403 }, { status: 403, statusText: 'Forbidden' });

      expect((error as { status: number }).status).toBe(403);
    });

    it('propagates a 409 error (session not currently in ACTION)', () => {
      let error: unknown;

      service.closeSession(sessionId).subscribe({ error: e => (error = e) });

      const req = httpMock.expectOne(`${environment.apiUrl}/retro/sessions/${sessionId}/close`);
      req.flush({ title: 'Conflict', status: 409 }, { status: 409, statusText: 'Conflict' });

      expect((error as { status: number }).status).toBe(409);
    });
  });

  describe('createAction', () => {
    const sessionId = '11111111-1111-1111-1111-111111111111';
    const request: CreateRetroActionRequest = {
      title: 'Great job',
      sourceCardId: 'card-1',
    };

    const response: RetroActionResponse = {
      id: 'action-1',
      sessionId,
      teamId: 42,
      title: 'Great job',
      ownerUserId: null,
      dueDate: null,
      sourceCardId: 'card-1',
      status: 'A_FAIRE',
    };

    it('POSTs to /retro/sessions/{id}/actions with the exact request body and returns the created action', () => {
      let result: RetroActionResponse | undefined;

      service.createAction(sessionId, request).subscribe(r => (result = r));

      const req = httpMock.expectOne(`${environment.apiUrl}/retro/sessions/${sessionId}/actions`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(request);
      req.flush(response, { status: 201, statusText: 'Created' });

      expect(result).toEqual(response);
    });

    it('propagates a 400 error (invalid ownerUserId or sourceCardId)', () => {
      let error: unknown;

      service.createAction(sessionId, request).subscribe({ error: e => (error = e) });

      const req = httpMock.expectOne(`${environment.apiUrl}/retro/sessions/${sessionId}/actions`);
      req.flush({ title: 'Bad Request', status: 400 }, { status: 400, statusText: 'Bad Request' });

      expect((error as { status: number }).status).toBe(400);
    });

    it('propagates a 404 error (unknown session or belongs to another tenant)', () => {
      let error: unknown;

      service.createAction(sessionId, request).subscribe({ error: e => (error = e) });

      const req = httpMock.expectOne(`${environment.apiUrl}/retro/sessions/${sessionId}/actions`);
      req.flush({ title: 'Not Found', status: 404 }, { status: 404, statusText: 'Not Found' });

      expect((error as { status: number }).status).toBe(404);
    });

    it('propagates a 409 error (session not currently in ACTION)', () => {
      let error: unknown;

      service.createAction(sessionId, request).subscribe({ error: e => (error = e) });

      const req = httpMock.expectOne(`${environment.apiUrl}/retro/sessions/${sessionId}/actions`);
      req.flush({ title: 'Conflict', status: 409 }, { status: 409, statusText: 'Conflict' });

      expect((error as { status: number }).status).toBe(409);
    });
  });

  describe('updateActionStatus', () => {
    const actionId = 'action-1';
    const response: RetroActionResponse = {
      id: actionId,
      sessionId: '11111111-1111-1111-1111-111111111111',
      teamId: 42,
      title: 'Great job',
      ownerUserId: null,
      dueDate: null,
      sourceCardId: 'card-1',
      status: 'EN_COURS',
    };

    it('PATCHes /retro/actions/{actionId} with the new status and returns the updated action', () => {
      let result: RetroActionResponse | undefined;

      service.updateActionStatus(actionId, { status: 'EN_COURS' }).subscribe(r => (result = r));

      const req = httpMock.expectOne(`${environment.apiUrl}/retro/actions/${actionId}`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ status: 'EN_COURS' });
      req.flush(response);

      expect(result).toEqual(response);
    });

    it('allows reopening an ABANDONNEE action (no strict state machine)', () => {
      let result: RetroActionResponse | undefined;

      service.updateActionStatus(actionId, { status: 'A_FAIRE' }).subscribe(r => (result = r));

      const req = httpMock.expectOne(`${environment.apiUrl}/retro/actions/${actionId}`);
      req.flush({ ...response, status: 'A_FAIRE' });

      expect(result?.status).toBe('A_FAIRE');
    });

    it('propagates a 404 error (unknown action or belongs to another tenant)', () => {
      let error: unknown;

      service.updateActionStatus(actionId, { status: 'TERMINEE' }).subscribe({ error: e => (error = e) });

      const req = httpMock.expectOne(`${environment.apiUrl}/retro/actions/${actionId}`);
      req.flush({ title: 'Not Found', status: 404 }, { status: 404, statusText: 'Not Found' });

      expect((error as { status: number }).status).toBe(404);
    });
  });

  describe('listTeamActions', () => {
    const teamId = 42;
    const response: RetroActionResponse[] = [
      {
        id: 'action-1',
        sessionId: '11111111-1111-1111-1111-111111111111',
        teamId,
        title: 'Great job',
        ownerUserId: 7,
        dueDate: '2026-07-20',
        sourceCardId: 'card-1',
        status: 'A_FAIRE',
      },
    ];

    it('GETs /retro/teams/{teamId}/actions with no query params when no filter is given', () => {
      let result: RetroActionResponse[] | undefined;

      service.listTeamActions(teamId).subscribe(r => (result = r));

      const req = httpMock.expectOne(`${environment.apiUrl}/retro/teams/${teamId}/actions`);
      expect(req.request.method).toBe('GET');
      expect(req.request.params.keys()).toEqual([]);
      req.flush(response);

      expect(result).toEqual(response);
    });

    it('GETs with status and sort query params when both are given', () => {
      service.listTeamActions(teamId, { status: 'EN_COURS', sort: '-dueDate' }).subscribe();

      const req = httpMock.expectOne(
        r => r.url === `${environment.apiUrl}/retro/teams/${teamId}/actions`,
      );
      expect(req.request.params.get('status')).toBe('EN_COURS');
      expect(req.request.params.get('sort')).toBe('-dueDate');
      req.flush(response);
    });

    it('propagates a 403 error (caller not a team member)', () => {
      let error: unknown;

      service.listTeamActions(teamId).subscribe({ error: e => (error = e) });

      const req = httpMock.expectOne(`${environment.apiUrl}/retro/teams/${teamId}/actions`);
      req.flush({ title: 'Forbidden', status: 403 }, { status: 403, statusText: 'Forbidden' });

      expect((error as { status: number }).status).toBe(403);
    });
  });

  describe('listTeamMembers', () => {
    const teamId = 42;
    const response: RetroTeamMemberResponse[] = [{ id: 1, userId: 7, displayName: 'Alex' }];

    it('GETs /teams/{teamId}/members and returns the team members', () => {
      let result: RetroTeamMemberResponse[] | undefined;

      service.listTeamMembers(teamId).subscribe(r => (result = r));

      const req = httpMock.expectOne(`${environment.apiUrl}/teams/${teamId}/members`);
      expect(req.request.method).toBe('GET');
      req.flush(response);

      expect(result).toEqual(response);
    });

    it('propagates a 401 error (expected in this bootstrap phase — no bearer token attached)', () => {
      let error: unknown;

      service.listTeamMembers(teamId).subscribe({ error: e => (error = e) });

      const req = httpMock.expectOne(`${environment.apiUrl}/teams/${teamId}/members`);
      req.flush({ title: 'Unauthorized', status: 401 }, { status: 401, statusText: 'Unauthorized' });

      expect((error as { status: number }).status).toBe(401);
    });
  });
});

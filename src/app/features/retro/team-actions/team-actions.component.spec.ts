import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import { RetroActionResponse, RetroActionStatus, RetroTeamMemberResponse } from '../data-access/retro.models';
import { RetroApiService } from '../data-access/retro-api.service';
import { TeamActionsComponent } from './team-actions.component';

const TEAM_ID = 42;

const ACTION_1: RetroActionResponse = {
  id: 'action-1',
  sessionId: 'session-1',
  teamId: TEAM_ID,
  title: 'Improve code review turnaround',
  ownerUserId: 7,
  dueDate: '2026-07-20',
  sourceCardId: 'card-1',
  status: 'A_FAIRE',
};

const ACTION_2: RetroActionResponse = {
  id: 'action-2',
  sessionId: 'session-2',
  teamId: TEAM_ID,
  title: 'Document the deploy runbook',
  ownerUserId: null,
  dueDate: null,
  sourceCardId: null,
  status: 'EN_COURS',
};

const MEMBERS: RetroTeamMemberResponse[] = [{ id: 1, userId: 7, displayName: 'Alex' }];

/** The protected surface this spec exercises directly, type-erased (see `SessionRoomComponent`'s spec for the same convention). */
interface TestableComponent {
  missingTeamId: () => boolean;
  actions: () => RetroActionResponse[];
  loading: () => boolean;
  loadError: () => boolean;
  loadActions: () => void;
  statusFilter: () => RetroActionStatus | 'ALL';
  onStatusFilterChange: (value: string) => void;
  toggleSortDirection: () => void;
  onStatusChange: (action: RetroActionResponse, value: string) => void;
  updatingActionId: () => string | null;
  statusUpdateErrorId: () => string | null;
  ownerDisplayName: (ownerUserId: number | null) => string | null;
}

function asTestable(fixture: ComponentFixture<TeamActionsComponent>): TestableComponent {
  return fixture.componentInstance as unknown as TestableComponent;
}

describe('TeamActionsComponent', () => {
  let listTeamActionsSpy: ReturnType<typeof vi.fn>;
  let listTeamMembersSpy: ReturnType<typeof vi.fn>;
  let updateActionStatusSpy: ReturnType<typeof vi.fn>;

  function configure(teamIdParam: string | null): void {
    listTeamActionsSpy = vi.fn().mockReturnValue(of([ACTION_1, ACTION_2]));
    listTeamMembersSpy = vi.fn().mockReturnValue(of(MEMBERS));
    updateActionStatusSpy = vi.fn().mockReturnValue(of({ ...ACTION_1, status: 'EN_COURS' }));

    TestBed.configureTestingModule({
      imports: [TeamActionsComponent, TranslocoTestingModule.forRoot({ langs: { fr: {}, en: {} } })],
      providers: [
        {
          provide: RetroApiService,
          useValue: {
            listTeamActions: listTeamActionsSpy,
            listTeamMembers: listTeamMembersSpy,
            updateActionStatus: updateActionStatusSpy,
          },
        },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => teamIdParam } } },
        },
      ],
    });
  }

  it('should create', () => {
    configure(String(TEAM_ID));
    const fixture = TestBed.createComponent(TeamActionsComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('shows the missing-team-id error and never calls the API when the route has no teamId param', () => {
    configure(null);
    const fixture = TestBed.createComponent(TeamActionsComponent);
    fixture.detectChanges();

    expect(asTestable(fixture).missingTeamId()).toBe(true);
    expect(listTeamActionsSpy).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('missingTeamId');
  });

  it('shows the missing-team-id error when the teamId param is not a positive integer', () => {
    configure('not-a-number');
    const fixture = TestBed.createComponent(TeamActionsComponent);
    fixture.detectChanges();

    expect(asTestable(fixture).missingTeamId()).toBe(true);
    expect(listTeamActionsSpy).not.toHaveBeenCalled();
  });

  it('loads the team actions (ascending due date, no status filter) and team members on init', () => {
    configure(String(TEAM_ID));
    const fixture = TestBed.createComponent(TeamActionsComponent);
    fixture.detectChanges();

    expect(listTeamActionsSpy).toHaveBeenCalledWith(TEAM_ID, { sort: 'dueDate' });
    expect(listTeamMembersSpy).toHaveBeenCalledWith(TEAM_ID);
    expect(asTestable(fixture).actions()).toEqual([ACTION_1, ACTION_2]);
    expect(asTestable(fixture).loading()).toBe(false);
  });

  it('renders every action title as plain text (XSS safety), never as HTML', () => {
    configure(String(TEAM_ID));
    const maliciousTitle = '<img src=x onerror=alert(1)>';
    listTeamActionsSpy.mockReturnValue(of([{ ...ACTION_1, title: maliciousTitle }]));
    const fixture = TestBed.createComponent(TeamActionsComponent);
    fixture.detectChanges();

    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelector('img')).toBeNull();
    expect(host.textContent).toContain(maliciousTitle);
  });

  it('shows the empty message when the team has no actions', () => {
    configure(String(TEAM_ID));
    listTeamActionsSpy.mockReturnValue(of([]));
    const fixture = TestBed.createComponent(TeamActionsComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('empty');
  });

  it('sets loadError and shows the retry action on failure; retry reloads', () => {
    configure(String(TEAM_ID));
    listTeamActionsSpy.mockReturnValue(throwError(() => new Error('boom')));
    const fixture = TestBed.createComponent(TeamActionsComponent);
    fixture.detectChanges();

    expect(asTestable(fixture).loadError()).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('loadError');

    listTeamActionsSpy.mockReturnValue(of([ACTION_1]));
    asTestable(fixture).loadActions();

    expect(asTestable(fixture).loadError()).toBe(false);
    expect(asTestable(fixture).actions()).toEqual([ACTION_1]);
  });

  it('onStatusFilterChange() sends the status filter and reloads', () => {
    configure(String(TEAM_ID));
    const fixture = TestBed.createComponent(TeamActionsComponent);
    fixture.detectChanges();

    asTestable(fixture).onStatusFilterChange('EN_COURS');

    expect(asTestable(fixture).statusFilter()).toBe('EN_COURS');
    expect(listTeamActionsSpy).toHaveBeenLastCalledWith(TEAM_ID, { status: 'EN_COURS', sort: 'dueDate' });
  });

  it('onStatusFilterChange("ALL") omits the status param', () => {
    configure(String(TEAM_ID));
    const fixture = TestBed.createComponent(TeamActionsComponent);
    fixture.detectChanges();
    asTestable(fixture).onStatusFilterChange('EN_COURS');

    asTestable(fixture).onStatusFilterChange('ALL');

    expect(listTeamActionsSpy).toHaveBeenLastCalledWith(TEAM_ID, { sort: 'dueDate' });
  });

  it('toggleSortDirection() flips between ascending and descending due-date sort', () => {
    configure(String(TEAM_ID));
    const fixture = TestBed.createComponent(TeamActionsComponent);
    fixture.detectChanges();

    asTestable(fixture).toggleSortDirection();
    expect(listTeamActionsSpy).toHaveBeenLastCalledWith(TEAM_ID, { sort: '-dueDate' });

    asTestable(fixture).toggleSortDirection();
    expect(listTeamActionsSpy).toHaveBeenLastCalledWith(TEAM_ID, { sort: 'dueDate' });
  });

  it('onStatusChange() updates the action status via the API and replaces the row in place', () => {
    configure(String(TEAM_ID));
    const fixture = TestBed.createComponent(TeamActionsComponent);
    fixture.detectChanges();

    asTestable(fixture).onStatusChange(ACTION_1, 'EN_COURS');

    expect(updateActionStatusSpy).toHaveBeenCalledWith('action-1', { status: 'EN_COURS' });
    expect(asTestable(fixture).actions().find(a => a.id === 'action-1')?.status).toBe('EN_COURS');
    expect(asTestable(fixture).updatingActionId()).toBeNull();
  });

  it('onStatusChange() allows reopening an ABANDONNEE action back to A_FAIRE (no strict state machine)', () => {
    configure(String(TEAM_ID));
    updateActionStatusSpy.mockReturnValue(of({ ...ACTION_1, status: 'ABANDONNEE' }));
    const fixture = TestBed.createComponent(TeamActionsComponent);
    fixture.detectChanges();
    asTestable(fixture).onStatusChange(ACTION_1, 'ABANDONNEE');

    updateActionStatusSpy.mockReturnValue(of({ ...ACTION_1, status: 'A_FAIRE' }));
    asTestable(fixture).onStatusChange(ACTION_1, 'A_FAIRE');

    expect(updateActionStatusSpy).toHaveBeenLastCalledWith('action-1', { status: 'A_FAIRE' });
    expect(asTestable(fixture).actions().find(a => a.id === 'action-1')?.status).toBe('A_FAIRE');
  });

  it('onStatusChange() surfaces a per-row error on failure without touching the row', () => {
    configure(String(TEAM_ID));
    updateActionStatusSpy.mockReturnValue(throwError(() => new Error('boom')));
    const fixture = TestBed.createComponent(TeamActionsComponent);
    fixture.detectChanges();

    asTestable(fixture).onStatusChange(ACTION_1, 'TERMINEE');
    fixture.detectChanges();

    expect(asTestable(fixture).statusUpdateErrorId()).toBe('action-1');
    expect(asTestable(fixture).actions().find(a => a.id === 'action-1')?.status).toBe('A_FAIRE');
    expect(fixture.nativeElement.textContent).toContain('statusChangeError');
  });

  it('ownerDisplayName() resolves a known owner and returns null for an unknown/unset one', () => {
    configure(String(TEAM_ID));
    const fixture = TestBed.createComponent(TeamActionsComponent);
    fixture.detectChanges();

    expect(asTestable(fixture).ownerDisplayName(7)).toBe('Alex');
    expect(asTestable(fixture).ownerDisplayName(999)).toBeNull();
    expect(asTestable(fixture).ownerDisplayName(null)).toBeNull();
  });

  it('team member load failure is silently ignored (best-effort) — actions still render', () => {
    configure(String(TEAM_ID));
    listTeamMembersSpy.mockReturnValue(throwError(() => new Error('boom')));
    const fixture = TestBed.createComponent(TeamActionsComponent);

    expect(() => fixture.detectChanges()).not.toThrow();
    expect(asTestable(fixture).actions()).toEqual([ACTION_1, ACTION_2]);
    expect(asTestable(fixture).ownerDisplayName(7)).toBeNull();
  });
});

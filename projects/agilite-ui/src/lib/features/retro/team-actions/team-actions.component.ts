import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { RetroApiService } from '../data-access/retro-api.service';
import { RETRO_ACTION_STATUSES, RetroActionResponse, RetroActionStatus, RetroTeamMemberResponse } from '../data-access/retro.models';

/** `'ALL'` is a purely client-side option — never sent as a `status` query param. */
type StatusFilter = RetroActionStatus | 'ALL';

/**
 * "Actions de l'équipe" (US20.3.1) — every retrospective action belonging to a team, across
 * every session past and present, consulted **outside** any live session (route
 * `/retro/teams/:teamId/actions`). Filterable by status, sortable by due date, with an inline
 * status-change control per row.
 *
 * Unlike {@link SessionRoomComponent}'s action-creation form/list, status changes made here are
 * **not** realtime — `PATCH /retro/actions/{actionId}` broadcasts nothing (see
 * {@link RetroApiService.updateActionStatus}'s TSDoc) — this view is always a point-in-time
 * snapshot, refreshed on demand (filter/sort change, or a successful status update).
 *
 * **Security (AC):** every action's title is rendered exclusively via Angular text interpolation
 * (`{{ }}`) — never `[innerHTML]` — mirroring the session room's same convention, so no
 * HTML/JS in a title can ever execute.
 */
@Component({
  selector: 'app-team-actions',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
  templateUrl: './team-actions.component.html',
  styleUrl: './team-actions.component.scss',
})
export class TeamActionsComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly retroApi = inject(RetroApiService);

  protected readonly allStatuses = RETRO_ACTION_STATUSES;

  protected readonly teamId = signal<number | null>(null);
  protected readonly missingTeamId = signal(false);

  protected readonly actions = signal<RetroActionResponse[]>([]);
  protected readonly teamMembers = signal<RetroTeamMemberResponse[]>([]);

  protected readonly statusFilter = signal<StatusFilter>('ALL');
  protected readonly sortDirection = signal<'asc' | 'desc'>('asc');

  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);

  /** Id of the action a status-change call is currently in flight for, or `null`. */
  protected readonly updatingActionId = signal<string | null>(null);
  /** Id of the action whose last status-change call failed, or `null`. */
  protected readonly statusUpdateErrorId = signal<string | null>(null);

  ngOnInit(): void {
    const raw = this.route.snapshot.paramMap.get('teamId');
    const parsed = raw !== null ? Number(raw) : NaN;
    if (raw === null || !Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
      this.missingTeamId.set(true);
      this.loading.set(false);
      return;
    }
    this.teamId.set(parsed);
    this.loadActions();
    this.loadTeamMembers(parsed);
  }

  /** (Re)loads the team's actions with the current filter/sort — also the "retry" action. */
  protected loadActions(): void {
    const teamId = this.teamId();
    if (teamId === null) {
      return;
    }
    this.loading.set(true);
    this.loadError.set(false);
    const status = this.statusFilter();
    this.retroApi
      .listTeamActions(teamId, {
        ...(status !== 'ALL' ? { status } : {}),
        sort: this.sortDirection() === 'asc' ? 'dueDate' : '-dueDate',
      })
      .subscribe({
        next: actions => {
          this.actions.set(actions);
          this.loading.set(false);
        },
        error: () => {
          this.loadError.set(true);
          this.loading.set(false);
        },
      });
  }

  /** Updates the status filter from the `<select>`'s value and reloads. */
  protected onStatusFilterChange(value: string): void {
    this.statusFilter.set(value === 'ALL' ? 'ALL' : (value as RetroActionStatus));
    this.loadActions();
  }

  /** Flips the due-date sort direction and reloads. */
  protected toggleSortDirection(): void {
    this.sortDirection.update(current => (current === 'asc' ? 'desc' : 'asc'));
    this.loadActions();
  }

  /**
   * Changes an action's status inline (US20.3.1) — no state machine, every status is reachable
   * from every other one. Updates the row in place on success; no-ops (leaves the `<select>`
   * showing the stale value until the next reload) and surfaces a per-row error on failure.
   *
   * @param action the action whose status is changing
   * @param value the new status, as a raw `<select>` value
   */
  protected onStatusChange(action: RetroActionResponse, value: string): void {
    const status = value as RetroActionStatus;
    this.updatingActionId.set(action.id);
    this.statusUpdateErrorId.set(null);
    this.retroApi.updateActionStatus(action.id, { status }).subscribe({
      next: updated => {
        this.updatingActionId.set(null);
        this.actions.update(current => current.map(a => (a.id === updated.id ? updated : a)));
      },
      error: () => {
        this.updatingActionId.set(null);
        this.statusUpdateErrorId.set(action.id);
      },
    });
  }

  /** Display name of a team member for a given owner id, or `null` if unknown/unset. */
  protected ownerDisplayName(ownerUserId: number | null): string | null {
    if (ownerUserId === null) {
      return null;
    }
    return this.teamMembers().find(m => m.userId === ownerUserId)?.displayName ?? null;
  }

  /** Best-effort load of the team's members, to resolve `ownerUserId` to a display name. */
  private loadTeamMembers(teamId: number): void {
    this.retroApi.listTeamMembers(teamId).subscribe({
      next: members => this.teamMembers.set(members),
      error: () => {
        // Best-effort only — rows simply fall back to a raw "unassigned"/unresolved owner.
      },
    });
  }
}

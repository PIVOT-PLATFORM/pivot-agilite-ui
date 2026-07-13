import { Routes } from '@angular/router';

/**
 * Real feature routes for the agilite module (planning poker, wheels, retrospectives), exposed as
 * a single `Routes` array to be mounted by the consuming shell under a guarded path (e.g.
 * `moduleGuard('agilite')` from `@pivot-platform/ui-core`). Mirrors EN17's `COLLABORATIF_ROUTES`.
 *
 * Every feature stays lazy-loaded — no massive barrel import. Tenant/team URL segments
 * (`:teamId`, `:sessionId`, `:wheelId`, `:roomId`) are preserved exactly as authored (US14.x,
 * US20.x, US09.x — see pivot-docs). The bare `''` landing (home) is deliberately NOT included
 * here: it is the shell's/host harness's responsibility, not this module's.
 */
export const AGILITE_ROUTES: Routes = [
  {
    // Landing agrégé du module (Daily / Roue d'équipe / Capacity) — comble le `/agilite` vide.
    path: '',
    loadComponent: () => import('./features/hub/agilite-hub.component').then(m => m.AgiliteHubComponent),
  },
  {
    path: 'wheels',
    loadComponent: () =>
      import('./features/wheels/wheel-list/wheel-list.component').then(m => m.WheelListComponent),
  },
  {
    path: 'wheels/new',
    loadComponent: () =>
      import('./features/wheels/wheel-form/wheel-form.component').then(m => m.WheelFormComponent),
  },
  {
    path: 'wheels/:wheelId/edit',
    loadComponent: () =>
      import('./features/wheels/wheel-form/wheel-form.component').then(m => m.WheelFormComponent),
  },
  {
    // US14.2.1 — page de détail : tirage pondéré anti-repeat + historique des tirages.
    path: 'wheels/:wheelId',
    loadComponent: () =>
      import('./features/wheels/wheel-detail/wheel-detail.component').then(
        m => m.WheelDetailComponent,
      ),
  },
  {
    // US20.1.1 — création d'une session de rétrospective.
    path: 'retro/create',
    loadComponent: () =>
      import('./features/retro/create-session/create-session.component').then(
        m => m.CreateSessionComponent,
      ),
  },
  {
    // US20.1.2a — animation temps réel (contribution masquée + révélation) d'une session.
    path: 'retro/sessions/:sessionId',
    loadComponent: () =>
      import('./features/retro/session-room/session-room.component').then(
        m => m.SessionRoomComponent,
      ),
  },
  {
    // US20.3.1 — "Actions de l'équipe" : consultable hors contexte de session, filtrable par
    // statut, triable par échéance.
    path: 'retro/teams/:teamId/actions',
    loadComponent: () =>
      import('./features/retro/team-actions/team-actions.component').then(
        m => m.TeamActionsComponent,
      ),
  },
  {
    path: 'scrum-poker/rooms/new',
    loadComponent: () =>
      import('./features/scrum-poker/create-room/create-room.component').then(
        m => m.CreateRoomComponent,
      ),
  },
  {
    path: 'scrum-poker/rooms/join',
    loadComponent: () =>
      import('./features/scrum-poker/join-room/join-room.component').then(
        m => m.JoinRoomComponent,
      ),
  },
];

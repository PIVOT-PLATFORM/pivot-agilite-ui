import { Routes } from '@angular/router';

/**
 * Routes métier ajoutées au fil du développement (US tracées `pivot-docs`). `wheels/*`
 * (US14.1.1), `retro/create` (US20.1.1), `scrum-poker/rooms/new` (US09.1.1) et
 * `scrum-poker/rooms/join` (US09.1.2) sont les premières features réelles de ce module.
 * Chaque feature reste lazy-loaded — jamais de barrel d'import massif.
 */
export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/home/home.component').then(m => m.HomeComponent),
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
    // US20.1.1 — création d'une session de rétrospective. Pas de guard ici : ModuleGuard
    // (@pivot/ui-core) n'est pas encore consommable dans ce repo (cf. CLAUDE.md, TODO-SETUP.md).
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

import { Routes } from '@angular/router';

/**
 * Squelette de bootstrap — routes métier ajoutées au fil du développement (US tracées
 * `pivot-docs`). `wheels/*` (US14.1.1) et `retro/create` (US20.1.1) sont les premières
 * features réelles de ce module.
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
];

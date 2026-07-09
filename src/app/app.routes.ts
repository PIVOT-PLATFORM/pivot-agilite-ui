import { Routes } from '@angular/router';

/**
 * Squelette de bootstrap — routes métier ajoutées au fil du développement (US tracées
 * `pivot-docs`). `wheels/*` (US14.1.1) est la première feature réelle de ce module.
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
];

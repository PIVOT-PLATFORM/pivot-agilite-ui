import { Routes } from '@angular/router';

/**
 * Squelette de bootstrap — une seule route placeholder. Les routes métier
 * (capacity planning, daily standup timer, scrum poker) sont ajoutées au fil
 * du développement, hors périmètre de ce bootstrap d'infrastructure.
 */
export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/home/home.component').then(m => m.HomeComponent),
  },
];

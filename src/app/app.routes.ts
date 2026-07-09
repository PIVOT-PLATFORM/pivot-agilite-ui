import { Routes } from '@angular/router';

/**
 * Routes métier ajoutées au fil du développement (US09.1.1 : création de room scrum poker).
 * Chaque feature reste lazy-loaded — jamais de barrel d'import massif.
 */
export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/home/home.component').then(m => m.HomeComponent),
  },
  {
    path: 'scrum-poker/rooms/new',
    loadComponent: () =>
      import('./features/scrum-poker/create-room/create-room.component').then(
        m => m.CreateRoomComponent,
      ),
  },
];

import { Routes } from '@angular/router';
import { AGILITE_ROUTES } from '../../projects/agilite-ui/src/public-api';

/**
 * Standalone dev harness only (nginx port 8090) — mounts the agilite module's real feature routes
 * (`AGILITE_ROUTES`) imported directly from the `agilite-ui` library project's public API (single
 * source of truth, mirrors EN17.9). The real shell (`pivot-ui`) consumes the published
 * `@pivot-platform/agilite-ui` package instead, mounting the same routes under a guarded path.
 *
 * The bare `''` landing (home) is the harness's own bootstrap placeholder — deliberately NOT part
 * of `AGILITE_ROUTES` (the shell owns the module's landing/home). Each feature route stays
 * lazy-loaded via the library's own `loadComponent` imports.
 */
export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/home/home.component').then(m => m.HomeComponent),
  },
  ...AGILITE_ROUTES,
];

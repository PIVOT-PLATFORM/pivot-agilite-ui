import { ApplicationConfig, isDevMode, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideTransloco } from '@jsverse/transloco';
import { routes } from './app.routes';
import { TranslocoHttpLoader } from './core/i18n/transloco.loader';
import { provideAgiliteUi } from '../../projects/agilite-ui/src/public-api';
import { environment } from '../environments/environment';

/**
 * Root configuration — standalone dev-harness bootstrap (nginx, port 8090 in local dev). This is
 * the only place in the repo that still imports `environment.ts` directly (benefiting from this
 * app project's Angular CLI `fileReplacements`) — the whole agilite feature code receives its
 * `apiUrl`/`wsUrl` via `provideAgiliteUi`/`AGILITE_API_URL`/`AGILITE_WS_URL` (see EN18, mirrors
 * EN17.9), so it stays consumable as-is once published as a library and lazy-loaded into the
 * `pivot-ui` shell.
 *
 * No auth, no HTTP interceptor as long as `@pivot/ui-core` is not consumable (see CLAUDE.md).
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(),
    provideAgiliteUi({ apiUrl: environment.apiUrl, wsUrl: environment.wsUrl }),
    provideTransloco({
      config: {
        availableLangs: ['en', 'fr'],
        defaultLang: 'fr',
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
      },
      loader: TranslocoHttpLoader,
    }),
  ],
};

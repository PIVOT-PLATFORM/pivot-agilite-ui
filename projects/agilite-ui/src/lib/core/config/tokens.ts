import { InjectionToken } from '@angular/core';
import { environment } from '../../../environments/environment';

/**
 * Base URL of the agilite backend API (`pivot-agilite-core`). En production, l'URL réelle est
 * fournie par `provideAgiliteUi()` quand le module est lazy-loadé depuis le shell `pivot-ui` — elle
 * PRIME sur la valeur par défaut ci-dessous. La `factory` fournit un repli (dev/tests/standalone)
 * issu d'`environment`, pour que le token soit toujours résolu sans provider explicite.
 */
export const AGILITE_API_URL = new InjectionToken<string>('AGILITE_API_URL', {
  factory: () => environment.apiUrl,
});

/**
 * Broker URL for the native (non-SockJS) STOMP endpoint used by the real-time features
 * (planning poker, wheels, retro). Either an absolute `ws://`/`wss://` URL (dev) or a relative
 * path resolved at connect time against the page origin (nginx-proxied prod build) — see each
 * WS service's `buildWsUrl`. Fourni par `provideAgiliteUi()` en prod (prime), avec un repli
 * `environment.wsUrl` via la `factory` pour le dev/les tests.
 */
export const AGILITE_WS_URL = new InjectionToken<string>('AGILITE_WS_URL', {
  factory: () => environment.wsUrl,
});

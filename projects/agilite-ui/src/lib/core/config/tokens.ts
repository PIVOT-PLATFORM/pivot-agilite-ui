import { InjectionToken } from '@angular/core';

/**
 * Base URL of the agilite backend API (`pivot-agilite-core`). Provided by the consuming app —
 * `provideAgiliteUi()` when this module is lazy-loaded from the `pivot-ui` shell, or
 * `app.config.ts` (from `environment.apiUrl`) when this repo runs standalone. The library never
 * imports `environment` directly, so it stays consumable once published (EN18, mirrors EN17.9).
 */
export const AGILITE_API_URL = new InjectionToken<string>('AGILITE_API_URL');

/**
 * Broker URL for the native (non-SockJS) STOMP endpoint used by the real-time features
 * (planning poker, wheels, retro). Either an absolute `ws://`/`wss://` URL (dev) or a relative
 * path resolved at connect time against the page origin (nginx-proxied prod build) — see each
 * WS service's `buildWsUrl`. Provided by the consuming app the same way as {@link AGILITE_API_URL}
 * (from `environment.wsUrl` standalone), so the library never imports `environment`.
 */
export const AGILITE_WS_URL = new InjectionToken<string>('AGILITE_WS_URL');

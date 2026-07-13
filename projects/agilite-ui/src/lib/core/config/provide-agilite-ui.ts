import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { AGILITE_API_URL, AGILITE_WS_URL } from './tokens';

export interface AgiliteUiConfig {
  /** Base URL of the agilite backend API (`pivot-agilite-core`), e.g. `/api/agilite`. */
  apiUrl: string;
  /**
   * Broker URL for the native STOMP endpoint powering the real-time features, e.g. `/ws/agilite`
   * (relative, nginx-proxied prod) or `ws://localhost:8082/ws/agilite` (dev). Resolved to an
   * absolute `ws(s)://` URL at connect time when relative — see the WS services' `buildWsUrl`.
   */
  wsUrl: string;
}

/** Configures @pivot-platform/agilite-ui. Call this in the consuming app's providers array. */
export function provideAgiliteUi(config: AgiliteUiConfig): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: AGILITE_API_URL, useValue: config.apiUrl },
    { provide: AGILITE_WS_URL, useValue: config.wsUrl },
  ]);
}

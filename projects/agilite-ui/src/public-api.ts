// Config
export { AGILITE_API_URL, AGILITE_WS_URL } from './lib/core/config/tokens';
export { provideAgiliteUi } from './lib/core/config/provide-agilite-ui';
export type { AgiliteUiConfig } from './lib/core/config/provide-agilite-ui';

// Routes — mounted by the consuming shell under a guarded path (e.g. moduleGuard('agilite')
// from @pivot-platform/ui-core), see pivot-docs EN18 (mirrors EN17.9).
export { AGILITE_ROUTES } from './lib/agilite.routes';

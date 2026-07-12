# @pivot-platform/agilite-ui

Publishable Angular library packaging the PIVOT **agilite** module features — planning poker
(scrum-poker), wheels and retrospectives — for lazy-loading into the `pivot-ui` shell (EN18).

Mirrors the EN17 `@pivot-platform/collaboratif-ui` extraction pattern: no `environment` import,
all deployment-specific configuration (`apiUrl`, native STOMP `wsUrl`) injected by the consuming
app via `provideAgiliteUi(...)`; routes exposed as `AGILITE_ROUTES`.

```ts
import { provideAgiliteUi, AGILITE_ROUTES } from '@pivot-platform/agilite-ui';

// providers
provideAgiliteUi({ apiUrl: environment.apiUrl, wsUrl: environment.wsUrl });

// routes (mounted by the shell under a guarded path)
{ path: 'agilite', loadChildren: () => Promise.resolve(AGILITE_ROUTES) }
```

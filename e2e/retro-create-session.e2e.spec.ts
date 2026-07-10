import { test, expect, Page, Route } from '@playwright/test';

/**
 * E2E coverage for the retrospective session creation form (US20.1.1, extended in
 * US20.2.1 with the format picker + custom format column builder,
 * `CreateSessionComponent`, route `/retro/create`).
 *
 * `pivot-agilite-core` (the real backend, port 8082) has not published a GHCR image yet
 * (no release exists at the time of writing — see `pivot-agilite-core/TODO-SETUP.md` /
 * this repo's own `.github/workflows/e2e.yml` history) — unlike `pivot-collaboratif-ui`'s
 * E2E workflow, which starts a real backend container, this repo's `e2e.yml` only builds
 * and serves the static Angular bundle with no backend at all. Rather than block this
 * spec on that (out of scope for this US, tracked at the infra level), every scenario
 * below stubs the backend response at the network level via `page.route`, matching this
 * repo's actual CI capability today. Swap to a real `pivot-agilite-core` container (like
 * `pivot-collaboratif-ui`'s `e2e.yml`) once an image is published — no spec changes
 * needed, only the CI workflow.
 */

// `GET` (list) and `POST` (create) both live at the same `/retro/formats` path — the two
// route handlers below dispatch on `route.request().method()` and `route.fallback()` to
// each other, same pattern as a real single-endpoint, multi-verb route.
const FORMATS_ENDPOINT = '**/api/agilite/retro/formats';
const CREATE_SESSION_ENDPOINT = '**/api/agilite/retro/sessions';

/** The 4 system formats, shaped exactly like the real `GET /retro/formats` contract. */
const FORMATS_RESPONSE = {
  formats: [
    {
      key: 'START_STOP_CONTINUE',
      label: 'Start / Stop / Continue',
      system: true,
      columns: [
        {
          key: 'START',
          label: 'Commencer',
          color: '#2E7D32',
          description: "Ce que l'équipe doit commencer à faire",
          icon: 'play_arrow',
        },
        {
          key: 'STOP',
          label: 'Arrêter',
          color: '#C62828',
          description: "Ce que l'équipe doit arrêter de faire",
          icon: 'stop',
        },
        {
          key: 'CONTINUE',
          label: 'Continuer',
          color: '#1565C0',
          description: "Ce que l'équipe doit continuer à faire",
          icon: 'autorenew',
        },
      ],
    },
    {
      key: 'KIF_KAF',
      label: 'Kif / Kaf',
      system: true,
      columns: [
        { key: 'KIF', label: 'Kif', color: '#2E7D32', description: null, icon: null },
        { key: 'KAF', label: 'Kaf', color: '#C62828', description: null, icon: null },
      ],
    },
    {
      key: 'FOUR_L',
      label: '4L',
      system: true,
      columns: [
        { key: 'LIKED', label: 'Aimé', color: null, description: null, icon: null },
        { key: 'LEARNED', label: 'Appris', color: null, description: null, icon: null },
        { key: 'LACKED', label: 'Manqué', color: null, description: null, icon: null },
        { key: 'LONGED_FOR', label: 'Souhaité', color: null, description: null, icon: null },
      ],
    },
    {
      key: 'MAD_SAD_GLAD',
      label: 'Mad / Sad / Glad',
      system: true,
      columns: [
        { key: 'MAD', label: 'Mad', color: null, description: null, icon: null },
        { key: 'SAD', label: 'Sad', color: null, description: null, icon: null },
        { key: 'GLAD', label: 'Glad', color: null, description: null, icon: null },
      ],
    },
  ],
};

/** Stubs `GET /retro/formats` with the 4 system formats — needed by every scenario below,
 * since `CreateSessionComponent` loads the catalogue on init before any format can be picked. */
async function stubFormats(page: Page): Promise<void> {
  await page.route(FORMATS_ENDPOINT, async (route: Route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FORMATS_RESPONSE) });
  });
}

test.describe('Create retrospective session — happy path, system format (US20.1.1)', () => {
  test('fills the form, selects a system format card, submits, and displays the created joinCode', async ({
    page,
  }) => {
    await stubFormats(page);
    await page.route(CREATE_SESSION_ENDPOINT, async (route: Route) => {
      expect(route.request().method()).toBe('POST');
      const body = route.request().postDataJSON();
      expect(body).toEqual({
        title: 'Rétro Sprint 8',
        format: 'START_STOP_CONTINUE',
        teamId: 42,
      });
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: '11111111-1111-1111-1111-111111111111',
          title: 'Rétro Sprint 8',
          format: 'START_STOP_CONTINUE',
          teamId: 42,
          facilitatorUserId: 7,
          joinCode: 'A3F9K2',
          currentPhase: 'CONTRIBUTION',
          contributionTimerSeconds: null,
          voteTimerSeconds: null,
          actionTimerSeconds: null,
          voteCountPerParticipant: 3,
          sprintRef: null,
          expiresAt: '2026-07-11T00:00:00Z',
          createdAt: '2026-07-10T00:00:00Z',
        }),
      });
    });

    await page.goto('/retro/create');

    await page.getByLabel('Titre').fill('Rétro Sprint 8');
    await page.getByLabel("ID de l'équipe").fill('42');
    // The format picker is a native radio-button group styled as cards (US20.2.1) — clicking
    // anywhere inside the card's `<label>` (here, its visible name) checks the underlying
    // `<input type="radio">`, exactly like a real user would.
    await page.getByText('Start / Stop / Continue', { exact: true }).click();
    await page.getByRole('button', { name: 'Créer la session' }).click();

    await expect(page.getByRole('heading', { name: 'Session créée' })).toBeVisible();
    // `exact: true` disambiguates from the visually-hidden aria-live announcement paragraph,
    // which also contains the joinCode as part of a longer sentence (both are legitimately
    // present at once: one for sighted users, one as an explicit screen-reader announcement).
    await expect(page.getByText('A3F9K2', { exact: true })).toBeVisible();
    await expect(page.getByText('Rétro Sprint 8')).toBeVisible();
  });
});

test.describe('Create retrospective session — happy path, custom format (US20.2.1)', () => {
  test('picks the custom format card, builds 2 columns, submits, and displays the created joinCode', async ({
    page,
  }) => {
    await stubFormats(page);
    await page.route(FORMATS_ENDPOINT, async (route: Route) => {
      if (route.request().method() !== 'POST') {
        await route.fallback();
        return;
      }
      const body = route.request().postDataJSON();
      expect(body).toEqual({
        label: 'Notre format perso',
        columns: [{ label: 'Colonne A' }, { label: 'Colonne B' }],
      });
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          key: '33333333-3333-3333-3333-333333333333',
          label: 'Notre format perso',
          system: false,
          columns: [
            { key: 'COLONNE_A', label: 'Colonne A', color: null, description: null, icon: null },
            { key: 'COLONNE_B', label: 'Colonne B', color: null, description: null, icon: null },
          ],
        }),
      });
    });
    await page.route(CREATE_SESSION_ENDPOINT, async (route: Route) => {
      const body = route.request().postDataJSON();
      expect(body).toEqual({
        title: 'Rétro Sprint 8',
        format: 'CUSTOM',
        teamId: 42,
        customFormatId: '33333333-3333-3333-3333-333333333333',
      });
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: '11111111-1111-1111-1111-111111111111',
          title: 'Rétro Sprint 8',
          format: 'CUSTOM',
          customFormatId: '33333333-3333-3333-3333-333333333333',
          teamId: 42,
          facilitatorUserId: 7,
          joinCode: 'B7K2Q9',
          currentPhase: 'CONTRIBUTION',
          contributionTimerSeconds: null,
          voteTimerSeconds: null,
          actionTimerSeconds: null,
          voteCountPerParticipant: 3,
          sprintRef: null,
          expiresAt: '2026-07-11T00:00:00Z',
          createdAt: '2026-07-10T00:00:00Z',
        }),
      });
    });

    await page.goto('/retro/create');

    await page.getByLabel('Titre').fill('Rétro Sprint 8');
    await page.getByLabel("ID de l'équipe").fill('42');
    await page.getByText('Personnalisé', { exact: true }).click();

    await page.getByLabel('Nom du format personnalisé').fill('Notre format perso');
    await page.getByLabel('Libellé de la colonne 1').fill('Colonne A');
    await page.getByLabel('Libellé de la colonne 2').fill('Colonne B');

    await page.getByRole('button', { name: 'Créer la session' }).click();

    await expect(page.getByRole('heading', { name: 'Session créée' })).toBeVisible();
    await expect(page.getByText('B7K2Q9', { exact: true })).toBeVisible();
    await expect(page.getByText('Notre format perso')).toBeVisible();
  });

  test('cannot reduce the column builder below 2 columns — client-side bound on the "remove" buttons', async ({
    page,
  }) => {
    // The true 0/1-column case (`CUSTOM_FORMAT_INVALID_COLUMN_COUNT`) is a backend-owned 400
    // response — it cannot be reached through this UI at all, because the "remove column"
    // buttons are structurally disabled once exactly 2 columns remain (the contractual
    // minimum). This test asserts that disabled state directly, per this US's own client-side
    // validation philosophy: mirror the backend bound in the UI, but the backend stays
    // authoritative (covered by `pivot-agilite-core`'s own tests for the 0/1-column case).
    await stubFormats(page);
    await page.goto('/retro/create');

    await page.getByText('Personnalisé', { exact: true }).click();

    const removeButtons = page.getByRole('button', { name: 'Supprimer cette colonne' });
    await expect(removeButtons).toHaveCount(2);
    await expect(removeButtons.nth(0)).toBeDisabled();
    await expect(removeButtons.nth(1)).toBeDisabled();
  });
});

test.describe('Create retrospective session — critical error case', () => {
  test('shows a dedicated message when the caller is not a member of the team (403)', async ({ page }) => {
    await stubFormats(page);
    await page.route(CREATE_SESSION_ENDPOINT, async (route: Route) => {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          type: 'about:blank',
          title: 'Forbidden',
          status: 403,
        }),
      });
    });

    await page.goto('/retro/create');

    await page.getByLabel('Titre').fill('Rétro Sprint 8');
    await page.getByLabel("ID de l'équipe").fill('99');
    await page.getByText('Start / Stop / Continue', { exact: true }).click();
    await page.getByRole('button', { name: 'Créer la session' }).click();

    await expect(page.getByRole('alert').getByText("Vous n'êtes pas membre de cette équipe.")).toBeVisible();
    // No session was created — the form stays on screen, no joinCode leaked.
    await expect(page.getByRole('heading', { name: 'Session créée' })).toHaveCount(0);
  });
});

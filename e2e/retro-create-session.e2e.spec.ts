import { test, expect, Route } from '@playwright/test';

/**
 * E2E coverage for the retrospective session creation form (US20.1.1,
 * `CreateSessionComponent`, route `/retro/create`).
 *
 * `pivot-agilite-core` (the real backend, port 8082) has not published a GHCR image yet
 * (no release exists at the time of writing — see `pivot-agilite-core/TODO-SETUP.md` /
 * this repo's own `.github/workflows/e2e.yml` history) — unlike `pivot-collaboratif-ui`'s
 * E2E workflow, which starts a real backend container, this repo's `e2e.yml` only builds
 * and serves the static Angular bundle with no backend at all. Rather than block this
 * spec on that (out of scope for this US, tracked at the infra level), both scenarios
 * below stub the backend response at the network level via `page.route`, matching this
 * repo's actual CI capability today. Swap to a real `pivot-agilite-core` container (like
 * `pivot-collaboratif-ui`'s `e2e.yml`) once an image is published — no spec changes
 * needed, only the CI workflow.
 */

const CREATE_SESSION_ENDPOINT = '**/api/agilite/retro/sessions';

test.describe('Create retrospective session — happy path (US20.1.1)', () => {
  test('fills the form, submits, and displays the created joinCode', async ({ page }) => {
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
    await page.getByLabel('Format').selectOption('START_STOP_CONTINUE');
    await page.getByRole('button', { name: 'Créer la session' }).click();

    await expect(page.getByRole('heading', { name: 'Session créée' })).toBeVisible();
    await expect(page.getByText('A3F9K2')).toBeVisible();
    await expect(page.getByText('Rétro Sprint 8')).toBeVisible();
  });
});

test.describe('Create retrospective session — critical error case', () => {
  test('shows a dedicated message when the caller is not a member of the team (403)', async ({ page }) => {
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
    await page.getByLabel('Format').selectOption('START_STOP_CONTINUE');
    await page.getByRole('button', { name: 'Créer la session' }).click();

    await expect(page.getByRole('alert').getByText("Vous n'êtes pas membre de cette équipe.")).toBeVisible();
    // No session was created — the form stays on screen, no joinCode leaked.
    await expect(page.getByRole('heading', { name: 'Session créée' })).toHaveCount(0);
  });
});

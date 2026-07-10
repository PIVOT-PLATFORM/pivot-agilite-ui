import { test, expect, Route } from '@playwright/test';

/**
 * E2E coverage for the retrospective realtime room (US20.1.2a, `SessionRoomComponent`, route
 * `/retro/sessions/:sessionId`).
 *
 * Same CI capability constraint already documented in `retro-create-session.e2e.spec.ts` /
 * `join-room.e2e.spec.ts`: `pivot-agilite-core` has no published image consumable by this repo's
 * `e2e.yml` yet, so every HTTP call is stubbed at the network level via `page.route`.
 *
 * The STOMP/WebSocket leg is deliberately **not** mocked at the protocol level — same rationale
 * as `join-room.e2e.spec.ts`: the real `RxStomp` client is left to attempt a real connection to
 * `ws://localhost:8082/ws/agilite`; with no backend listening here, it genuinely settles to the
 * `'error'` status rather than a canned value. `RetroSessionWsService`'s unit spec already covers
 * the `'connected'`/masked-count/facilitator-preview/reveal cases with a mocked STOMP client —
 * this E2E spec exists to prove the real page renders and wires those pieces together, not to
 * re-prove the realtime message-handling logic itself.
 */

const SESSION_ID = '11111111-1111-1111-1111-111111111111';
const PARTICIPANTS_ENDPOINT = `**/api/agilite/retro/sessions/${SESSION_ID}/participants`;
const SESSION_ENDPOINT = `**/api/agilite/retro/sessions/${SESSION_ID}`;
const FORMATS_ENDPOINT = '**/api/agilite/retro/formats';

const FORMATS_RESPONSE = {
  formats: [
    {
      key: 'START_STOP_CONTINUE',
      label: 'Start / Stop / Continue',
      system: true,
      columns: [
        { key: 'START', label: 'Commencer', color: '#2E7D32', description: null, icon: null },
        { key: 'STOP', label: 'Arrêter', color: '#C62828', description: null, icon: null },
        { key: 'CONTINUE', label: 'Continuer', color: '#1565C0', description: null, icon: null },
      ],
    },
  ],
};

test.describe('Retrospective session room — happy path (US20.1.2a)', () => {
  test('joins the session, loads real columns from the format catalogue, and reflects the live STOMP status', async ({
    page,
  }) => {
    await page.route(SESSION_ENDPOINT, async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: SESSION_ID,
          title: 'Sprint 8 Retro',
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
    await page.route(FORMATS_ENDPOINT, async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FORMATS_RESPONSE) });
    });
    await page.route(PARTICIPANTS_ENDPOINT, async (route: Route) => {
      expect(route.request().method()).toBe('POST');
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          accessToken: 'e2e-access-token',
          ttlSeconds: 3600,
          facilitator: true,
          topicDestination: `/topic/agilite/retro/${SESSION_ID}`,
          facilitatorTopicDestination: `/topic/agilite/retro/${SESSION_ID}/facilitator`,
          submitDestination: `/app/agilite/retro/${SESSION_ID}/cards`,
          voteDestination: `/app/agilite/retro/${SESSION_ID}/votes`,
          voteUncastDestination: `/app/agilite/retro/${SESSION_ID}/votes/uncast`,
          voteBalanceDestination: `/app/agilite/retro/${SESSION_ID}/votes/balance`,
        }),
      });
    });

    await page.goto(`/retro/sessions/${SESSION_ID}`);

    // Real column labels from the (stubbed) format catalogue, not the local fallback.
    await expect(page.getByRole('heading', { name: 'Commencer' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Arrêter' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Continuer' })).toBeVisible();

    // Facilitator-only control visible (join response marked facilitator: true).
    await expect(page.getByRole('button', { name: /clôturer la contribution/i })).toBeVisible();

    // Real connection attempt against a non-listening backend: settles to the error state
    // rather than hanging in "connecting" — proves the status is live-bound, not hardcoded.
    await expect(page.getByText('Connexion au salon temps réel impossible.')).toBeVisible({ timeout: 15000 });

    // Submitting a card is still a no-throw, UI-clearing action even without a live connection.
    const startColumnTextarea = page.locator('#card-input-START');
    await startColumnTextarea.fill('Great sprint pace');
    await page.getByRole('button', { name: 'Proposer' }).first().click();
    await expect(startColumnTextarea).toHaveValue('');
  });
});

test.describe('Retrospective session room — vote phase (US20.1.2b)', () => {
  const REVEAL_ENDPOINT = `**/api/agilite/retro/sessions/${SESSION_ID}/reveal`;
  const VOTE_OPEN_ENDPOINT = `**/api/agilite/retro/sessions/${SESSION_ID}/vote/open`;
  const VOTE_CLOSE_ENDPOINT = `**/api/agilite/retro/sessions/${SESSION_ID}/vote/close`;

  test('facilitator reveals, opens the vote, sees vote controls, then closes the vote', async ({ page }) => {
    await page.route(SESSION_ENDPOINT, async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: SESSION_ID,
          title: 'Sprint 8 Retro',
          format: 'START_STOP_CONTINUE',
          teamId: 42,
          facilitatorUserId: 7,
          joinCode: 'A3F9K2',
          currentPhase: 'REVUE',
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
    await page.route(FORMATS_ENDPOINT, async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FORMATS_RESPONSE) });
    });
    await page.route(PARTICIPANTS_ENDPOINT, async (route: Route) => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          accessToken: 'e2e-access-token',
          ttlSeconds: 3600,
          facilitator: true,
          topicDestination: `/topic/agilite/retro/${SESSION_ID}`,
          facilitatorTopicDestination: `/topic/agilite/retro/${SESSION_ID}/facilitator`,
          submitDestination: `/app/agilite/retro/${SESSION_ID}/cards`,
          voteDestination: `/app/agilite/retro/${SESSION_ID}/votes`,
          voteUncastDestination: `/app/agilite/retro/${SESSION_ID}/votes/uncast`,
          voteBalanceDestination: `/app/agilite/retro/${SESSION_ID}/votes/balance`,
        }),
      });
    });
    await page.route(REVEAL_ENDPOINT, async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sessionId: SESSION_ID,
          cardCount: 1,
          columns: { START: [{ id: 'card-1', content: 'Great sprint pace' }] },
        }),
      });
    });
    await page.route(VOTE_OPEN_ENDPOINT, async (route: Route) => {
      expect(route.request().method()).toBe('POST');
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ currentPhase: 'VOTE' }) });
    });
    await page.route(VOTE_CLOSE_ENDPOINT, async (route: Route) => {
      expect(route.request().method()).toBe('POST');
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ currentPhase: 'ACTION' }) });
    });

    await page.goto(`/retro/sessions/${SESSION_ID}`);

    // Session already in REVUE — the reveal control is offered, the vote controls are not yet.
    await expect(page.getByRole('button', { name: 'Révéler les cards' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ouvrir le vote' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Révéler les cards' }).click();
    await expect(page.getByText('Great sprint pace')).toBeVisible();

    // Only once cards are revealed does the facilitator get the "open vote" control.
    await expect(page.getByRole('button', { name: 'Ouvrir le vote' })).toBeVisible();
    await page.getByRole('button', { name: 'Ouvrir le vote' }).click();

    await expect(page.getByText('Phase : Vote')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Clôturer le vote' })).toBeVisible();

    // Cast control is rendered but disabled — the WS never connects in this environment (no
    // backend listening), so no VOTE_BALANCE ever arrives and votesRemaining stays unknown; the
    // control correctly refuses to let the caller vote against an unknown balance.
    const castButton = page.locator('.session-room__vote-button').first();
    await expect(castButton).toBeVisible();
    await expect(castButton).toBeDisabled();

    await page.getByRole('button', { name: 'Clôturer le vote' }).click();
    await expect(page.getByText('Phase : Action')).toBeVisible();
  });
});

test.describe('Retrospective session room — critical error case', () => {
  test('shows a dedicated message for an unknown session (404), without ever attempting the WS connection', async ({
    page,
  }) => {
    await page.route(SESSION_ENDPOINT, async (route: Route) => {
      await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ status: 401 }) });
    });
    await page.route(PARTICIPANTS_ENDPOINT, async (route: Route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ type: 'about:blank', title: 'Not Found', status: 404 }),
      });
    });

    await page.goto(`/retro/sessions/${SESSION_ID}`);

    await expect(page.getByRole('alert').getByText('Session introuvable.')).toBeVisible();
    await expect(page.getByText('Connexion au salon temps réel')).toHaveCount(0);
  });
});

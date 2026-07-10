import { test, expect, Route } from '@playwright/test';

/**
 * E2E coverage for anonymous ("no account") planning poker room participation (US09.3.1,
 * `JoinRoomComponent`'s anonymous mode, route `/scrum-poker/rooms/join`).
 *
 * Same CI capability constraint already documented in `join-room.e2e.spec.ts`: the HTTP join
 * call is stubbed at the network level via `page.route`, and the STOMP/WebSocket leg is left to
 * attempt a real (failing, in this environment) connection — genuinely exercising the
 * connect→subscribe→status pipeline, not a canned UI value.
 */

const JOIN_ANONYMOUS_ENDPOINT = '**/api/agilite/poker/rooms/join-anonymous';

test.describe('Join planning poker room anonymously — happy path (US09.3.1)', () => {
  test('joins with no account, no pseudonym supplied, and reflects the live STOMP status', async ({ page }) => {
    await page.route(JOIN_ANONYMOUS_ENDPOINT, async (route: Route) => {
      expect(route.request().method()).toBe('POST');
      const body = route.request().postDataJSON() as { code: string; pseudonym?: string };
      expect(body.code).toBe('K7M2XQ');
      expect(body.pseudonym).toBeUndefined();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          roomId: '11111111-1111-1111-1111-111111111111',
          name: 'Sprint 8 estimation',
          sequence: 'FIBONACCI',
          cardValues: ['0', '1', '2', '3', '5', '8', '13', '21', '34', '55', '89', '?'],
          active: true,
          expiresAt: '2026-07-11T00:00:00Z',
          wsTopic: '/topic/agilite/poker/11111111-1111-1111-1111-111111111111',
          accessToken: 'e2e-guest-access-token',
          sessionId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          pseudonym: 'Invité-A1B2',
          guestSessionExpiresAt: '2026-07-10T12:00:00Z',
        }),
      });
    });

    await page.goto('/scrum-poker/rooms/join');
    await page.getByRole('button', { name: 'Rejoindre sans compte' }).click();

    // Lowercase on purpose — same client-side uppercasing AC as the authenticated join.
    await page.getByLabel('Code de la room').fill('k7m2xq');
    await page.getByRole('button', { name: 'Rejoindre anonymement' }).click();

    await expect(page.getByText('Room rejointe avec succès.')).toBeVisible();
    await expect(page.getByText('Sprint 8 estimation')).toBeVisible();
    await expect(page.getByText('Invité-A1B2')).toBeVisible();

    await expect(page.getByText('Connexion au salon temps réel impossible.')).toBeVisible({
      timeout: 15000,
    });
  });
});

test.describe('Join planning poker room anonymously — critical error case', () => {
  test('shows a dedicated message for an unknown or expired code (404), without leaking a raw backend message', async ({
    page,
  }) => {
    await page.route(JOIN_ANONYMOUS_ENDPOINT, async (route: Route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ type: 'about:blank', title: 'Not Found', status: 404 }),
      });
    });

    await page.goto('/scrum-poker/rooms/join');
    await page.getByRole('button', { name: 'Rejoindre sans compte' }).click();

    await page.getByLabel('Code de la room').fill('ZZZZZZ');
    await page.getByRole('button', { name: 'Rejoindre anonymement' }).click();

    await expect(page.getByRole('alert').getByText('Code introuvable ou expiré.')).toBeVisible();
    // No room was joined — the form stays on screen, no STOMP connection attempted.
    await expect(page.getByText('Room rejointe avec succès.')).toHaveCount(0);
  });
});

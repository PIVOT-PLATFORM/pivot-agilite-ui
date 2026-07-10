import { test, expect, Route } from '@playwright/test';

/**
 * E2E coverage for the "join a planning poker room by code" form (US09.1.2,
 * `JoinRoomComponent`, route `/scrum-poker/rooms/join`).
 *
 * Same CI capability constraint already documented in `retro-create-session.e2e.spec.ts`:
 * `pivot-agilite-core` has no published image consumable by this repo's `e2e.yml` yet, so the
 * HTTP join call is stubbed at the network level via `page.route` rather than hitting a real
 * backend.
 *
 * The STOMP/WebSocket leg is deliberately **not** mocked at the protocol level (no fake
 * `CONNECTED` frame via `page.routeWebSocket`) — that would only prove this spec's own stub
 * behaves, not this component. Instead, the real `RxStomp` client is left to attempt a real
 * connection to `ws://localhost:8082/ws/agilite`; with no backend listening in this
 * environment, the browser's native WebSocket fails to connect and `RoomWsService` reactively
 * settles to `'error'` — genuinely exercising the connect→subscribe→status pipeline end to end,
 * not a canned UI value. (`RoomWsService`'s unit spec already covers the `'connected'` case
 * with a mocked `RxStomp`.)
 */

const JOIN_ROOM_ENDPOINT = '**/api/agilite/poker/rooms/join';

test.describe('Join planning poker room — happy path (US09.1.2)', () => {
  test('submits a code, joins the room, and reflects the live STOMP connection status', async ({ page }) => {
    await page.route(JOIN_ROOM_ENDPOINT, async (route: Route) => {
      expect(route.request().method()).toBe('POST');
      expect(route.request().postDataJSON()).toEqual({ code: 'K7M2XQ' });
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
          accessToken: 'e2e-access-token',
        }),
      });
    });

    await page.goto('/scrum-poker/rooms/join');

    // Lowercase on purpose — the AC requires client-side uppercasing before the request.
    await page.getByLabel('Code de la room').fill('k7m2xq');
    await page.getByRole('button', { name: 'Rejoindre la room' }).click();

    await expect(page.getByText('Room rejointe avec succès.')).toBeVisible();
    await expect(page.getByText('Sprint 8 estimation')).toBeVisible();

    // Real connection attempt against a non-listening backend: settles to the error state
    // rather than hanging in "connecting" — proves the status is live-bound, not hardcoded.
    await expect(page.getByText('Connexion au salon temps réel impossible.')).toBeVisible({
      timeout: 15000,
    });
  });
});

test.describe('Join planning poker room — critical error case', () => {
  test('shows a dedicated message for an unknown or expired code (404), without leaking a raw backend message', async ({
    page,
  }) => {
    await page.route(JOIN_ROOM_ENDPOINT, async (route: Route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ type: 'about:blank', title: 'Not Found', status: 404 }),
      });
    });

    await page.goto('/scrum-poker/rooms/join');

    await page.getByLabel('Code de la room').fill('ZZZZZZ');
    await page.getByRole('button', { name: 'Rejoindre la room' }).click();

    await expect(page.getByRole('alert').getByText('Code introuvable ou expiré.')).toBeVisible();
    // No room was joined — the form stays on screen, no STOMP connection attempted.
    await expect(page.getByText('Room rejointe avec succès.')).toHaveCount(0);
  });
});

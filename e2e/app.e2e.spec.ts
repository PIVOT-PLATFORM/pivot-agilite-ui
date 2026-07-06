import { test, expect } from '@playwright/test';

test('la page racine se charge et affiche le titre placeholder', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'PIVOT Agilité' })).toBeVisible();
});

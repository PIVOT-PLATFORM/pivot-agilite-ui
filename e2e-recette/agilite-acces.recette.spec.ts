/**
 * Specs d'acceptation RECETTE — module Agilité intégré au shell pivot-ui.
 *
 * Jouées contre https://recette.pivot-platform.fr APRÈS déploiement (e2e-recette.yml).
 * Session déjà authentifiée par recette.setup.ts (compte de recette dédié) — aucun mock :
 * vrai shell, vrai backend pivot-agilite-core, vraies données sur le tenant de test.
 *
 * Contrat d'intégration (source de vérité) :
 *   - Le shell pivot-ui monte `AGILITE_ROUTES` sous le chemin gardé `/agilite`
 *     (`moduleGuard('agilite')`, cf. pivot-ui/src/app/app.routes.ts, EN18). Ici on cible donc
 *     les URL RÉELLES du shell (`/agilite`, `/agilite/scrum-poker/rooms/join`), jamais la racine
 *     `''` du harness de dev standalone (nginx :8090) qui n'existe pas sur la recette déployée.
 *   - La landing du module est le hub agrégé (`AgiliteHubComponent`) : `<h1>` = « Agilité »
 *     (clé Transloco `hub.title`) + onglets Daily / Roue d'équipe / Capacity.
 *
 * Règle de traçabilité (skill-ac-traceability) : chaque test porte l'identifiant de l'AC qu'il
 * valide, comme les specs éphémères de e2e/ — mais ici la preuve vaut sur l'infra réelle. Un
 * « vrai PO » vérifierait exactement ces parcours sur le site déployé.
 *
 * Ces cas sont NON DESTRUCTIFS (login + navigation + affichage). Les AC qui ÉCRIVENT (créer une
 * roue US14.x, une session de rétro US20.x, une room de scrum poker US09.x) suivent le même
 * patron mais créent leurs données sur le tenant de test dédié (RECETTE_E2E_TENANT) et les
 * nettoient en `afterEach` — à ajouter au fur et à mesure que chaque US destructive est validée
 * en recette (cf. specs mockées correspondantes dans e2e/).
 */
import { test, expect } from '@playwright/test';

test.describe('Recette — accès au module Agilité (compte authentifié)', () => {
  test('AC-AGILITE-01 : la landing du module Agilité s’affiche sous /agilite après login', async ({
    page,
  }) => {
    // Chemin réel du shell (route gardée moduleGuard('agilite')), pas la racine du harness dev.
    await page.goto('/agilite');
    await expect(page).toHaveURL(/\/agilite/);

    // Marqueur observable du hub chargé : le titre du module (h1 = « Agilité », clé hub.title).
    await expect(page.getByRole('heading', { level: 1, name: /agilit/i })).toBeVisible({
      timeout: 15_000,
    });

    // Les onglets du hub (tablist Daily / Roue d'équipe / Capacity) confirment que le vrai
    // AgiliteHubComponent est rendu, pas une page de fallback ou un module désactivé.
    await expect(page.getByRole('tab').first()).toBeVisible();
  });

  test('AC-AGILITE-02 : la navigation vers « Rejoindre une room » (scrum poker) affiche le formulaire réel', async ({
    page,
  }) => {
    // Sous-feature réelle adossée au backend (US09.1.2, route AGILITE_ROUTES
    // `scrum-poker/rooms/join`, montée par le shell sous /agilite). Non destructif : on
    // s'arrête à l'affichage du formulaire, aucune soumission — pas de room créée/rejointe.
    await page.goto('/agilite/scrum-poker/rooms/join');
    await expect(page).toHaveURL(/\/agilite\/scrum-poker\/rooms\/join/);

    // Le champ code + le bouton de soumission sont les marqueurs observables du JoinRoomComponent
    // servi par le shell intégré sur l'infra réelle.
    await expect(page.getByLabel(/code de la room/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /rejoindre la room/i })).toBeVisible();
  });
});

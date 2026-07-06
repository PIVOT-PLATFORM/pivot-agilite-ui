# TODO — Setup humain requis avant branch protection stricte

Ce repo vient d'être bootstrappé (skeleton Angular + CI/CD + sécurité). La branch protection
actuelle sur `main` est volontairement **minimale** : elle ne requiert que les checks qui peuvent
réellement passer sans configuration supplémentaire. Voici ce qui manque avant d'aligner ce repo
sur le niveau de protection strict de `pivot-ui` (ruleset `protect-main` complet, 13 checks
requis).

## 1. Créer le projet SonarCloud

- Clé de projet attendue (déjà dans `sonar-project.properties`) : `PIVOT-PLATFORM_pivot-agilite-ui`
- Organisation SonarCloud : `pivot-platform`
- `SONAR_TOKEN` est **déjà disponible** en secret GitHub Actions au niveau de l'organisation
  `PIVOT-PLATFORM` (vérifié : visible par ce repo via
  `gh api repos/PIVOT-PLATFORM/pivot-agilite-ui/actions/organization-secrets`) — **aucune action
  secret requise**, seule la création du projet côté sonarcloud.io est nécessaire.
- Une fois le projet créé et un premier run vert sur `main`, "SonarCloud Analysis" et
  "SonarCloud Code Analysis" peuvent être ajoutés aux checks requis.

## 2. Secrets déjà disponibles (organisation) — aucune action requise

Vérifié identique sur `pivot-core`/`pivot-ui`/`pivot-agilite-core`/`pivot-agilite-ui` :
`GITLEAKS_LICENCE_KEY`, `PLUMBER_TOKEN`, `SEMANTIC_RELEASE_TOKEN`, `SONAR_TOKEN`. Ces 4 secrets
sont au niveau organisation et automatiquement hérités par tout nouveau repo — rien à faire ici.

## 3. Secrets optionnels, non bloquants

- `SEMGREP_APP_TOKEN` : n'existe **nulle part** actuellement (ni org, ni repo, y compris sur
  pivot-core/pivot-ui). Le job "Semgrep - SAST" tourne quand même (règles publiques en local,
  sans token) — ce secret ne fait qu'activer l'intégration au dashboard Semgrep AppSec. Optionnel.
- `PLUMBER_METADATA_TOKEN` : absent également (ni org ni repo) — `security.yml` référence ce nom
  alors que le secret organisation réellement présent s'appelle `PLUMBER_TOKEN`. À vérifier : si
  le job "Plumber - CI/CD Compliance" dégrade proprement sans lui (comme sur pivot-agilite-core)
  ou échoue franchement — ne pas le rendre required avant d'avoir vu un run vert.
- `PIVOT_PROD_URL` (utilisé uniquement par `dast-baseline.yml`, scan DAST contre une URL de prod
  déployée) : non pertinent tant que ce module n'est pas réellement déployé — pas un blocant de
  bootstrap.

## 4. Gap `@pivot/ui-core` / `@pivot/design-system` — non consommables actuellement

Ce module devrait à terme dépendre de `@pivot/ui-core` (AuthService, AuthGuard, ModuleGuard,
Header/Footer) et de `@pivot/design-system` (composants visuels Angular CDK + SCSS BEM). Vérifié
au bootstrap (2026-07) via le CLAUDE.md de pivot-ui et `pivot-docs/docs/architecture/platform-overview.md` :

- `@pivot/ui-core` — pas encore publié comme artefact npm consommable (gap backlog `EN17.3`).
- `@pivot/design-system` — repo pas encore créé (`pivot-design-system`, Enabler `EN17.2`,
  `Stage: Backlog`) ; stack actée par `ADR-007` (Angular CDK + SCSS BEM custom, aucune lib
  visuelle tierce) mais rien de consommable aujourd'hui.

Ce module ne déclare donc aucune dépendance vers ces deux packages pour l'instant (voir
`package.json` et `CLAUDE.md`). Le style provisoire vit dans `src/styles.scss` en attendant
`@pivot/design-system`.

## 5. Une fois 1–4 réglés : passer à la branch protection stricte

Remplacer la branch protection classique actuelle (contexts limités à "Code Quality - Angular",
"Tests (Vitest)", "Build Angular (production)") et étendre le ruleset `protect-main` (ou en créer
un second) avec ces 13 checks requis, à l'identique de pivot-ui :

- Code Quality - Angular
- Tests (Vitest)
- Build Angular (production)
- SCA - Dependency Audit
- E2E - Playwright
- SonarCloud Analysis
- SonarCloud Code Analysis
- Gitleaks - Secret Scan
- CodeQL - SAST
- Semgrep - SAST
- Plumber - CI/CD Compliance
- Lighthouse — Accessibilité
- Docker preview image (PR)

Référence exacte : `gh api repos/PIVOT-PLATFORM/pivot-ui/rulesets/17930084`.

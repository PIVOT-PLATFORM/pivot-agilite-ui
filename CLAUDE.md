# CLAUDE.md — PIVOT-AGILITE-UI

## Projet

**PIVOT-AGILITE-UI** — frontend Angular du domaine **Agilité** de la suite collaborative PIVOT :
capacity planning, daily standup timer, scrum poker.

Module lazy-loadé, intégré dans le shell **pivot-ui** (routing, header/footer, auth OIDC/opaque
tokens). Ce repo ne contient **aucun code de shell** (pas de login, pas d'admin, pas de header) —
uniquement les features métier du domaine Agilité et leur intégration au shell via
`@pivot/ui-core`.

**Dépendances npm partagées :**
- `@pivot/ui-core` (GitHub Packages) — `AuthService`, `AuthInterceptor`, `AuthGuard`,
  `TenantService`, `HeaderComponent`/`FooterComponent`, `ModuleGuard`, `ModuleStatusService`.
  **Non consommé aujourd'hui** — absent de `package.json` : le repo/package n'est pas encore
  publié comme artefact consommable (gap backlog `EN17.3`, voir `pivot-docs/docs/architecture/platform-overview.md`
  section "Gaps — Enablers backlog"). Ce squelette de bootstrap n'a donc **aucune dépendance
  factice** ajoutée — à câbler dès que le package existe réellement.
- `@pivot/design-system` (GitHub Packages) — composants visuels partagés (Angular CDK + SCSS BEM
  custom, cf. `ADR-007`). **Repo pas encore créé** (`pivot-design-system`, Enabler `EN17.2`,
  `Stage: Backlog`) — même traitement honnête : pas de dépendance factice.

**Backend associé :** **pivot-agilite-core** (Java/Spring Boot, port `:8082` en dev, schéma
Flyway `agilite`) — API REST `/api/agilite/**` et WebSocket `/ws/agilite/**` (nginx route par
préfixe, voir `pivot-docs/docs/architecture/platform-overview.md`).

**Vision :** interface réactive, accessible (WCAG 2.1 AA), activable/désactivable par tenant —
sans lock-in SaaS, cohérente avec le reste de la suite PIVOT.

---

## Communication

Concise et directe. Techniquement précise. Pas de récapitulatifs inutiles.

**Exceptions (réponses complètes et structurées) :**
- Rédaction ou revue d'US / Epics
- Décisions d'architecture (routing du module, state management, intégration `@pivot/ui-core`)
- Avis cybersécurité ou actions irréversibles — **confirmation obligatoire**
- Backlog et critères d'acceptation

---

## Stack technique

| Couche | Technologie |
|--------|-------------|
| Framework | Angular 22 · TypeScript strict |
| Styles | SCSS · BEM · tokens CSS (migration vers `@pivot/design-system` dès disponible) |
| HTTP | Angular HttpClient · RxJS |
| State | Signals Angular · NgRx si complexité croissante (capacity planning multi-ressources) |
| Auth | Déléguée à `@pivot/ui-core` (pivot-ui shell) — ce repo ne gère aucun flux OIDC/token propre |
| Temps réel | WebSocket STOMP — `@stomp/rx-stomp` (scrum poker, standup timer synchronisés) |
| Tests unitaires | Vitest |
| Tests E2E | Playwright (Chromium) |
| i18n | Transloco — tous libellés externalisés, jamais de chaîne littérale dans les templates |
| Build | Angular CLI · esbuild |
| CI/CD | GitHub Actions · SonarCloud · Semantic Release · Plumber |
| Déploiement | Docker (nginx) |
| Backend | → **pivot-agilite-core** (Java 25 · Spring Boot 4.x · port 8082 · schéma `agilite`) |
| Shell / auth | → **pivot-ui** (`@pivot/ui-core`) |

---

## Structure du dépôt

```
pivot-agilite-ui/
├── src/
│   ├── app/
│   │   ├── core/              # Intégration locale (i18n loader, etc.) — pas de shell ici
│   │   ├── features/          # Features métier : capacity planning, standup, scrum poker
│   │   └── app.*.ts
│   ├── assets/i18n/            # fr.json / en.json — Transloco
│   ├── environments/
│   └── styles.scss             # Provisoire — migre vers @pivot/design-system (EN17.2)
├── e2e/
├── .github/
│   └── workflows/
├── .plumber.yaml
└── Dockerfile                   # nginx production
```

**Squelette actuel (bootstrap) :** une seule route placeholder (`features/home`) — aucune feature
capacity planning / standup / scrum poker encore implémentée. Le développement des features
suit le backlog `pivot-docs` (US tracées), pas ce bootstrap.

Shell, auth, header/footer, admin → **pivot-ui**. Backend → **pivot-agilite-core**.
Documentation → **pivot-docs**.

---

## Équipe experte

Toute contribution mobilise les experts concernés — les mentionner explicitement dans la réponse.

| Expert | Domaine |
|--------|---------|
| **Architecte Angular** | Architecture du module lazy-loadé, RxJS, Signals, OnPush |
| **Expert UX/UI** | Ergonomie capacity planning / standup timer / scrum poker, accessibilité WCAG 2.1 AA, tokens CSS |
| **Expert DevSecOps** | CI/CD GitHub Actions, SonarCloud, Semgrep, Gitleaks, Plumber, SBOM |
| **Expert Red Team** | XSS, exposition de données d'estimation (scrum poker) avant révélation, CSRF |
| **Expert Blue Team** | CSP, SRI, headers sécurité nginx, réponse aux rapports Red Team |
| **Expert OIDC / IAM** | Coordination avec `@pivot/ui-core` (auth déléguée) — pas de logique OIDC propre à ce repo |
| **Expert QA** | Stratégie Vitest/Playwright, coverage ≥ 85 %, A11y tests, tests de synchronisation temps réel (standup/scrum poker) |
| **Expert RGPD** | Données d'équipe (capacity, disponibilités) — conformité RGPD/CNIL |
| **Product Owner** | Backlog markdown `pivot-docs`, Epics, US, critères d'acceptation |
| **Scrum Master** | Coordination, sprints, impediments, backlog consistency |
| **Architecte Modules** | Contrat de lazy-loading avec pivot-ui, guards d'activation par tenant |
| **Expert PR Review** | Relecture croisée neutre : architecture Angular, lisibilité, dette technique, respect des standards PIVOT |
| **Experts Backend / WebSocket STOMP** | → **pivot-agilite-core** |
| **Experts shell / auth / design system** | → **pivot-ui** / **pivot-design-system** |

### Faire appel aux experts

| Type de tâche | Expert(s) |
|---------------|-----------|
| Composant Angular, SCSS, routing du module | **Architecte Angular** + **Expert UX/UI** |
| Guards, lazy-loading, activation module | **Architecte Angular** + **Architecte Modules** |
| WebSocket STOMP (standup timer, scrum poker temps réel) | **Architecte Angular** + **Expert QA** |
| Tests Vitest, Playwright, coverage | **Expert QA** |
| CI/CD, GitHub Actions, Plumber | **Expert DevSecOps** |
| Vulnérabilité sécurité frontend | **Expert Red Team** → **Expert Blue Team** |
| RGPD, données d'équipe/capacity | **Expert RGPD** |
| Backlog, US, acceptance criteria | **Product Owner** |
| API REST backend agilité, schéma `agilite` | → **pivot-agilite-core** |
| Auth, shell, header/footer | → **pivot-ui** |
| Bug inexpliqué | **Architecte Angular** en premier, puis **Expert Red Team** si suspicion sécurité |

**Règles :**
- Mentionner l'expert explicitement quand son domaine est engagé.
- Toute faille Red Team = correction Blue Team **avant** tout merge.
- Changement du contrat de module (activation, routes exposées à pivot-ui) = coordination avec
  **pivot-ui** obligatoire.

---

## Backlog — fichiers markdown

> **Sources de vérité :**
> - Hiérarchie backlog + conventions : `pivot-docs/docs/backlog/README.md`
> - Sprints, assignation US, état avancement : **`pivot-docs/docs/backlog/sprints/`** (un fichier par sprint, index dans `sprints/README.md`)
> - **Backlog opérationnel :** fichiers markdown dans `pivot-docs/docs/backlog/` — un fichier par US/Enabler avec frontmatter (`Stage`, `Priority`, `Phase`, `Module: agilite`).

### Hiérarchie
`EPIC → FEATURE (valeur) / ENABLER (technique) → US` · clé `E01 → F01.1 / EN01.1 → US01.1.1`.

### Champs du Project

| Champ | Valeurs |
|-------|---------|
| Item Type | Epic / Feature / Enabler / US |
| Parent | clé du parent (ex. `E01`, `F01.1`) |
| Stage | Backlog / Ready / In progress / Review / Done |
| Priority | Critical / High / Medium / Low |
| Module | core / auth / admin / oidc / pilotage / agilite / collaboratif |
| Phase | Socle / v1-enterprise / phase-3 |
| Sprint | Sprint 1…N |
| Size | XS / S / M / L / XL |

### Template US, Definition of Ready, vagues → `pivot-docs/docs/backlog/README.md`.

---

## Breaking Points

### Step 0 — Challenge PO avant implémentation

Avant tout code, le **PO Agent** challenge les ACs de l'US :

1. Vérifier DoR — story complète, ACs Given/When/Then, AC erreur + sécurité
2. Calculer Gate 1 : **≥ 70** → procéder · **< 70** → PO Agent réécrit ACs → recalculer
3. AC ambigus à l'implémentation → PO Agent clarifie, jamais d'interprétation unilatérale

Pas de blocage humain — Claude autonome de A à Z sur la validation des ACs.

### Breaking Point 2 : Gate 4 MERGE < 60 ou hard block

Tout PR avec :
- Label `security` ou `breaking-change`
- Gitleaks secret détecté
- Modification du contrat de module (routes exposées, guard d'activation) sans coordination pivot-ui
- Modification touchant l'intégration `@pivot/ui-core` une fois le package consommé

→ Label `needs-human-review` + score breakdown + attendre le mainteneur.

---

## Workflow — Organisation par sprint

Travail organisé par sprint. Référence : **`pivot-docs/docs/backlog/sprints/`** (un fichier par sprint).

**Principes :**
- **Une branche par US / Enabler** — `feat/{us-id}-{slug}`
- **Agents en parallèle** — un agent par item du sprint, branches séparées
- **Backlog pivot-docs** — mises à jour `Stage` dans le frontmatter US + `sprints/sprint-{N}.md`, committés sur la branche de l'US

## Workflow — Autoloop PR

Après toute modification sur une branche de travail — **sans exception** :

1. Ouvrir une PR (draft) vers `main`
2. **Autoloop** (20 itérations max) :
   - **En parallèle :**
     - **Review neutre** — Expert PR Review : architecture, AC, sécurité, dette, a11y, i18n
     - **CI** — `npx tsc --noEmit` + `npm run lint` + `npm run test:ci` + build prod = 0 erreur/warning
   - **Corrections** — tous les findings résolus, commit `fix({scope}): ...`
   - **Convergence** — Gate 4 ≥ 85 ET CI verte → sortir
3. Gate 4 = 100/100 (ou convergence confirmée sans finding restant) :
   - Sortir la PR du mode draft (`gh pr ready`)
   - `Stage: Review` dans frontmatter US + `sprints/sprint-{N}.md` (branche/PR dédiée `pivot-docs`)
   - **Gate 5** — générer/mettre à jour la spec fonctionnelle et technique figée `pivot-docs/docs/specs/{EPIC}/{us-id}-{slug}.md` (branche/PR `pivot-docs` dédiée — jamais de commit cross-repo)
   - Signal mainteneur
4. Blocage 20 boucles → Breaking Point 2

## Workflow — Ordre d'exécution par US (dans un sprint)

| Étape | Contenu |
|-------|---------|
| **1. Code** | Composants Angular + TSDoc · Services · Guards |
| **2. Tests** | Vitest TU composants + services — **dans le même commit** |
| **3. Qualité** | ESLint · TypeScript strict verts |
| **4. UI / i18n / A11y** | Composants Angular, styles, tokens, ARIA |
| **5. Gate 2** | Coverage check : ≥ 85 % → continuer · 70–84 % → compléter · < 70 % → stop |
| **6. Backlog** | Mise à jour `sprints/sprint-{N}.md` + statut US **obligatoire avant commit** |
| **7. E2E** | Spec Playwright (happy path + 1 erreur critique) |
| **8. Commit** | `git add` fichier par fichier · commits atomiques sur branche `feat/{us-id}-{slug}` |

> **E2E différable** si environnement indisponible. Étapes 6 et 8 non différables.

### Approche tests

Écrire le code d'abord, puis les tests couvrant toutes les branches et conditions limites. TDD strict non utilisé.

**Exception :** quand le contrat d'un service ou d'un guard est flou (ex. synchronisation temps
réel scrum poker) — écrire les tests en premier pour forcer la clarification.

---

## Workflow — Vérifications avant push autonome

**Condition absolue avant tout push autonome : 0 erreur, 0 warning.**

```bash
npx tsc --noEmit                              # TypeScript strict (0 erreur)
npm run lint                                  # ESLint (0 warning)
npm run test:ci                               # Vitest coverage
npm run build -- --configuration production   # Build prod (doit réussir)
```

Rapporter ✅ ou stderr complet. Toute erreur ou warning non justifié = **stop, corriger avant push**.

---

## Workflow — Branches

| Préfixe | Usage | Exemple |
|---------|-------|---------|
| `feat/{us-id}-{slug}` | Implémentation d'une US | `feat/us33-1-1-scrum-poker-vote` |
| `feat/{en-id}-{slug}` | Implémentation d'un Enabler | `feat/en33-1-websocket-standup` |
| `fix/{id}-{slug}` | Correction bug hors sprint | `fix/12-standup-timer-drift` |
| `refactor/{id}-{slug}` | Refactoring hors sprint | `refactor/18-capacity-signals` |
| `chore/{slug}` | CI, deps, config | `chore/eslint-config` |
| `docs/{slug}` | Documentation hors sprint | `docs/adr-realtime-sync` |

**Règles :**
- Jamais de travail direct sur `main`
- **Une branche = un item de sprint** (US ou Enabler)
- **Backlog pivot-docs committé sur la branche de l'US**
- Rebase avant merge → squash WIP
- `git push --force-with-lease` uniquement sur branches de travail

**Création de branche US — procédure obligatoire :**
```bash
git checkout main
git pull origin main
git checkout -b feat/{us-id}-{slug}
```
Branche existante → `git checkout feat/{us-id}-{slug}` directement.

---

## Workflow — Commits

Format **Conventional Commits** (`type(scope): message`) — alimente Semantic Release pour le versioning automatique.

| Commit | Contenu typique |
|--------|----------------|
| `feat(capacity):` | capacity planning |
| `feat(standup):` | daily standup timer |
| `feat(scrum-poker):` | scrum poker |
| `fix(capacity)` / `fix(standup)` / `fix(scrum-poker)` | correction bug feature |
| `feat(modules):` | lazy-loading, guard d'activation, intégration pivot-ui |
| `fix(modules):` | correction bug intégration module |
| `feat(ws):` | WebSocket STOMP (standup/scrum poker temps réel) |
| `fix(ws):` | correction bug WebSocket / STOMP |
| `test:` | ajout ou correction de tests sans changement de code prod |
| `feat(a11y):` | accessibilité WCAG, attributs ARIA |
| `style(ui):` | SCSS, tokens CSS |
| `ci:` | GitHub Actions workflows, Plumber |
| `docs:` | README, CLAUDE.md, ADR |
| `security:` | correctif sécurité — **hard block Gate 4, review humaine** |

Co-author sur chaque commit : `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`

---

## Gates ACDD — Confidence Gates

Score 0–100, jamais booléen. Scores/décisions consignés en **commentaire de PR** (plus de
dossier `gates/`). Le statut vit dans le champ **Stage** du frontmatter US (pivot-docs).

| Gate | Moment | Seuils |
|------|--------|--------|
| **1 — READINESS** | Avant implémentation | PO Agent self-challenge · ≥ 70 → Stage: Ready → procéder · < 70 → PO Agent réécrit ACs |
| **2 — COVERAGE** | Par commit | ≥ 85 → continuer · 70–84 → compléter tests · < 70 → stop |
| **3 — QUALITY** | Après CI verte | Hard blocks : secret Gitleaks, label `security`/`breaking-change`, modif contrat module |
| **4 — MERGE CONFIDENCE** | Avant merge | ≥ 85 → merge autonome · 60–84 → merge documenté · < 60 → Breaking Point 2 |

**Checks Gate 1 :** AC testables (40) · dépendances résolues (20) · impact contrat module (15) · AC sécurité + A11y ≥ 1 chacun (15) · pas de cycle (10)

**Checks Gate 2 :** AC couverts (50) · pas de code non testé (30) · tests non triviaux (20)

**Checks Gate 3 :** SonarCloud ≥ 80 % (25) · zéro finding critique/high (25) · linters clean (20) · Gitleaks clean (20) · build Docker (10)

**Format du commentaire de PR (gate)** : `gate` (READINESS | COVERAGE | QUALITY | MERGE_CONFIDENCE), `score`, `decision`, `breakdown`, `notes`.

---

## Standards de code

### Angular (frontend)

- TypeScript strict — pas de `any`
- OnPush change detection par défaut (`ChangeDetectionStrategy.OnPush`)
- Signals Angular pour le state local — `signal()`, `computed()`, `effect()`
- RxJS pour l'asynchrone HTTP et WebSocket — pas de Promise sauf interop
- SCSS BEM + tokens centralisés — pas de styles inline
- WCAG 2.1 AA sur tous les éléments interactifs (ARIA, focus, contraste) — vigilance particulière
  sur le scrum poker (cartes de vote) et le standup timer (annonces temps/tour au lecteur d'écran)
- Pas de logique métier dans les composants — déléguer aux services
- `inject()` plutôt que constructeur pour les dépendances
- Routes lazy-loaded — jamais de barrel d'import massif
- TSDoc sur tous les services, guards et pipes publics
- i18n : **Transloco** — tous les libellés externalisés, jamais de chaîne littérale
- Garde fonctionnels (`CanActivateFn`) — jamais de classe `CanActivate`

### Général

- Pas de secrets dans le code — variables d'environnement
- **`// NOSONAR` : zéro, jamais.** Tout faux positif Sonar se marque côté SonarCloud — aucune exception.
- **`// nosemgrep` : interdit par défaut**, autorisé **uniquement avec la validation explicite du mainteneur**.

---

## Système de modules (côté Angular)

- Ce module (capacity/standup/scrum-poker) → feature module lazy-loadé (`loadChildren`), monté par pivot-ui
- Module désactivé côté tenant = route inaccessible (guard vérifie l'état via `@pivot/ui-core`) + aucun bundle chargé
- Aucune logique inter-module directe — communication via services `@pivot/ui-core` partagés
- Changement de contrat d'exposition à pivot-ui = **hard block Gate 4 + coordination pivot-ui obligatoire**

---

## Auth (déléguée)

Ce repo ne porte **aucune logique OIDC ou opaque token propre**. L'authentification est
entièrement gérée par `@pivot/ui-core` (pivot-ui shell) :

| Principe | Détail |
|----------|--------|
| Token | Jamais lu/stocké/parsé directement ici — consommer `AuthService`/`AuthInterceptor` de `@pivot/ui-core` une fois le package publié |
| Guards | `ModuleGuard` de `@pivot/ui-core` protège les routes de ce module |
| tenantId / userId | Jamais résolus côté Angular — le backend (`pivot-agilite-core`) extrait exclusivement du token porteur |

---

## Audits

Dans **pivot-docs** — un fichier par catégorie, mis à jour en place. **Jamais de fichiers datés.**

---

## Règles absolues

| Interdit | Raison |
|----------|--------|
| `--no-verify` | Contourne les hooks qualité |
| `git push origin main` (push direct) | Jamais — tout code passe par PR + review (exception unique : le bootstrap initial de ce repo, déjà effectué) |
| `git push --force` sur `main` | Jamais — le mainteneur uniquement si nécessaire |
| `git add .` en bloc | Risque d'inclure `.env`, clés, tokens |
| Merger avec label `security` sans revue humaine | Hard block Gate 4 |
| `any` TypeScript | Désactive la sécurité du typage |
| Logique métier dans les composants | Viole la séparation des couches |
| Module désactivé avec routes accessibles | Contournement restriction admin tenant |
| Implémenter sans US tracée dans les fichiers markdown backlog | Perte de traçabilité |
| Toute logique OIDC/token propre à ce repo | Auth exclusivement déléguée à `@pivot/ui-core` |
| `userId`/`tenantId` passé dans le body, query param ou header custom d'une requête Angular | Mass assignment / IDOR — identité extraite du token porteur par le backend |
| Commiter `.env`, tokens, secrets, certificats | Exposition définitive |
| Logique de filtrage tenant côté Angular (côté client) | Non-fiable — le backend est la seule autorité d'isolation |

---

## Boucles de problèmes — règle d'escalade

### Limite 10 commandes en échec successif

Si **10 commandes consécutives échouent** (toute combinaison : build, test, lint, push, CI) sur une tâche :
1. **Stopper la tâche courante** — ne pas impacter les agents parallèles sur d'autres US
2. **Poster un commentaire de gate** avec `decision: ESCALATED`, liste des 10 échecs, contexte
3. **Label `needs-human-review`** + signal mainteneur
4. **Proposer une alternative** (approche différente, découpage)

Le compteur se remet à zéro dès qu'une commande réussit.

### Limite 20 push — autoloop PR Review

Voir section **Workflow — Autoloop PR** — au-delà de 20 push correctifs → Breaking Point 2 automatique.

### Règle 2 tentatives (stratégie identique)

Après **2 tentatives** (même stratégie ou variantes proches) :
1. **Stopper** — ne pas continuer à boucler
2. **Poster un commentaire de gate sur la PR** avec `decision: ESCALATED`, contexte complet, tentatives effectuées — **jamais committer un fichier de gate**
3. **Signaler** au mainteneur : blocage, tentatives, raison de l'échec — label `needs-human-review`
4. **Proposer** une alternative : approche différente, outil différent, contournement

Ne jamais enchaîner plus de 2 tentatives sans informer le mainteneur.

---

## Parallélisation

Lancer un maximum d'actions en parallèle dans chaque message.

| Actions parallélisables | Exemples |
|------------------------|---------|
| Lectures indépendantes | Plusieurs `Read` / `Grep` / `Glob` |
| Linters | ESLint + TypeScript lancés simultanément |
| Créations de fichiers indépendants | Composant + service + spec Vitest |
| Recherches codebase | Plusieurs `Grep` sur cibles différentes |

Ne séquencer que ce qui dépend du résultat d'une étape précédente.

# Trainer4U 🏋️

**Your pocket fitness coach — client-side, no backend, no runtime libraries.**

[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Live Demo](https://img.shields.io/badge/live--demo-github--pages-blue.svg)](https://akshay473.github.io/Trainer4U/)

## Demo

**Live app:** https://akshay473.github.io/Trainer4U/

**Demo account:** `demo` / `demo1234` — four weeks of sample data.

## Features

| Feature | Description |
|---------|-------------|
| **Local accounts** | Multiple profiles per browser, random salts and SHA-256 password hashing through Web Crypto. Secure account creation requires HTTPS or localhost. |
| **Onboarding** | Age, sex, height, weight, target weight, goal, diet, allergies, injuries, equipment and training days. |
| **Dashboard** | Goal progress, today's plan, logging streak, key stats and coach's notes from the current profile. |
| **Trainer** | Weekly gym or home plans with injury-aware exercise filtering, sets/reps/rest and progressive-overload hints. |
| **Nutritionist** | Mifflin-St Jeor BMR/TDEE, reconciled calorie and macro targets, food diary and seven-day summary. |
| **Chef** | 60+ recipes with cuisine, diet, meal and allergy filters, plus ingredient matching and step-by-step cooking. |
| **Health check** | BMI, hydration, sleep, symptom notes, wellness guidance and safety warnings. |
| **Progress** | Weight, measurement and weekly workout charts with history tables. |
| **Course correction** | Notices missed workouts, calorie drift, wrong-way weight trends, low protein and poor sleep. |
| **Data controls** | Validated JSON export/import, log reset, profile deletion and light/dark themes. |
| **PWA and accessibility** | Offline app shell, valid install icons, labelled controls, keyboard-trapped modals and responsive layouts. |

## Formulas

**Mifflin-St Jeor BMR**

- Male: `10 × weight(kg) + 6.25 × height(cm) − 5 × age + 5`
- Female: `10 × weight(kg) + 6.25 × height(cm) − 5 × age − 161`

`TDEE = BMR × activity multiplier`

| Activity | Multiplier |
|---|---:|
| Sedentary | 1.2 |
| Light | 1.375 |
| Moderate | 1.55 |
| Active | 1.725 |
| Very active | 1.9 |

Calorie adjustments are `lose −500`, `gain +400`, `build +250`, and `maintain 0`. Protein is 2.0 g/kg for lose/build, 1.8 g/kg for gain and 1.6 g/kg for maintain, with safety bounds. Fat starts at 27% of calories and carbs fill the remainder. Minimum macro bounds are reconciled with the calorie target instead of displaying contradictory totals.

## Run locally

```sh
npm start
# open http://localhost:3000
```

No build step is required. The application, styles and runtime JavaScript live in `index.html`.

## Tests and lint

```sh
npm ci
npm test                 # pure logic, migration, import validation and security checks
npm run lint             # no-undef, no-const-assign and no-redeclare
npx playwright install chromium
npm run test:browser     # signup/onboarding, Chef, charts, import XSS, modals, axe, offline and mobile
```

CI runs all of these checks on pushes and pull requests. GitHub Pages publishes the static app separately; the workflow does not include a second competing deployment job.

## Project structure

```text
trainer4u/
├── index.html               # app shell, CSS and application JavaScript
├── icons/                   # valid 192 px and 512 px PNG install icons
├── manifest.webmanifest
├── sw.js                    # scoped, versioned offline cache
├── test.js                  # unit and data-validation tests
├── test.browser.js          # Playwright smoke, accessibility and offline tests
├── lint.js                  # lints the real inline application script
├── .eslintrc.json
├── .github/workflows/ci.yml
├── LICENSE
└── CONTRIBUTING.md
```

## Privacy and security

All profile and fitness data stays in this browser's `localStorage` under keys prefixed `trainer4u_`. Exports are downloaded only when requested. Imports are size-limited, schema-validated and rendered with escaping; a restrictive Content Security Policy blocks injected script execution.

Web Crypto is required for account passwords. There is no non-cryptographic fallback. Client-side hashing offers casual privacy on a shared device, **not real authentication or encryption**: anyone with access to the browser profile can read the fitness data, and a local hash cannot replace server-side account security. Use **Settings → Export** for backups.

## Medical disclaimer

Trainer4U provides general fitness and wellness information for healthy adults. It cannot diagnose or treat any condition. See a doctor, physiotherapist or registered dietitian for pain, injuries, medical conditions, pregnancy, eating-disorder history, medication interactions or extreme weight goals. Stop exercising and seek help for chest pain, faintness, severe shortness of breath or sharp joint pain.

## Roadmap

- [x] PWA offline support
- [x] Unit tests and browser smoke/accessibility checks
- [x] GitHub Actions CI
- [ ] Workout reminders (opt-in)
- [ ] Water and sleep quick-log widgets
- [ ] Printable weekly plan
- [ ] Unit toggle (kg/lb, cm/ft-in)
- [ ] Optional encrypted backups

## Feedback

Share suggestions, bugs or feature requests at https://forms.gle/5zySDBpFBDyY6dar8

# Trainer4U 🏋️

**Your pocket fitness coach — completely client-side, no backend, no libraries.**

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Live Demo](https://img.shields.io/badge/live--demo-github--pages-blue.svg)](https://akshay473.github.io/Trainer4U/)
[![GitHub Pages](https://img.shields.io/badge/deployed%20on-GitHub%20Pages-lightgrey.svg)](https://akshay473.github.io/Trainer4U/)
[![Vanilla JS](https://img.shields.io/badge/vanillaJS-yes-orange.svg)]()
[![PWA](https://img.shields.io/badge/PWA-enabled-brightgreen.svg)]()

---

## Demo login

**Live demo:** https://akshay473.github.io/Trainer4U/

**Demo account:** `demo` / `demo1234` — four weeks of sample data to explore immediately.

---

## Screenshots

![Dashboard](/docs/screenshots/dashboard.png)
![Trainer](/docs/screenshots/trainer.png)
![Nutritionist](/docs/screenshots/nutrition.png)
![Chef](/docs/screenshots/chef.png)
![Progress](/docs/screenshots/progress.png)

*Demo GIF placeholder — capture a short GIF of the dashboard interacting with the trainer, nutritionist, and chef sections.*

---

## Features

| Feature | Description |
|---------|-------------|
| **Local accounts** | Multiple profiles per browser, salted SHA-256 password hashing via Web Crypto API. All data stays in the browser. |
| **Onboarding** | Age, sex, height, weight, target weight, goal, diet, allergies, injuries, equipment, training days (1–7). |
| **Dashboard** | Goal progress, today's plan, logging streak, key stats, coach's notes. Real user data, no sample values. |
| **Trainer** | Weekly plan generated from goal, experience, equipment and available days. Gym or home workouts with adaptive splits, injury-aware filtering, sets/reps/rest, progressive-overload hints. |
| **Nutritionist** | Mifflin-St Jeor BMR, TDEE, calorie and macro targets, built-in food database, per-meal diary, seven-day summary. Excludes today's partial log from averages. |
| **Chef** | 60+ recipes filtered by cuisine, diet (nonveg/vegetarian/vegan/eggetarian), and meal type (Tiffin/Lunch/Dinner/Snacks). Filters respect user allergies. Each recipe shows calories, macros, prep time, ingredients and step-by-step instructions. |
| **Health check** | BMI, hydration, sleep, symptom/injury notes with general wellness guidance and safety checks for unsafe targets. |
| **Progress** | Canvas charts for weight, measurements and workouts, plus full history tables. |
| **Course-correction engine** | Notices missed workouts, calorie drift, weight moving the wrong way, low protein and poor sleep. Each alert explains the issue and gives a specific fix; plan/targets adjust automatically. |
| **Data controls** | Export/import progress as JSON, reset logs, delete all profiles, light/dark theme toggle. |
| **Design** | Mobile-first responsive layout, clean cards, accessible controls throughout, emoji-only navigation that expands to text on hover/focus. |

---

## How the course-correction engine works

**Inputs:** Weekly training logs, daily food logs, weekly weight entries, sleep records, user profile (goal, activity level, BMI, target weight).

**Rules:**
1. **Missed workouts** — If planned sessions > logged sessions by 3+, a warning is shown and the next week's plan is reduced by 1–2 days.
2. **Calorie drift** — If the 7-day average calories exceed the target by >250 kcal (for lose goal) or fall below by >350 kcal, the daily target is nudged by ±100–150 kcal.
3. **Protein check** — If average protein < 70% of target, a 10 g protein bump is applied and noted.
4. **Sleep check** — If average sleep < 6.5 hours, the next week's set count is reduced by 1.
5. **Weight trend** — If the weigh-in trend over ≥7 days moves the wrong way relative to the goal (e.g. weight going up on a "lose" goal), a warning is shown with guidance on portion review.
6. **Target weight warning** — If the target weight is >25% away from current weight, or corresponds to a BMI < 17.5, a safety warning is displayed.

**Outputs:** Auto-adjusted calorie targets, protein targets, and weekly plan days. Alerts are rendered in the dashboard and trainer sections with specific fix actions.

---

## Formulas

### Mifflin-St Jeor BMR

**Male:** `BMR = 10 × weight(kg) + 6.25 × height(cm) − 5 × age(y) + 5`

**Female:** `BMR = 10 × weight(kg) + 6.25 × height(cm) − 5 × age(y) − 161`

### TDEE (Total Daily Energy Expenditure)

`TDEE = BMR × activity_multiplier`

| Activity level | Multiplier |
|---|---|
| Sedentary | 1.2 |
| Lightly active | 1.375 |
| Moderately active | 1.55 |
| Very active | 1.725 |
| Extremely active | 1.9 |

### Macro splits (post-TDEE)

- **Calorie delta:** `lose → −500`, `gain → +400`, `build → +250`, `maintain → 0`
- **Protein:** `lose/maintain → 1.6 g/kg`, `build → 1.8 g/kg`, `lose/build → 2.0 g/kg`
- **Fat:** `27% of calories ÷ 9 kcal/g`, clamped to [35, 130] g
- **Carbs:** `(calories − protein×4 − fat×9) ÷ 4`, minimum 50 g

### Weekly weight-trend calculation

```
span_days = (last_weight_date − first_weight_date) in days
per_week = ((last_kg − first_kg) / span_days) × 7
wrongWay = (goal === 'lose' && per_week > 0.25) || (goal ∈ {'gain','build'} && per_week < −0.25)
```

---

## Tech Stack

- **HTML5** — single `index.html` entry point
- **Vanilla JavaScript** — no external libraries, no build step
- **localStorage** — all data persists client-side only
- **CSS3** — CSS-variable theming, responsive grid, prefers-reduced-motion support
- **Canvas API** — lightweight chart drawing (no chart library)
- **Web Crypto API** — salted SHA-256 password hashing
- **Web Storage API** — localStorage for profiles, logs, settings
- **WebIF** — optional service worker for offline PWA mode

---

## Folder structure (optional — single-file build still works)

```
trainer4u/
├── index.html       — single HTML file (app shell, all JS, all CSS)
├── css/
│   └── style.css    — extracted CSS (optional, can be inlined in index.html)
├── js/
│   ├── db.js        — storage (loadDB, saveDB, schema version, migration)
│   ├── auth.js      — authentication (hashPassword, createUser, login)
│   ├── trainer.js   — plan generation (buildPlan, planTemplates, chooseExercises)
│   ├── nutrition.js — BMR/TDEE/macros (baseTargets, targets, getInsights)
│   ├── chef.js      — recipe database and filtering (RECIPES, fitsDiet, allergenFree)
│   ├── health.js    — BMI, hydration, wellness guidance (renderDoctor)
│   ├── progress.js  — charts and trend tracking (drawLineChart, drawBarChart)
│   ├── coach.js     — course-correction engine (getInsights, targetWarnings)
│   └── ui.js        — rendering helpers (toast, esc, toggleTheme)
├── manifest.webmanifest  — PWA manifest
├── sw.js               — service worker (cache-first, versioned cache)
├── .gitignore
├── LICENSE
├── CONTRIBUTING.md
└── .github/
    └── ISSUE_TEMPLATE/
        ├── bug_report.md
        └── feature_request.md
```

*A tiny `bundle.js` script can re-combine all modules into a single `dist/index.html` so the "single file" feature still works for distribution.*

---

## Roadmap

- [ ] PWA offline support (manifest + service worker)
- [ ] Unit tests for pure logic (BMR, TDEE, macros, BMI, course-correction)
- [ ] GitHub Actions CI + CD to GitHub Pages
- [ ] Workout reminders (Notification API, opt-in)
- [ ] Water and sleep quick-log widgets on dashboard
- [ ] Printable/shareable weekly plan
- [ ] Unit toggle (kg/lb, cm/ft-in)
- [ ] Optional encrypted export of backups

---

## Privacy

**All data stays in your browser.** Trainer4U is a client-side-only application. No profile data, logs, or any other information is ever sent to a server or collected externally. Everything is stored in `localStorage` under keys prefixed `trainer4u_`. If you clear site data or use a different browser, your progress will be lost — use **Settings → Export** to back up important data.

---

## Security note

Client-side SHA-256 hashing (via the Web Crypto API) protects casual access on a shared device: passwords are never stored in plain text, and the hashing makes it impractical to recover the original password from the stored hash. **However, this is not real authentication.** Anyone with access to the browser's `localStorage` can read all stored fitness data. Trainer4U is a wellness tool, not a secure authentication system. For real account-based access, a backend with server-side sessions would be required.

---

## Medical disclaimer

Trainer4U provides general fitness and wellness information for healthy adults. It cannot diagnose or treat any condition. See a doctor, physiotherapist or registered dietitian for pain, injuries, medical conditions, pregnancy, eating-disorder history, medication interactions, or extreme weight goals. Stop exercising and seek help for chest pain, faintness, severe shortness of breath or sharp joint pain.

---

## Feedback

If you have suggestions, bug reports, or feature requests, please share them at: [https://forms.gle/5zySDBpFBDyY6dar8](https://forms.gle/5zySDBpFBDyY6dar8)

Every user's input helps shape the project and makes Trainer4U better for the community.
## License

Copyright (c) 2026 Akshay.

Licensed under the Apache License, Version 2.0. See the [LICENSE](LICENSE) file for details.

# Trainer4U 🏋️

**Trainer4U** is a complete, client-side-only fitness coaching app. Everything
— HTML, CSS and vanilla JavaScript — lives in the single file `index.html`,
with no backend, no build step and no external libraries.

Open `index.html` directly in a browser, or serve the folder:

```bash
python3 -m http.server 3000   # then visit http://localhost:3000
```

## Features

- **Local accounts** — multiple profiles per browser, salted SHA-256 password
  hashing via the Web Crypto API (with a clearly-marked fallback).
- **Onboarding** — age, sex, height, weight, target weight, activity level,
  goal, diet, allergies, injuries, available equipment and training days (1–7).
- **Dashboard** — goal progress, today's plan, logging streak, key stats and
  the coach's notes. All calculations use real user profile data, never sample
  values. Excludes today's partial food log from weekly averages.
- **Trainer** — weekly plan generated from goal, experience, equipment and
  available days (1–7). Gym or Home workouts with adaptive splits, injury-aware
  exercise filtering, sets/reps/rest, and progressive-overload hints.
- **Nutritionist** — Mifflin-St Jeor BMR, TDEE, calorie and macro targets, a
  built-in food database, per-meal diary and a seven-day summary. Excludes
  today's partial log from averages.
- **Chef** — 60+ recipes filtered by cuisine, diet (nonveg/vegetarian/vegan/eggetarian),
  and meal type (Tiffin/Lunch/Dinner/Snacks). Filters are combinable and respect
  user allergies. Each recipe shows calories, macros, prep time, ingredients and
  step-by-step instructions.
- **Health check** — BMI, hydration, sleep and symptom/injury notes with general
  wellness guidance, safety checks for unsafe targets, and a clear medical
  disclaimer.
- **Progress** — canvas charts for weight, measurements and workouts, plus
  full history tables.
- **Course-correction engine** — notices missed workouts, calorie drift,
  weight moving the wrong way (compared to goal), low protein and poor sleep.
  Each alert explains the issue and gives a specific fix, and the plan/targets
  adjust automatically from current logs.
- **Data controls** — export/import progress as JSON, reset logs, delete all
  profiles, and a light/dark theme toggle.
- **Design** — mobile-first responsive layout, clean cards, accessible controls
  throughout, emoji-only navigation that expands to text on hover/focus.

## Notes

- All data is stored in `localStorage` under keys prefixed `trainer4u_`.
  Nothing leaves the browser.
- Calculations are estimates for healthy adults. This is a wellness tool, not
  medical or dietetic advice; the app recommends professional guidance where
  appropriate.
- Because storage is local, clearing site data or using a different browser
  will lose progress. Use "Export" to back up important progress.
- The visual theme uses navy (#0F172A) backgrounds, burgundy (#881337) buttons
  and highlights, and light green (#E8F5E9) for text and cards. Navigation icons
  show only emoji by default and expand to show text labels on hover or keyboard
  focus.
- Demo profiles can be created via Sign up — there is no limit and every profile
  is separate. Data stays completely local to this browser.

- **Feedback** — If you have suggestions, bug reports, or feature requests, please
  share them at: [https://forms.gle/5zySDBpFBDyY6dar8](https://forms.gle/5zySDBpFBDyY6dar8)
  Every user's input helps shape the project and makes Trainer4U better for the
  community.

## Project Initialization

Trainer4U is a client-side-only application that runs entirely in the browser.
Upon loading `index.html`:

1. **Database loading** — The app reads saved data from `localStorage` under the key `trainer4u_db_v2`. If no data exists, an empty database `{profiles: {}}` is used.

2. **Demo profile seeding** — A demo profile (`username: demo`, password: `demo1234`) is automatically created with four weeks of sample weight, workout, food, sleep and wellness data. This ensures the coaching engine has immediate data to work with. The demo profile is stored under the key `demo`.

3. **Session check** — The app checks if a session exists in `localStorage` under the key `trainer4u_session_v2`. If a saved profile is found for that session, the user is logged in automatically and their profile data is restored.

4. **Entry points**:
   - If the user is **not signed in**, the **auth screen** (`renderAuth()`) is shown, where they can log in or sign up.
   - If the user **is signed in but not onboarded**, the **onboarding screen** (`renderOnboarding()`) appears, asking for personal details (name, age, sex, height, weight, goal, diet, allergies, injuries, training days).
   - If the user **is signed in and onboarded**, the **main app** (`renderApp()`) is displayed with the dashboard, trainer, chef, and other sections.

5. **Theme application** — The `applyTheme()` function is called during init and whenever the user toggles light/dark mode via the settings menu or the `html[data-theme]` attribute.

6. **Persistent storage** — All user data (profiles, logs, settings) is saved in `localStorage` and persists across browser sessions. Clearing site data will lose all progress — users are encouraged to use **Settings → Export** for backups.

---

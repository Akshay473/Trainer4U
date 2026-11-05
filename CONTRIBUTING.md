# Contributing to Trainer4U

Thank you for wanting to contribute! Trainer4U is a client-side-only fitness coach app that runs entirely in the browser. All data stays in the user's browser — no backend, no build step, no external libraries.

## Getting Started

1. **Fork the repo** and clone your fork locally.
2. **Create a branch** for your change: `git checkout -b feat/foo` or `git checkout -b fix/bar`.
3. **Make your changes** — keep the single‑file `index.html` structure, or split into modules and bundle back to `dist/index.html`.
4. **Test your changes** manually in the browser (serve with `python3 -m http.server 3000`).
5. **Commit** with a conventional commit message (e.g. `chore: add service worker`).
6. **Push** and open a Pull Request.

## Development Guidelines

- **No external libraries** — vanilla JavaScript only.
- **All data stays local** — nothing is sent to a server. Any new storage logic must still respect localStorage only.
- **Keep it lightweight** — avoid heavy frameworks, keep the initial load fast.
- **Accessibility first** — labels on all inputs, focus states, aria-labels, color contrast.
- **Backward compatible** — new features should work for existing users without data loss.
- **Add tests** for any new pure logic (BMR, TDEE, macro targets, course‑correction rules).

## Issue Types

Please use the issue templates in `.github/ISSUE_TEMPLATE/` when opening a new issue.

- **Bug report** — describe the problem, browser/OS, steps to reproduce, and expected behavior.
- **Feature request** — describe the problem it solves, the proposed solution, and any sketches or mockups.

## Pull Request Checklist

- [ ] Code follows the existing style (variable naming, JSDoc comments, no `innerHTML` without sanitization).
- [ ] No `.tmp` files left behind.
- [ ] Package.json and README are updated if applicable.
- [ ] Tested manually in the browser.
- [ ] Conventional Commit message.
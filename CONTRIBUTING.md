# Contributing to Trainer4U

Trainer4U is a source-visible, proprietary application. Bug reports and feedback are welcome through the repository's issue templates.

## Code contributions

Unsolicited pull requests are not accepted. Do not submit code unless Akshay has requested the contribution and agreed its terms in writing. No contribution or issue creates a license, ownership transfer, or permission to reuse project code unless separately agreed in writing.

Commits after `c5b049e927cbf6f9edf84ab3bfba4a3482fd9e5c` are covered by the Proprietary License in `LICENSE`. Earlier commits remain under their original MIT License. See the license boundary in `LICENSE` before using any version.

## Development guidelines for authorized contributions

- Keep the client-side, single-file architecture unless a different structure is agreed.
- Keep user data local; do not add a backend, tracking, or undisclosed network requests.
- Keep the app lightweight and avoid runtime dependencies.
- Make inputs accessible, with labels, focus states, and sufficient color contrast.
- Preserve existing user data and settings through schema changes.
- Add unit tests for pure logic and browser checks for user-facing workflows.
- Run `npm test`, `npm run lint`, `npm run build`, and `npm run test:browser` before submitting authorized work.
- Do not commit `.tmp` files, credentials, personal data, or generated dependencies.
- Update documentation and metadata when behavior or project terms change.
- Use a Conventional Commit message, such as `fix: preserve meal order`.

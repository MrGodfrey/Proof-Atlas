# Contributing to Proof Atlas

Thanks for helping improve Proof Atlas. The best contributions are small, testable, and easy to review.

## Local Setup

```bash
npm ci
npm test
npm run build
```

Run the example app:

```bash
npm run atlas -- dev examples/semidiscrete/ProofAtlas --port 3217
```

## Before Opening a Pull Request

- Keep changes focused on one problem.
- Add or update tests when behavior changes.
- Run `npm test` and `npm run build`.
- If you change the file protocol, update both English and Chinese wiki pages.
- If you change CLI behavior, update the README command examples.

## Object Protocol Changes

Proof Atlas is file-driven. Compatibility matters. When changing schema behavior, document:

- whether old projects still load,
- whether `atlas check --strict` behavior changes,
- whether `atlas rename` or `atlas locate` needs migration logic.

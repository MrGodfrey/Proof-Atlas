# Open Source Release And Demo Verification

This document is for publishing updates from the development repository to the open source publication repository and confirming that the Cloudflare demo still works.

Paths in this document use variables:

- `DEV`: development repository root.
- `PUB`: open source publication repository root.

Online demo:

```text
https://proof-atlas-demo.pages.dev
```

## Basic Principles

The open source repository is not a complete mirror of the development repository. Besides release code, it contains README files, license text, GitHub Actions, Cloudflare Pages configuration, and static demo support. Sync development changes into it, but do not overwrite open-source-only demo support.

Preserve these files and features:

- `demo-data` CLI command and static demo loading logic
- `.env.demo`
- `wrangler.jsonc`
- `.github/workflows/deploy-demo.yml`
- Demo links in README files
- `demo:data`, `build:demo`, `dev:demo`, and `deploy:demo` scripts in `package.json`
- `.gitignore` rule for `public/demo-data.json`

## 1. Check Both Repository States

```bash
DEV=/path/to/proofAtlas
PUB=/path/to/proof-atlas-open-source

cd "$DEV"
git status --short
git branch --show-current

cd "$PUB"
git status --short
git branch --show-current
```

If either repository has uncommitted changes, confirm who owns them and whether they belong to the release. Do not revert unrelated changes.

## 2. Compare Release Scope

```bash
DEV=/path/to/proofAtlas
PUB=/path/to/proof-atlas-open-source

git diff --no-index --stat "$DEV/src" "$PUB/src" || true
git diff --no-index --stat "$DEV/tests" "$PUB/tests" || true
git diff --no-index --stat "$DEV/examples" "$PUB/examples" || true
git diff --no-index --stat "$DEV/fixtures" "$PUB/fixtures" || true
git diff --no-index --stat "$DEV/wiki" "$PUB/wiki" || true
```

Only sync these release scopes:

- `src/`
- `tests/`
- `examples/`
- `fixtures/`
- `wiki/`
- `.gitignore`

Do not sync `design drafts/`, `.vscode/`, `.DS_Store`, `.codex/`, `node_modules/`, `dist/`, local `.atlas/local.yml`, or `.atlas/suggestions/`.

## 3. Merge Code

For directories without open-source-only edits, such as `tests/`, `examples/`, `fixtures/`, and `wiki/`, it is acceptable to sync with `rsync` after reviewing the diff:

```bash
DEV=/path/to/proofAtlas
PUB=/path/to/proof-atlas-open-source

rsync -a --delete --exclude='.DS_Store' "$DEV/tests/" "$PUB/tests/"
rsync -a --delete --exclude='.DS_Store' "$DEV/examples/" "$PUB/examples/"
rsync -a --delete --exclude='.DS_Store' "$DEV/fixtures/" "$PUB/fixtures/"
rsync -a --delete --exclude='.DS_Store' "$DEV/wiki/" "$PUB/wiki/"
```

Do not blindly overwrite `src/`. The open source repository has demo-related logic in `src/cli/atlas.ts`, `src/web/App.tsx`, and `src/web/styles.css`. If development changes touched those files, merge them manually.

## 4. Verify The Open Source Repository Locally

Run in the open source repository:

```bash
PUB=/path/to/proof-atlas-open-source

cd "$PUB"

npm ci
npm test
npm run build
npm run build:demo
npm run atlas -- check --strict examples/semidiscrete/ProofAtlas
npm audit --omit=dev
git diff --check
```

`npm run build:demo` generates `public/demo-data.json`, which should stay ignored by git.

## 5. Deploy The Cloudflare Demo

After local verification passes, run in the open source repository:

```bash
npx wrangler whoami
npx wrangler pages deploy dist --project-name=proof-atlas-demo --branch=main
```

If GitHub Actions has Cloudflare secrets configured, pushing to GitHub can also deploy through `.github/workflows/deploy-demo.yml`. Manual deploy is useful when verifying the demo locally before or after release.

## 6. Verify The Online Demo

```bash
curl -fsSI https://proof-atlas-demo.pages.dev/
curl -fsSL https://proof-atlas-demo.pages.dev/demo-data.json \
  | node -e "let s='';const count=v=>Array.isArray(v)?v.length:Object.keys(v??{}).length;process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const d=JSON.parse(s); console.log(d.schema_version, d.default_project); for (const p of d.projects??[]) console.log(p.id, p.title); for (const [id,p] of Object.entries(d.payloads??{})) console.log(id, count(p.graph?.objects), count(p.graph?.views), count(p.bodies));})"
```

Expected result:

- The home page returns HTTP 200.
- `demo-data.json` parses.
- Output includes `semi-discrete-stochastic-control` and `proof-atlas-example-reference-atlas`.
- Object count, view count, and body count are nonzero for both payloads.
- The top `Open` menu lists both projects and can directly open `Proof Atlas Example Reference Atlas`.

## 7. Commit The Release

After reviewing the diff in the open source repository:

```bash
git status --short
git diff --stat
git add -A
git commit -m "Release vX.Y.Z"
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin main
git push origin vX.Y.Z
```

If the change only syncs demo or documentation, a version tag may not be necessary. Decide based on the release goal.

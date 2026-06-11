# Getting Started

## Install

```bash
git clone git@github.com:MrGodfrey/Proof-Atlas.git
cd Proof-Atlas
npm ci
```

## Validate the Example

```bash
npm run atlas -- check examples/semidiscrete/ProofAtlas
npm run atlas -- check --strict examples/semidiscrete/ProofAtlas
```

The strict check should finish with:

```text
OK strict check: 0 problem(s).
```

## Run the Local Web UI

```bash
npm run atlas -- dev examples/semidiscrete/ProofAtlas --port 3217
```

Open:

```text
http://localhost:3217
```

If the port is already occupied, the dev server will try a nearby available port and print the URL.

## Create a New Project

```bash
npm run atlas -- init my-paper
```

This creates:

```text
my-paper/ProofAtlas/
  atlas.yml
  objects/
  views/dashboard.md
  .atlas/aliases.yml
  AGENTS.md
```

Create your first object:

```bash
npm run atlas -- new math claim main.claim.some_result "Some result" --project my-paper/ProofAtlas
```

Run the project:

```bash
npm run atlas -- check --strict my-paper/ProofAtlas
npm run atlas -- dev my-paper/ProofAtlas --port 3217
```

## Useful Commands

```bash
npm run atlas -- locate main.claim.null_controllability examples/semidiscrete/ProofAtlas
npm run atlas -- rename old.name new.name examples/semidiscrete/ProofAtlas
npm run atlas -- doctor examples/semidiscrete/ProofAtlas
```

Use `doctor` to refresh `AGENTS.md` and catch project-structure issues.

# LLM Project Operating System Export

This folder is a portable starter for a new project that wants the same
engineering operating model without carrying source-project-specific runtime,
roadmap, edition, or product assumptions.

It provides:

- `AGENTS.md` with the default LLM workflow contract.
- `steering/` with generic steering source documents and compact LLM
  packs.
- `work/` with idea and work-package templates.
- `scripts/` with small project-local workflow tools.
- `package-scripts.json` with npm scripts to merge into a project
  `package.json`.

## Install Into A New Project

1. Copy the contents of this folder to the new project root.
2. Merge `package-scripts.json` into the target `package.json`.
3. Create or adapt root `roadmap.md` and `architecture.md`.
4. Start new work from `work/ideas/` or `work/packages/`.
5. Run `npm run work:context` before non-trivial implementation.

## Design Intent

The operating model is intentionally narrow:

1. One concern per work package.
2. One semantic owner per durable concern.
3. One canonical path per semantic decision.
4. Evidence is collected and normalized before decisions are made.
5. Domain/runtime scalars have owners.
6. Absence is represented by explicit states, not `null` or `undefined`.
7. Validation, review, focused commits, and package closure are not optional.
8. The model ledger is advisory only.

## What Was Removed

This export does not include:

- Source-project product names, roadmap rows, or edition ownership.
- Source-project runtime, domain, subsystem, or harness-specific rules.
- Existing package history, sprint history, artifacts, reports, or local
  model-ledger entries.
- Repository-specific guardrail allowlists or baseline counts.

## Recommended First Commit In A New Project

After copying this folder into a new repository, make one focused commit:

```bash
git add AGENTS.md steering work scripts package-scripts.json roadmap.md architecture.md
git commit -m "Add project operating system"
```

Then create the first real package under `work/packages/`.

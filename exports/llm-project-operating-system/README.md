# LLM Project Operating System Export

This folder is a portable starter for a new project that wants the same
engineering operating model without carrying source-project-specific runtime,
roadmap, edition, or product assumptions.

It provides:

- `AGENTS.md` with the default LLM workflow contract.
- `steering/` with generic steering source documents and compact LLM
  packs.
- `scripts/` with small project-local workflow tools.
- `package-scripts.json` with npm scripts to merge into a project
  `package.json`.
- `_legacy_work/` with archived legacy work-package templates and tracker
  utilities kept for reference only.

## Install Into A New Project

1. Copy the contents of this folder to the new project root.
2. Merge `package-scripts.json` into the target `package.json`.
3. Create or adapt root `roadmap.md` and `architecture.md`.
4. Use the target repository's active workflow for new implementation work.

## Design Intent

The operating model is intentionally narrow:

1. One concern per implementation slice.
2. One semantic owner per durable concern.
3. One canonical path per semantic decision.
4. Evidence is collected and normalized before decisions are made.
5. Domain/runtime scalars have owners.
6. Absence is represented by explicit states, not `null` or `undefined`.
7. Validation, review, and focused commits are not optional.

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
git add AGENTS.md steering scripts package-scripts.json roadmap.md architecture.md
git commit -m "Add project operating system"
```

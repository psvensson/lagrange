# Memory boundary — in-repo steering vs external auto-memory

Two memory systems serve this project. They have different jobs and MUST NOT
duplicate each other; duplication is how the same "truth" drifts into three
conflicting copies.

## The two systems

- **In-repo steering** (`docs/steering/**`, the generated packs under
  `docs/steering/llm/`, `rules.json`, and `AGENTS.md`): durable, shared,
  version-controlled, CI-gated **rules and ground truth**. This is the home for
  anything that should bind future work for *everyone*.
- **External auto-memory** (the agent's `MEMORY.md` and its files, outside the
  repo): transient, single-user **narrative and current frontier** — handoffs, live
  blocker state, in-flight hypotheses. The home for "where am I right now", not for
  rules.

## Rules

- A lesson that should bind future work for everyone MUST be promoted into in-repo
  steering via `node scripts/solve.js promote-finding` (see
  [`docs/steering/findings/README.md`](findings/README.md)), NOT left only in
  external memory.
- Session/narrative state (current blocker, handoff notes, working hypotheses) stays
  in external memory and MUST NOT be copied into in-repo steering.
- Durable operational ground truth has exactly one canonical home,
  [`operational-ground-truth.md`](operational-ground-truth.md). `AGENTS.md` and the
  external auto-memory MUST link to it rather than restate it.
- When external memory and in-repo steering disagree, in-repo steering wins (it is
  shared and CI-gated); fix the external note.
- **Metadata is part of the diff.** When you substantively change a body / decision-log
  (a memory file, an epic, a quest), refresh that file's summary metadata — frontmatter
  `description:`/`status:` AND its index hook (`MEMORY.md` / `MEMORY-ARCHIVE.md` line) — in
  the SAME edit. A body that advanced past its metadata is a defect, not staleness. An
  audit (2026-07-01) found this is the single largest drift source: write-once summary
  fields authored at creation and never refreshed as the body evolved over sessions. The
  hand-written index hook is the source of truth for a memory's one-line summary; treat
  `description:` as a derived caption, not an independent claim (do NOT regenerate the hook
  from `description:` — the descriptions are what rot). For the in-repo Solver ledger the
  structured half of this is machine-checked by `npm run solve:consistency`
  ([`scripts/solve/ledger-consistency.js`](../../scripts/solve/ledger-consistency.js)):
  epic `status:` presence/vocabulary + quest↔oracle↔state consistency. External
  auto-memory has no gate, so for it this rule is the only guard.

## Why

In-repo steering is regenerated and drift-checked (`npm run steering:check`), so it
cannot silently lag its source. External memory has no such gate and drifts unless
hand-refreshed. Keeping rules in the gated system and narrative in the fast system
gives each its strength without the cost of reconciling duplicates.

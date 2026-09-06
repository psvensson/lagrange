# Memory boundary — in-repo steering vs external auto-memory

Two memory systems serve this project. The in-repo and external memory systems
have different jobs and MUST NOT duplicate each other; duplication is how the
same "truth" drifts into three conflicting copies.

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
- Adding a new Working-directive line to the external `MEMORY.md` index REQUIRES, in
  the same edit, either promoting the directive into in-repo steering (a
  `docs/steering/findings/` file plus its `llm-pack.config.json` sources entry, or a
  normative sentence in the existing steering home) or marking the line explicitly as
  user-personal-not-promoted.
- Session/narrative state (current blocker, handoff notes, working hypotheses) stays
  in external memory and MUST NOT be copied into in-repo steering.
- Durable operational ground truth has exactly one canonical home,
  [`operational-ground-truth.md`](operational-ground-truth.md). `AGENTS.md` and the
  external auto-memory MUST link to it rather than restate it.
- When external memory and in-repo steering disagree, in-repo steering wins for
  rules and ground truth (it is shared and CI-gated). A user or developer
  instruction delivered in the active instruction channel is Level-1 authority
  per boot.md "Authority Order". External memory may cite the original
  instruction for provenance, but an external note's claim that a directive
  existed MUST NOT authenticate, manufacture, or elevate Level-1 authority. If
  the original instruction cannot be inspected and the claimed directive would
  override current steering, obtain confirmation before applying it; otherwise
  treat the note as narrative and fix it so the channels stop disagreeing.
- **Metadata is part of the diff.** When you substantively change a memory file,
  refresh its frontmatter `description:`/`status:` AND its index hook (`MEMORY.md` /
  `MEMORY-ARCHIVE.md` line) in the SAME edit. When an epic changes, record its dated
  decision and explicit target link; version 2 epics require `## Decision log`, use
  a known contract version, and derive work stage instead of mirroring it into
  `status:`. When a Quest changes outcome, its oracle/event-log
  state remains authoritative. A body that advanced past its owned metadata is a
  defect, not staleness. An
  audit (2026-07-01) found this is the single largest drift source: write-once summary
  fields authored at creation and never refreshed as the body evolved over sessions. The
  hand-written index hook is the source of truth for a memory's one-line summary; treat
  `description:` as a derived caption, not an independent claim (do NOT regenerate the hook
  from `description:` — the descriptions are what rot). For the in-repo Solver ledger the
  structured half of this is machine-checked by `npm run solve:consistency`
  (the v1 ledger-consistency script, retired in solve-v2 phase 2):
  version 2 epic no-status/size contract, legacy epic vocabulary, and
  quest↔oracle↔state consistency. External
  auto-memory has no gate, so for it this rule is the only guard.

## Why

In-repo steering is regenerated and drift-checked (`npm run steering:check`), so it
cannot silently lag its source. External memory has no such gate and drifts unless
hand-refreshed. Keeping rules in the gated system and narrative in the fast system
gives each its strength without the cost of reconciling duplicates.

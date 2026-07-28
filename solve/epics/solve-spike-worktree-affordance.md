---
epicContractVersion: 2
id: solve-spike-worktree-affordance
roadmapRow: null
graduatesTo: quests
---

# Solve spike: throwaway-worktree exploration inside a Quest

## Problem

Every experimental byte written during a Quest folds into the single landing
candidate (verification contract v2), and once any candidate is rejected, the
same-base replacement invariant drags the rejected path superset behind every
subsequent try (measured 2026-07-28: a mandatory 29-path superset on
comparative-efficiency-measured-cell-admission forced three guard overrides in
eight minutes). Trying an approach is therefore expensive, which is the
strongest structural pressure against exploration the workflow has. The
explore rung bounds free *thinking*; nothing bounds cheap *code* exploration.

## Proposal

`solve spike --id <quest>` opens a throwaway git worktree; the operator or
executor explores there; the only artifacts that survive are findings,
theories, and rulesOut recorded against the Quest log. The worktree is
discarded on exit. The Solver never sees the bytes, so nothing enters the
landing candidate, the aggregate fingerprint, scope pressure, or the
rejection-replacement machinery.

Verified mechanics (2026-07-28 adversarial review):

- An attempt with no recorded changeRef records nothing: zero-source-path
  attempts are already skipped by the verification projection
  (verification.js `rawSourceChangingAttempts`), and a spike records no
  attempt event at all.
- Findings and theories append without a pending attempt (`cmdFinding` /
  theory commands), so spike output lands in quest memory directly.
- The honesty contract requires every ATTEMPT to be recorded; in-quest
  exploration that records no attempt violates nothing. The
  "second evidence-bearing intervention" rule governs direct work OUTSIDE
  quests, not exploration inside one.
- Worktree isolation is already sanctioned for parallel workers, and
  `scripts/session-worktree.js` already materializes HEAD plus uncommitted
  tracked and untracked files into a throwaway tmp worktree (used by
  dt-prove.js) — the spike command should reuse it, not reimplement it.
- The untracked-file guard in step.js watches only the live tree's governed
  directories; a tmp worktree is invisible to it.

## Hard rules (the two landmines)

1. **Evidence must be exported before discard.** A finding whose `evidence`
   points into the discarded worktree is a dead pointer. `solve spike` must
   refuse to exit until any evidence paths named in spike findings have been
   copied into `test-output/` (or another durable root) — or the finding is
   recorded explicitly as unevidenced reasoning.
2. **Probes run inside the worktree.** A spike probe run against the live
   tree would trip the unrecorded-evidence advisory and could be mistaken for
   quest-attempt evidence. The spike shell sets the worktree as cwd; reports
   it produces carry the worktree path and are excluded from auto-ingest.

## Non-goals

- A spike is not a cheap attempt: nothing about it earns rung progress,
  metric movement, or closure evidence. Its only outputs are falsifiable
  statements (theory options, rulesOut, findings).
- No spike-to-candidate promotion in v1. If the explored approach wins, the
  operator re-implements it in the live tree as a normal attempt; the spike
  finding records what to build. (Promotion — replaying the spike diff onto
  the live tree as a fresh attempt — is a v2 option; it must arrive as a new
  quest, not scope creep on v1.)
- No change to the rejection-replacement invariant, scope guard, or landing
  machinery: the entire design premise is that the Solver never sees spike
  bytes, so nothing in fail-closed verification changes.

## Open questions

- Should a spike be recorded as its own event type (`spike-opened` /
  `spike-closed` with a note), or is the resulting finding enough? Leaning:
  a `spike-closed` event with duration and exit disposition, so reflection
  and post-mortems can see how much exploration a quest needed.
- Should the autonomous loop be allowed to open spikes, or is this
  operator/supervised-only in v1? Leaning: supervised-only first; the loop
  gets it once the evidence-export rule has survived real use.
- Budget: is a per-quest spike count worth bounding (like EXPLORE_BUDGET=3),
  or is the worktree cost itself the natural bound? Leaning: log a count in
  the spike-closed event, gate nothing until data says otherwise.

## Decision log

- 2026-07-28 — Drafted from the workflow-efficiency review: adversarial
  verification confirmed the no-attempt premise holds against the honesty
  contract and identified the two hard rules above (evidence export before
  discard; probes inside the worktree). Reuse `scripts/session-worktree.js`.
  v1 scope: supervised `solve spike` open/explore/close with findings-only
  exit; no promotion, no loop integration.

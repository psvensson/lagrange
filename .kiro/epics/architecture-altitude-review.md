---
id: architecture-altitude-review
roadmapRow: null
status: discussing
graduatesTo: null
---

# Architecture-altitude review (standing)

## Intent (why now)

The Quest workflow is excellent at within-frame convergence (drive a sealed
`doneWhen` to terminal, one invariant at a time) but, left alone, it can grind a
*frame* that is itself wrong — patching symptoms of an owner boundary the Quest
cannot touch, re-modeling one facet per blocker, or accreting truth across many
sources/files. This standing epic is the durable home for the **altitude (framing)
reflection**: the recurring, higher-level "are we even working on the right thing,
at the right altitude, with the right modeling and arrangement?" question, and the
place where its answers land so they do not evaporate in chat.

It pairs with the `altitudeReflectionDue` mechanism (solver-quests.md "Mandatory
Step-Back Reflection Turn"): the loop fires an altitude reflection on
coupled-oscillation and on a coarse cadence; this epic is where the recurring
findings, pivots, and follow-on epics/quests are recorded.

## The standing questions (run these at each altitude review)

1. **Altitude** — Is the open Quest at the right altitude, or is the real lever an
   owner boundary / cutover it cannot touch? Are we patching symptoms while the
   owner contract stays porous?
2. **Modeling efficiency** — Are the TLA+ specs and the deterministic harness
   pulling their weight? Is one facet being re-modeled per blocker (a new spec per
   CL)? Should TLA+ shrink to timeless impossibility proofs and DST become the
   primary, seed-pinned falsifier?
3. **Arrangement for reasoning** — Is truth single-owned, or diffuse across many
   sources/consumers? Are modules cohesive, or split by arbitrary line-count
   (`*-methods.js` mixins, flat 200-file directories)?
4. **Pivot-or-continue** — Given the above, should the open Quest continue, or
   honestly EXHAUST and pivot to a higher-altitude Quest/epic?

## Cadence and triggers

- **Regularly** — coarse `ALTITUDE_REFLECTION_INTERVAL` cadence inside an
  autonomous run.
- **On special occasions** — coupled-invariant oscillation (the frame is suspect
  by definition); a contemplated EXHAUST-and-pivot.
- **On demand** — `node scripts/solve.js reflect --id <id> --altitude --note "…"`.

## Evidence feed: standing-invariant drift (the mechanical substrate)

This review used to run on judgement alone. The **standing-invariant tier**
(`.kiro/specs/standing-invariant-closure/`) now feeds it evidence: when the altitude
reflection fires, `altitudeInvariantDigest` surfaces every live invariant that is not
currently `HELD` (BREACHED/UNGUARDED) into the framing prompt — a BREACHED architecture
invariant *is* the signal that "a doc/contract no longer reflects the running system,"
exactly the frame-level question this review asks. Default-off behind
`LAGRANGE_STANDING_INVARIANTS`; the digest reads the folded status only (no evaluation,
no writes), so it is a cheap, side-effect-free input.

**Partial by nature (the cheap-predicate subset).** Only invariants with *cheap live
evidence* (a deterministic repro) become standing invariants that can feed this review
on the per-Quest cadence; owner-boundary / single-semantic-owner properties whose only
faithful evidence is an expensive model gate (Alloy / owner-traces) stay model-checked
(`model:contracts`) and would, if promoted, bind to an `on-cadence` trigger rather than
per-event. So the feed currently surfaces the repro-backed invariant classes; broadening
it to owner-boundary properties needs a cheap runtime predicate that does not yet exist.

## Options under discussion

- Keep this epic purely as a review/log surface (current).
- Graduate specific recurring findings into their own epics/quests as they sharpen
  (e.g. `membership-single-owner-cutover`, modeling-substrate consolidation).

## Open questions

- What is the right `ALTITUDE_REFLECTION_INTERVAL` in practice (currently 20)?
- Should a periodic portfolio-level altitude review be scheduled (cross-Quest),
  beyond the per-Quest cadence?

## Decision log

- 2026-06-18 — Created alongside the altitude-reflection mechanism
  (`altitude-reflection-mechanism` quest). First altitude insight captured:
  see [[membership-single-owner-cutover]] (diffuse active-membership truth is the
  root behind the rolling-restart whack-a-mole; CoupledAdmission proves
  single-frontier patches cannot converge a coupled system).

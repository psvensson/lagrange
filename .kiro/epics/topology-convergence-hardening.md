---
id: topology-convergence-hardening
roadmapRow: RM-0.1-fs-rolling-restart
status: sharpening
graduatesTo: membership-lifecycle-placement-hard-cutover
---

# Epic: Topology convergence hardening

## Intent (why now)

Phase 0.1 ("Internal Coherence") is gated on one thing the capability checklist
cannot show: the topology control plane must actually *converge* under rolling
restart, not merely have the harness that tests it. The `Rolling restart tests`
row (`RM-0.1-fs-rolling-restart`) is ✅ as a capability, but its live truth — does
a restarted cluster republish membership and settle with no priority items — is
still red. This epic is the direction home for that push: it ties the open
convergence Quests to the active closure-ledger records they must close, so
"where we are going next" is legible without reassembling it from memory files.

## Active work (the live frontier)

Quests (see `npm run overview` / `solve trace`):

- `rolling-restart-core-stability` — the binding goal: 3 consecutive harness runs
  with no priority items. Closes `CL-001`, `CL-004`, `CL-030`.
- `membership-publication-drain-determinism` — deterministic, self-rescheduling
  publication drain (PublicationConvergence model property). Closes `CL-001`.

Owner-model Quests that formalize the four semantic owners this depends on
(spec `core-topology-control-plane-rewrite`): `model-owner-transition-recoverable-wake`,
`model-readiness-handoff-liveness`, `model-projection-freshness-epoch-fencing`,
`model-owner-trace-validation`, `model-bounded-retry-exit-routing` — all SOLVED;
they bound the design space this convergence work executes against.

## Where to start each session

Before queuing a gate or diagnosing the next blocker, run `npm run analyze:latent-blockers`
— it mines the whole report corpus for the masked blocker distribution the serial gate
hides (peel-order + emerging candidates). It is the deterministic backbone of the
`latent-convergence-blocker-census` epic (which graduates into this one); use it as the
cheap pilot that grounds the frontier before any expensive fan-out or gate.

## Open questions

- Is `CL-039` (publication write-substrate / control-plane raft leadership) a
  separate frontier under this epic, or the same invariant as `CL-001`? The
  rolling-restart log cites `CL-001/004/030`; memory flags `CL-039` as the binding
  tail. Resolve before adding it to `closesCL`.
- Does this epic graduate fully into `membership-lifecycle-placement-hard-cutover`,
  or does the owner-model half belong under `core-topology-control-plane-rewrite`?

## Decision log

- 2026-06-18 — Epic authored as the direction surface for the rolling-restart
  convergence push; quests linked to specs + closure records in the same pass
  (links backfill). Status `sharpening`: goal is sharp, the `closesCL` set for the
  publication tail is not yet settled.

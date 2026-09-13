---
id: release-0-2-five-node-convergence
status: superseded
proof: certification
roadmapRow: RM-0.2-five-node-convergence
graduatesTo: null
quests:
  - red-main-multi-join-formation-convergence
  - admin-cdc-notification-lifecycle-contract
  - admin-cdc-authoritative-repair-race-contract
authorizes: []
doneWhen:
  probe: scenario-harness
  args:
    scenario: managed-split-cutover-handoff-closure
    consecutive: 3
    metric: priority
---

# Release 0.2 five-node convergence

Five nodes form, rebalance and survive churn within the release budget on the representative harness.

Derived by the solve-v2 migration from the quests listed above (amendment 7).
The operator seals `doneWhen` and `authorizes` before new quests start here;
until then the epic is `legacy: true` and its scope is unenforced.

## Not sealable from what the repository holds (2026-09-07)

The two terms in the sentence above were searched for exhaustively before this
note was written. Neither can be derived, and the reason is different for each.

**"The release budget" is derivable as a number and not safe to seal as one.**
The one figure carrying repository authority is sixty seconds from cluster
start to five nodes ACTIVE with publication 5/5, an operator decision preserved
verbatim through `formation-grace-parallel-start-hardening` and
`formation-release-handoff-closure-v4`, superseding an earlier ninety. But it
lives only in quest prose: no config, document or checker reads it, so a probe
would have to restate it rather than read it. More decisively, `RELEASE.md`
decided on 2026-09-05 - after the streak that met it - that five-node formation
timing is "a measured number ... never a gate", precisely because the release
had been coupled to a live result the shipped bytes had not met. Reinstating a
timing gate reverses a dated, reasoned decision. And the repository's only
sealing procedure, `docs/convergence-donewhen-metric.md`, cannot express a
wall-clock budget at all: its bars are Wilson-95 pass-rate lower bounds.

There is a second reading that *is* fully derivable and contradicts nothing:
`docs/development/agpl-feature-map.md` and the solved v1 quest of this epic's
own name both state three consecutive fresh-container five-node runs completing
cold formation, table readiness and initial service placement with no
formation, table, placement or safety stall. No time bar.

**"The representative harness" is not derivable.** In this repository
"representative" is a term of art for a sealed-population certification window
as opposed to a small-N diagnostic, and it has been given a five-node
population exactly once, for `rolling-restart`. For formation and convergence
there are five candidate five-node configurations across two mutually exclusive
harnesses - the distributed scenario harness and the MovieLens affinity demo,
which shares no configuration with it - and the feature map names "the
representative cold five-node workload" without ever saying which. Choosing
among them is invention.

**The owner.** `test/distributed/config/convergence-sealed-bars.json`,
governed by `docs/convergence-donewhen-metric.md`, is where this belongs: it
already holds the populations and bars for `rolling-restart` and
`snapshot-live-rebuild`, its promotion rule is written for any scenario, and
the projector that reads it is generic. The gap is that it has no entry for any
five-node formation or convergence scenario, and that no such scenario exists
in a harness to name.

**What is missing is therefore a contract, and one operator decision.** The
contract: a named five-node scenario that exists, an entry recording its
population and bar, and the matching section in the metric document. The
decision, which cannot be derived because both answers are supported by
repository authority that postdates the other: whether acceptance is
stall-free-three-consecutive as the feature map states, or a reinstated
sixty-second window, which would reverse the 2026-09-05 release decision.

Until that is settled this epic stays `legacy: true` with an empty
`authorizes`, which is the honest state: it bounds nothing because nothing has
told it what to bound.

## Disposition (2026-09-13, epic-board-curation)

Kept and sealed: `doneWhen` is the scenario-harness probe of its remaining quest work (`managed-split-cutover-handoff-closure`, 3 consecutive), and `legacy` is dropped so its `authorizes` scope now binds landings.

## Disposition (2026-09-13, owner decision)

Superseded: the cold-formation surface by `formation-seed-decoupling`, and its last live quest `managed-split-cutover-handoff-closure` moved under `split-merge-transition-integrity`, where the split/merge work lives.

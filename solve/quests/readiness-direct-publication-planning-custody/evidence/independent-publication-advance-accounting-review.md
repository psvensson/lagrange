# Independent publication-advance work accounting disposition

Verdict: **approve the proposed complete measurement design after explicit R09 supersession; do not preserve total 3 by dropping required work.** The current evidence supports 3 candidate-owner builds plus 2 builds for each of five freshly evaluated nodes, total 13 on this declared fixture. This is an explicit changed-workload accounting contract, not proof that the old total-three assertion still holds. It is not final implementation, frozen proof, or Quest/E8/E9 acceptance.

## What the trace establishes

I inspected the executable trace and independently classified every recorded build. It wraps the real `buildTrackedPriorityRecoveryPlanningProjection` and calls its original implementation. Fresh-node frames are pushed before and popped in `finally` after the real `buildNodeReadinessSyncCurrent`; this avoids the earlier global-index attribution error. The actual readiness/coordinator constructors, five-node formation cache, source-owner publication update, and no-drain queue match the existing identity test.

Cold and publication-advance phases each contain exactly 13 builds: node-0 through node-4 each have one fresh DIRECT evaluation containing two builds; three builds occur outside those frames. There are no stable-before or stable-after builds. Both stable repeats return the same identity, and the advance returns a different identity. Within each fresh frame, the first build normalizes that node's newly constructed protocol input and the second runs the existing resolved-answer projection/verification path. Outside the frames, stacks show candidate normalization, the forced source-owner projection, and final answer resolution. These are measured paths, not an abstract proof that every possible readiness shape must always cost two builds or that no future optimization is possible.

The result is consistent with `planning-direct-after-unmodified-counts.log`: the unchanged test observes 26 cumulative builds against 13 initial + the old allowance of 3. Separate exact aggregate assertions observe 565 rather than 585 heavy builds and 3164 rather than 3184 gate builds. Those aggregate reductions do not by themselves explain or waive the per-advance failure; the complete trace supplies the missing attribution.

## Historical causal boundary

- `f95fccaf05af37beab410005926d216c626c269a` changed the historical owner budget from 2 to 3 and moved the test from a competing live-winner/no-table-write probe to the canonical source-owner publication update. Its `getAllNodeReadinessSync` could enumerate nodes but returned only cached/stored answers; it did not freshly evaluate a missing answer.
- `2cd37024e6a097b44b246fa2bdb911f670234928` added the missing fresh evaluator after the cached/stored misses. That is the source change that introduces this additional required work on the current fixture.
- `63e4a854b783d4b3176b3ecd123677384c96fafa` later enlarged the explicit required/published domain. The five-node rig already had all five NODES rows, so attributing these ten builds specifically to that later enumeration change would be inaccurate.

Thus the old counter's scope genuinely expanded when a previously omitted workload was restored. The extra ten observed builds are not, by themselves, evidence of a new runaway planner or redundant queue execution. Restoring the old omission to achieve total 3 would violate the current complete-readiness contract. Further production optimization may be possible, but this trace does not justify making it a prerequisite merely to preserve a measurement that excluded those evaluations.

This also corrects stale wording in my earlier `independent-direct-planning-design-review.md`: preserve the **current owner-observed publication advance** and its identity transition. Do not restore the retired no-table-write competing winner probe. The current source and test already carry the f95 supersession.

## Complete replacement oracle

Keep the global counter; never filter invalid or unattributed builds out of the measured population. For both cold and advance phases:

1. Declare the expected five node IDs independently from the observed results (the fixture's NODE_COUNT/node identities). Do not derive N from however many evaluations survived.
2. Require exactly one fresh DIRECT evaluation for every expected node, with no duplicates, unknown nodes, missing nodes, or residual frame scopes. Verify each evaluation actually calls the real owner and produces that node's readiness observation.
3. Require exactly two counted builds in each expected node frame, exactly three outside fresh-node frames, and exact total `3 + 2 * N` (13 here). Every event must be consumed exactly once by that accounting. The retained three-build constant must be explicitly named/described as the candidate-owner component; it is no longer the whole-call total.
4. Preserve fresh identity after canonical publication advance, stable identity before/after, and zero builds on stable repeats. Preserve the independent fixed-point, source/currency/fence, complete-domain, and authority-denial controls.
5. Add discriminating accounting controls: omitted fresh-node work must fail even when the total falls to 3; duplicate/extra fresh work, an unknown/unattributed event, and a missing expected node must fail. A measurement negative may clone/corrupt a real captured vector, but at least the retained legacy-omission schedule should demonstrate that skipping the actual fresh work cannot satisfy the new oracle.

The unchanged whole-rig exact bounds may separately tighten 585 to 565 and 3184 to 3164 after final proof. Keep the original workload, all nested fresh evaluations, and winner-read measurement. Do not convert exact assertions to permissive inequalities or call this a universal resource model outside the declared fixture.

## Required R09 action

The old global-total claim must remain recorded as failed/superseded, not reinterpreted as though it always counted only the candidate owner. The currently sealed `readiness-direct-publication-planning-identity` also says historical exact-count changes may only tighten. A whole-call total changing from 3 to 13 is not a numeric tightening, even though the owner's three-build component and both whole-rig totals are preserved or improved.

Use the existing supersession lifecycle (`solve.js note --superseded ... --by <successor>`, then a successor seal with the bounded workload statement) before assertion changes, preserving the old Quest and failed logs. The successor should explicitly carry the two workload components, complete-accounting negatives, original authority/freshness/identity obligations, and downward aggregate ratchets. A comment or an appended assertion rationale alone must not rewrite the sealed blanket constraint. The governing owners are R09, `solver-quests.md:23`, and the existing solve `note --superseded` command; no new approval mechanism is needed.

Read-only review only: no tracked edits, tests, or lab jobs. Current two-file source bytes and all trace/history inputs are bound in `independent-publication-advance-accounting-inputs.json`, SHA256 `f69c52b1b1fa12a46babccfedf0640d6080acd4d40dc3d97e3da2b339fa06a13`. This approves the next proof design, not the still-evolving source/test package.

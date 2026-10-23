---
audience: development
documentClass: evidence
---

# Independent MG fixture lifecycle and trace review, 2026-10-23

Reviewer: `subagent:/root/retained_effects_review`.
Author: `subagent:/root/mg_delivery_design`.
Worktree: `/mnt/data/peter/projects/.worktrees/mg-delivery-fixture-trace-20261023`.
Base HEAD: `21cfd917d8ceb2f0c1435cade117c0c44a91a03a`.

## Verdict and frozen scope

**APPROVE the one-file fixture repair for non-main preservation and an exact
baseline lab measurement only.** No material source finding remains in this
bounded delta. Generated metadata and the final preservation manifest still
require the parent's subsequent freeze and independent consistency check.
This is not an observed native red, passing implementation, MG production
approval, Quest closure or merge readiness.

The sole changed source-controlled path before this review is
`test/message-group/message-group-native-custody-handoff.test.js`, SHA256
`e79594a05218b9bbfa6ecc16b183d662c1a5d8e8750581ed540872faa0689ff2`.
Its exact `git diff -- <path>` SHA256 is
`bfa737c363c0de911a8ced9980a109c0be4b0f4c45ff9866c5a2806c1136aef3`.
Both supplied identities match independently. `git diff HEAD -- src` is
empty. This reviewer changed only this new evidence file and ran no local
test or application runtime; `node --check` and scoped `git diff --check`
passed without loading the test module.

## Actual lifecycle and the earlier failure boundary

The original #986 log establishes S1 and a settled subscriber hold but does
not carry its caught cause; its absence of recipient ingress remains
explicit. Source inspection independently identifies a missing lifecycle
premise: the propagation constructor sets CREATED
(`src/topology/cdc-group-propagation-service.js:69`), and propagation's first
action calls `ensureInitialized` (`:193`), whose assertion rejects CREATED
(`:696`). `assertCritical` throws an actual Error marked `isCritical`
(`src/utils/assert.js:9`). The old fixture instantiated these owners without
calling their lifecycle methods. This source finding is not a retroactive
claim that #986 dynamically recorded that exact exception or that no other
refusal can follow it.

The replacement calls the two actual `initialize` methods, then tree
`start({recomputeImmediately: true})` and propagation `start`, and observes
both owners' RUNNING state through `getStats`
(`handoff.test.js:268-275`). It never assigns lifecycle state or fabricates
readiness. These are synchronous existing owner methods. Their dependency
validation and start order match the two component portions of
`LatencyTopologySetup.create/start`
(`src/bootstrap/shared/latency-topology-setup.js:87-108,132-135`). This is
appropriately a two-owner component fixture, not a claim to construct the
whole production topology assembly or its separate measurement/assignment
owners.

The two newly imported state enums are actual named exports of
`cdc-group-propagation-constants.js:89` and `latency-tree-constants.js:54`.
Existing imports retain the previously reviewed source surfaces. No new
production export, fake capability or alternate initialization path is added.

## Diagnostics preserve the owner decision and native cut

`recordOwnerFailure` retains the original thrown object in fixture-local
`ownerFailures` and emits portable named error diagnostics
(`handoff.test.js:221-234`). `observeOwnerCall` returns the actual result,
records a caught failure and executes `throw error` with that same object
(`:237-248`). The readiness wrapper invokes the actual subscriber's existing
synchronous `canAcceptCDCEvent`, returns its unchanged result, and rethrows
the original exception (`:302-310`). The subscriber has no other exported
callback properties that this wrapper drops
(`partition-cdc-propagation-subscriber.js:230-295`). No exception becomes
success, no source-debt decision is copied and no ACK is manufactured.

The async selection, bridge and subscriber boundaries are separately named.
Extra promise settlement around these observation calls does not move the
critical RF1 observation: recipient native history is read in the original
immediate continuation after `await bridge.propagatePartitionCDCEvent`,
inside the inner operation, before the outer observation promise settles
(`handoff.test.js:290-297`). There is no intervening native pump or clock
advance between bridge return and `view(f)`. The original capture is not
replaced with a later, potentially committed frontier.

This review covers the existing owner Errors and ordinary structured
results traversed by this fixture. It does not certify arbitrary hostile
accessor/prototype behavior or general error serialization. Fresh lab output
must still expose any actual selection/readiness/bridge refusal and distinguish
it from the intended native predicates.

## Cleanup and unchanged acceptance

The topology cleanup hook is registered before either initialization/start
(`handoff.test.js:258-266`). It attempts both real stops even if one rejects
and reports the collected original failures in an AggregateError. On current
source, propagation stop synchronously closes its state, clears owned retry
and batch timers, settles pending batches and releases retry sleeps
(`cdc-group-propagation-service.js:175-183`,
`cdc-group-propagation-lifecycle-methods.js:18-38,76-90`). Tree stop unregisters
its owned cache listener and closes its state
(`latency-tree-service.js:120-127`). Cleanup therefore covers the additional
listener/lifecycle this fixture now starts, including partial setup failure.
Existing producer/recipient cleanup and directory retention behavior are
unchanged. Actual successful teardown remains a lab obligation.

I mechanically compared the complete RF1/RF3 acceptance bodies with the base
after replacing only each `subscribe(f, producer)`/old cleanup registration
with `subscribe(t, f, producer)`: they are identical. Every pre-subscription
helper and constant from `KEY` through `report` is also byte-identical.
Source CUT_OVER/QUERY/debt evidence, exact event checks, native receipt/frontier
checks, source ACK checks, native leader loss/suffix replacement, redrive and
custody assertions have not been weakened or removed.

The unchanged scheduling fixture SHA256 is
`2806d3980b7b4b0392c79e2924984fb23e26147c5c27a3ed2e5d7a9409ff3012`,
equal to its base blob. Native pump rounds, microtask count, setup/loss rounds,
clock advancement and the 10000 ms source budget are unchanged. The repair
does not strengthen the schedule to force the intended predicate to fire.

## Category-complete disposition and next evidence

| Category | Disposition |
| --- | --- |
| Admission/gating | Real source release and ordinary SQL path unchanged; no opening or readiness override. |
| Harness fidelity | Actual lifecycle supplied; exact frozen native predicates retained. Their measured engagement is pending. |
| Transport/delivery | Return/error objects preserved and native frontier capture stays at the real bridge return; no new receipt or wire proof. |
| Recovery/replay | Existing RF3 loss/redrive body unchanged and still requires a measured native occurrence. |
| Concurrency/retry | Observation wrappers add no driver or claim; source lane and native transport schedule unchanged. |
| Formation circularity | No S2/W7 composition or original-startup authority claim. |
| Owner interaction | Existing topology initialization/start/stop boundaries are consumed; subscriber delegates remain real. |
| Hostile contract input | No change to canonical semantic vectors; this fixture trace does not expand their proof scope. |
| Cleanup | Both newly active topology components have registered cleanup with aggregated failures; runtime confirmation remains required. |

Preserve the failed #986 attempt and full original log. After final metadata
and manifest review, run the exact baseline candidate through the locked lab.
It must repeat S1 and demonstrate which actual boundary the native witnesses
reach. A setup or typed subscriber refusal remains a prerequisite finding;
only the named RF1 receipt and RF3 native custody assertions can establish
their intended semantic reds. All prior W1-W9, pressure/response-loss,
historical classification, complete-cohort opening, activation/transfer,
two-start and full-Quest gates remain outside this source-only approval.

The frozen file and diff hashes are rechecked after this evidence write.

## Final R1 manifest review: REVISE one new complexity violation

The preceding semantic inspection remains applicable, but **REVISE the final
four-file candidate before preservation/lab** for one newly exposed source
quality finding, F1. This final disposition supersedes the earlier provisional
one-file approval until the diagnostic function is simplified and the exact
candidate is frozen again.

The four-file manifest
`MANIFEST-mg-delivery-fixture-trace-r1-2026-10-23.json`, SHA256
`c8167d5ededf85fb28897b718487052cba562dfa6b13a5bb34d2f2e666ecac2d`,
equals `/tmp/mg-delivery-fixture-trace-manifest-r1.json`. All four recorded
byte lengths/hashes match the worktree, and all hashes match the staged
index. Root staged the source during this final check, so the unstaged diff
became empty; the base-bound diff from `21cfd917` still has the exact approved
`bfa737c363c0de911a8ced9980a109c0be4b0f4c45ff9866c5a2806c1136aef3`
hash and both file/index retain `e79594a0...`. Staging did not change source
bytes or this review's base.

**F1: `recordOwnerFailure` adds avoidable new complexity debt.** The normal
generated report `test-output/analysis/complexity-src-test.json` names this
new function at `handoff.test.js:221`, complexity **17**, maximum **12**.
The final inventory increases observed/assigned complexity 1811 to 1812,
adding this test file to the debt population. This increment is attributable
to the newly written diagnostic extraction, not the existing repository
overage. Simplify or extract that field construction while retaining all
recorded fields, original error-object retention and exact rethrow. Do not
raise a baseline or describe the new entry as inherited debt. This is a
bounded quality correction; no wider lifecycle or acceptance redesign is
requested.

The other generated deltas correspond to the reviewed imports: import-graph
edges increase 29210 to 29212, the impact seal refreshes its source/input/
snapshot identities with unchanged resolver identity, and subsystem metadata
adds the actual propagation constants dependency and refreshes its observation
digest. Subsystem census remains 2444 with unchanged class digest. Source
duplication and test duplication counts remain 47/1462 and 701/26618.
No production source or ratchet baseline is changed. The parent's normal
hook output is 3310 bytes, SHA256
`b68720f950334723199b0a875a06236ce94b715ec6dfdec0fc979da3398609a0`;
its successful completion does not make F1 existing debt or prove a native
runtime boundary. Regenerate the report/metadata after the narrow repair,
then recheck the new source and final manifest without repeating the
unaffected semantic review.

## R2 bounded correction and final manifest: APPROVE for baseline measurement

**APPROVE R2 for non-main preservation and an exact baseline lab attempt.**
F1 is resolved. No remaining material finding was found in the bounded R2
delta or its generated metadata. The earlier lifecycle, exact-error,
native-cut and nine-category review remains applicable. Native runtime
engagement is still unexecuted for these bytes and must be measured; this
approval does not establish an intended RF1/RF3 red or authorize a production
implementation.

The final four-file manifest is
`MANIFEST-mg-delivery-fixture-trace-r2-2026-10-23.json`, SHA256
`8fbaec25e9f2c22323d2d1d5a52bf087b85cbce10b1b80b429655574222cc733`.
Its preserved copy equals `/tmp/mg-delivery-fixture-trace-manifest-r2.json`.
Every recorded worktree length/hash and every staged index hash matched
independently before this append and is checked again afterward. Test SHA256
is `0c5225055f319df6440cc56028d178a7f16fffd406f169dac6d9e27f6b7a7e9b`;
its diff bound to base `21cfd917d8ceb2f0c1435cade117c0c44a91a03a` has SHA256
`127f7f018d05733cecaed973c8513b7c9f420580abe682d51650321afe80e62b`.
Production remains byte-unchanged from that base.

For an exact bounded comparison, I read the retained R1 Git blob
`f6ce368d2` and independently confirmed its SHA256 is the reviewed
`e79594a05218b9bbfa6ecc16b183d662c1a5d8e8750581ed540872faa0689ff2`.
The only R1-to-R2 test change extracts `ownerErrorIdentity` and
`ownerErrorDisposition`, then spreads their returned diagnostic records in
the original property order. Each field access, default expression and
boolean comparison is unchanged. The original error object is still retained
before observation and the same caught object is rethrown. There is no change
to lifecycle calls, readiness delegation, bridge-return capture, acceptance
assertions, timers, pumps or budgets. Static syntax and scoped whitespace
checks pass without loading or executing the test module.

The refreshed full complexity report has threshold 12, count 1811 and no
entry for the modified test. Inventory observed/assigned complexity returns
to the base's 1811; source/script duplication remains 47 groups/1462 lines
and test duplication 701 groups/26618 lines. No baseline changes. The
repository's inherited aggregate excess remains debt and is not certified
away by this fixture review. The normal R2 hook log is 3310 bytes, SHA256
`b68720f950334723199b0a875a06236ce94b715ec6dfdec0fc979da3398609a0`.

The subsystem observation dependency change is identical to R1, with census
2444 and unchanged class digest. The import graph/impact seal refresh binds
the refactored bytes; resolver state is unchanged and snapshot digest is
`c3c1e0d56c8c51c59250e42532308c296399bb93e541478a2dad68c1d32c505c`.
These generated identities are not native runtime evidence.

The earlier rejection and R1 manifest remain retained. The pre-append review
prefix is 11064 bytes, SHA256
`4973bd3d531943b822132ae1863c22b52dc33df69f57855a76189b715671fd99`.
Preserve and verify the exact committed manifest blobs, then measure the
same unchanged native predicates through the locked lab. Keep #986's actual
earlier failure and all outstanding proof gates explicit.

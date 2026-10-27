---
audience: development
documentClass: evidence
---

# VERIFY d1e durable-only propagation, round 1 (2026-10-25)

Independent verifier: Fable. I wrote none of the unit. Nothing in
`/mnt/data/peter/projects/lagrange` or in the implementer's worktree was
edited; all runs were in detached scratch worktrees under the scratchpad
(`verify-d1e/head` = 2e26c3ddf, `verify-d1e/base` = 747a5f80a,
`verify-d1e/shim` = 747a5f80a + head test files + one src shim), `node_modules`
symlinked from the primary checkout; the worktrees are removed at the end.

## Verdict: REQUIRED CHANGES (exact)

The deletion is sound: the reachability argument reproduces, every deleted
symbol is gone from src/test/scripts/data (two stale baseline rows aside), the
shim witness is reproduced exactly, the ratchets hold and both tightenings are
hint-driven, metadata has zero drift, and every topology/CDC/readiness leaf I
ran is identical at head and base except the rewritten topology files. One
change-caused regression blocks APPROVE:

**RC1 (code, required).** `test/message-group/message-group-service-strict-cdc-forward-routing.test.js`
does not load at 2e26c3ddf. Its line 40 imports
`buildCriticalVisibilityCdcPropagationReplacePendingKey` from
`src/cache/cdc-propagation-delivery-profile.js`, which this unit de-exported
(`src/cache/cdc-propagation-delivery-profile.js:305`, the one-line diff). Node
refuses the module at link time (`SyntaxError: The requested module ... does
not provide an export named 'buildCriticalVisibilityCdcPropagationReplacePendingKey'`,
my run `verify-d1e/logs/strict-forward-head.tap`; the lab saw the same,
implementer `d1e/lab-head.log:1938`). At base the file runs 13 cases with one
pre-existing red (`verify-d1e/logs/strict-forward-base.tap`: 12 ok, #12
`buildPeerAddress prefers the consensus configuration peer address` red
locally; on the lab the pre-existing red was #1 "Unable to resolve unified peer
address"). Among the 12 lost green cases is
`critical CDC replica-operation forwards carry a row replacement key`
(`:625`), the only witness that the forwarding owner passes the replace key
(`src/message-group/message-group-forwarding-owner-delivery-methods.js:548,619`,
which still reads `deliveryProfile.replacePendingKey` in production). The
de-export was not hint-driven: the builder is in neither knip unused-export
list (`verify-d1e/logs/ul-base.txt`, `ul-head.txt`: 0 matches), because
`knip.json` treats `test/**/*.test.js` as entries. Fix at the owner, either:

- (a) restore the export at `src/cache/cdc-propagation-delivery-profile.js`
  (knip never counted it unused, so the 1415 ratchet is unaffected; re-run
  `node scripts/check-unused-exports.js` to prove it), or
- (b) keep the de-export and make the test consume the owner's exported
  resolver instead of the private builder:
  `resolveCdcPropagationDeliveryProfile([{tableName, operation, data}]).replacePendingKey`
  at `:625` and drop the import at `:40`. (b) matches "Test Doubles Consume the
  Owner" (`test/guidelines/fixtures.md:131`) better; (a) is acceptable.

Either way the file must load and run its 13 cases with only the pre-existing
red, at head and on the lab host.

**RC2 (record, required).** The lab classification "45 red at base with
identical leaves" is wrong for this file: base ran 88 assertions and failed one
case; head ran 0 assertions and failed to load. Append the correction to the
verification record (R21 append, never edit the earlier entry) together with
the corrected counts below.

Everything else is APPROVE-grade with the findings in section 4.

## 1. Identity

| Item | Value |
| --- | --- |
| Commit verified | `2e26c3ddf2ba1e227d65ce811ee49d8e8fd70c6f` on `work/cdc-propagation-durable-only-20261025` |
| Parent (base) | `747a5f80aeb11cecc1d79a30e8df07d93ec16a9e` |
| Lab snapshot | `refs/wip/lab-d1e-1` = `d0d37393f55db7caf81b86c290b6957c9259c042` |
| Lab base probe | `refs/wip/lab-d1e-base-1` = `59ffdf1913c2b965724cc34090d9db5dc761e774` = 747a5f80a + a 2-line marker in 46 test files (92 insertions, no src) |
| Amend delta d0d37393f -> 2e26c3ddf | NOT only the hang guard: 3 files. `test/topology/cdc-group-propagation-foreground-boundary.test.js` (+import `scaleByMachineFactor`, `TEST_TIMEOUT_MS = scaleByMachineFactor(3000)` was 2000), `test/shards/impact-graph-seal.json` (digests follow the new import edge), `solve/changes/global-owner-debt-inventory/inventory.json` (268+/347-, regenerated). The two metadata files are consistent with the test edit (my `test:metadata:refresh` at head reproduces the committed seal digest `1139f32c...` with zero drift). |
| Diff sizes | src 9 files +97/-1291; test 20 files +499/-3429; scripts 2 files; 32 files total +869/-5070 (incl. inventory.json) |

## 2. Per-claim table

| # | Claim | Verdict | Evidence (file:line at 2e26c3ddf unless stated) |
| --- | --- | --- | --- |
| 1 | Unreachability of the non-durable branch | **HOLDS** (reproduced independently) | Only two `.propagateCDCEvent(` callers in src: `src/bootstrap/owners/seed-runtime-bridge-owner.js:211-215` (after the compatibility override at `:201-204`; no src site ever sets an override: grep `setCompatibilityOverride` = 0) and `src/bootstrap/node-joining-publication-activation.js:724-728`; both forward `{...copyCdcEvent(cdcEvent), sourceMessageGroupService, deliveryContext}`. `propagatePartitionCDCEvent` reaches them from exactly four option-closures, each handed to `buildPartitionCdcPropagationSubscriber`: `bootstrap-service-replica-registration-methods.js:206/225`, `phases/seed-cache-hydration-cdc-subscription.js:62/79` (via `bootstrap-service-seed-delegates.js:320-322` and `phases/seed-cache-hydration-phase.js:725-731`), `node-joining-publication-activation.js:307/323`. The subscriber calls it only at `shared/partition-cdc-propagation-subscriber.js:236-240` with `(service, cdcEvent, deliveryContext)`. Subscriber entry is `partition-cdc-delivery.js:487` `deliverCDCEventToSubscriber`; a durable event with no context gets one at `:488-489` (`deliverCapturedCdcEvent` `:56-69`). Live producers into it: the obligation lane (`partition-cdc-obligation-delivery.js:180-191` `eventOf` stamps `eventKey`; `:478` passes the scoped invocation) and the handshake sliding window (`partition-cdc-delivery.js:641-654`), which replays events recorded by the wrapper at `:521` (the lane's durable event; `markReplayOnlyCdcEvent :104-109` adds a flag, keeps `eventKey`). The buffered replay `:423` reads a buffer whose only writers are inside `generateCDCEvent` (`partition-service-cdc-stream-base.js:129-219`, delivery at `:190`), gated on `sideEffectPlan.emitCdcEntry` which is `null` at every plan site (`partition-write-kernel.js:543,566`, `partition-service-raft-write-commit.js:216`). Seed hydration (`seed-cache-hydration-phase.js:415`) calls `leaderMessageGroup.applyCDCEvent` directly and never the propagation service. So `hasDurableCdcEvents([options])` is always true in production. No `applyCDCEvent` reader remains in `src/topology`, `src/cdc` or the subscriber (grep = 0). |
| 2 | Deletions and the new request contract | **HOLDS** | Service: `cdc-group-propagation-service.js:165-203` is request contract -> stopped typed unknown -> `propagateDurableCdcEvent`. `assertPropagationRequest :185-203` requires `groupId`, `raft`, `cdcCommitLifetime`, `resolveStrictCdcForwardRetryAfterMs`, `applyCDCBatch`, payload, and `hasDurableCdcEvents && isCdcDeliveryInvocation(deliveryContext)` (new `MISSING_DURABLE_EVENT`, constants `:82-83`). Stopped answer `:170-173` = `{...unknownCdcAcceptance(), reason: PROPAGATION_STOPPED}` (`unknownCdcAcceptance` = `{success:false, error:UNKNOWN, deferRetry:true}`, `cdc-delivery-outcome.js:332-334`; the lane treats it as it treated the old `{success:false, status:'delivered', deliveryFailures}`: not committed, not provisional -> UNKNOWN with deferRetry, `partition-cdc-propagation-subscriber.js:183-190`). Grep of every deleted constant/method over src, test, scripts, data: 0 hits for GROUPED_DELIVERY_FAILURE/RECOVERED, BACKGROUND_RETRY_PENDING, CDC_GROUP_FOREGROUND_DELIVERY_STATE, CDC_GROUP_FOREGROUND_CONTINUATION, PROPAGATED_GROUPED/SAFE, FANOUT_SKIPPING_KNOWN_GROUPS, GROUPED_DELIVERY_FAILED, resolveKnownMessageGroupIds, resolveSourceMessageGroupId, propagateSafe, recordSafeFallback, buildStoppedPropagationResult, buildStoppedFailures, clear*Timers, immediateBatch*, backgroundRetry*, scheduleBackgroundRetry (src), normalizeDeliveryEvents, resolvePropagationTrafficGate, buildDeferredFailures, convertFailuresToRetryTargets, reportCdcPropagationBackgroundRetrySpent, cdcGroupSafeFallback, groupedDeliveryFailureCount, lastSkippedFanoutSignature, createSourceMessageGroupService, STATUS_DELIVERED. Residuals: stale baseline rows (F6), the postgres-baseline regex (F4), a historical census doc (F7), `BACKGROUND_MAX_ATTEMPTS` as a string in `scenario-certification.test.js:970,980` (F7). |
| 3 | `publicationModeOf` fix (repair_only for CONFIG_SAFE_MODE) | **CORRECT one-owner fix; a live behaviour change; witnessed; record it** | Base `durable-delivery.js` published `CONSERVATIVE_FANOUT` with reason `config_safe_mode` at wave start; the next plan capture (`durable-plan.js:15` -> `service.js:224-228 refreshConfig`) re-published `REPAIR_ONLY`, so two transitions per event (reproduced: shim run `verify-d1e/logs/shim2-cdc-group-propagation-service.test.js.tap` case 2 shows `repair_only->conservative_fanout->repair_only`). Safe mode is the production default (`src/config/config-definitions.js:193`). Readiness classifies `conservative_fanout` as DEGRADED (`control-plane-readiness-runtime-authority-methods.js:51-53`: healthy iff GROUPED or REPAIR_ONLY+config_safe_mode; reasons `METADATA_PUBLICATION_DEGRADED` at `control-plane-readiness-evidence-reasons.js:239-247`; managed split defers on it, `managed-split-admission-reliability.integration.test.js:577`). So at base every in-flight wave degraded readiness. The fix (`durable-delivery.js:172-179,204`) publishes the mode the deleted volatile branch published for the same case (base `service.js:213-216`), i.e. the unification keeps the correct semantics on the surviving path: in scope. Witness: service.test #2, red on base via shim, green at head. Should also be an explicit finding/decision entry in the quest log (R17), not only a commit-message bullet. Minor R03 note: "config safe => repair_only" is now decided at three sites (`service.js:87-95`, `:224-228`, `durable-delivery.js:175-179`); one owner function would be cleaner (pre-existing pair + 1). |
| 4 | Tests: rewrite/fold/delete; the five property files | **HOLDS; no live property lost its only witness** | The five deleted files witness `scheduleBackgroundRetry` or the ordinary `deliverToTargetsWithRetry` directly (grep at base: `eventKey`=0, `deliveryContext`=0, `propagateCDCEvent`=0 in all five; `scheduleBackgroundRetry` 8/8/4/7/4). Green at base (1/3/1/1/2 cases, `verify-d1e/runs/base/summary.txt`), i.e. they proved a mechanism that no longer exists. Durable equivalents at head: bounded termination -> foreground-boundary cases 4-6 (ATTEMPTS_EXHAUSTED / INSUFFICIENT_DURATION, `assertNoHeldWork` after each: `retrySleepReleases.size===0`, `activeDurablePropagation===null`) and stop-arms-nothing's 9 lanes (owner work ledger: no pending/referenced owner timer, bookkeeping empty, nothing created or run after stop); retry preservation -> service.test #6 (refusal retried until the committed receipt, source applied once) and foreground #7 (ADVANCE then provisional coverage); closure/payload retention -> the durable owner holds no payload between attempts by construction (`durable-delivery.js:1-3`, `cdc-propagation-progress.js:1-3`), the only two holders are asserted empty after every outcome, and the census leg proves the only `setTimeout` is `armPropagationTimer` (no timer closure can capture a payload). There is no WeakRef-style witness that the event reference is released after a wave; none existed for the durable wave before either, and the deleted one targeted a setTimeout closure that no longer exists. stop-settles-deliveries (6 base cases, all via `deliverToTargetsWithRetry` ordinary waves) folds into stop-arms lanes 1-2 (after stop), 6 (attempt in flight), 7 (retry delay), 8 (LatencyTopologySetup.stop). Base service.test had 19 volatile cases (batching, background retry, safe fallback); base foreground-boundary dropped 2 `ordinaryFixture` cases (`base :142-170`), both volatile. |
| 5 | One source double; owner builders | **HOLDS** | `test/topology/cdc-group-propagation-service-harness.js:85-105` is the one durable double; `createDurableCdcEvent :110-124`, `createDurablePropagationRequest :134-137` (invocation through `beginCdcDeliveryInvocation` on a `VirtualTimeSource`), `committedTargetAnswer :141-147` (`buildTransportDeliveryOutcome` over `buildCommittedCdcOutcome`). `test/test-helpers/cdc-topology-progress-fixture.js:62-67` consumes the harness double. `createSourceMessageGroupService` and `waitForCondition` gone (grep 0 in test/topology). |
| 6 | Ratchets | **HOLDS; both tightenings hint-driven** | Unused exports: head `1415/1415` (`verify-d1e/logs/unused-ratchet-head.log`); base `1415/1416` with the printed hint "Baseline can be tightened from 1416 to 1415" (`unused-ratchet-base.log`) - so the slack pre-exists the unit and the tightening follows the hint; the knip export lists at base and head are identical (335 files, `diff` empty). [test] duplication: head `679/679`, `25717/25717`; base `689/692`, `26148/26237` with the hint; the implementer's pre-tightening head log printed "can be tightened from 692 to 679" (`d1e/static/test:duplication.log`) - hint-driven, not a raise. Scoped complexity on the 8 owner files: base 6 violations, head 2 (both `cdc-group-propagation-routing.js:34,140`, pre-existing); cognitive base 1 (38) -> head 0. Cycles `0/0`. `audit:impact-contracts` PASS (71 contracts). `audit:shards` current. `audit:file-size` rc=0. `test:metadata:refresh` at head: `git status --porcelain` empty (zero drift), snapshot digest equals the committed seal. Hot-path audit 0 found. Decision-boundaries audit: identical output base/head (24 pre-existing violations, none in topology, rc=1 at both) except `Matched 751 -> 748` inherited rows (F6). |
| 7 | Lab carinas-windows | **PARTLY HOLDS; counts and one leaf differ** | From `d1e/lab-head.ndjson`: 617 entries of which 2 are `test-output/tap-timeout-fixtures/*` artifacts -> 615 files, 569 ok, 46 red (implementer: 610/564/46). Base probe `lab-base.ndjson`: 150 files, 104 ok, 46 red. Red file sets are identical. Per-file first-failure leaves differ for 2 of 46: `message-group-service-strict-cdc-forward-routing` (RC1: base "not ok 1 - Unable to resolve unified peer address", 88 assertions; head "no assertions executed") and `cdc-group-propagation-foreground-boundary` (base "not ok 5", head "not ok 1": the 2000 ms hang guard on the slow host hit a different case; so this file was red at base too, and "one change-only red" is not exact). The scaled guard was not re-run on the lab (unknown); locally at head 5/5 runs green, 7/7 each (`verify-d1e/runs/fg-repeat/summary.txt`). |

## 3. Shim witness (typed refusal against base src)

Shim tree = 747a5f80a src + head's `test/topology/{service-harness,service.test,stop-arms-nothing.test,foreground-boundary.test}.js` and `test/test-helpers/cdc-topology-progress-fixture.js`, plus one src edit in base `cdc-group-propagation-service.js:372-376` dropping the `applyCDCEvent` requirement from `assertPropagationRequest` (so the durable double reaches the base durable wave). Without the edit all three files are wholesale red on base (`verify-d1e/logs/shim-*.tap`, identical to the implementer's `d1e/redbase/cdc-*.tap`). With it (`verify-d1e/logs/shim2-*.tap`), matching the implementer's `d1e/redbase/shim-*.tap` exactly:

- service.test: 6/9; red #2 (publication mode flaps), #8 (typed refusal: base accepts the volatile and batchless sources and dies in the wave with `TypeError: progress.source.resolveStrictCdcForwardRetryAfterMs is not a function`), #9 (stopped answer lacks `deferRetry`).
- stop-arms-nothing: 9/11; red #1, #2 (call after stop: `deferRetry` undefined at base).
- foreground-boundary: 7/7.

## 4. Findings

- **F1 (RC1) Regression:** `message-group-service-strict-cdc-forward-routing.test.js` unloadable at head (see verdict). No static gate catches a missing named export: eslint passes on the changed files (the test file is unchanged), knip `--include exports,unresolved,unlisted` reports nothing (`verify-d1e/logs/ul-head.txt`; unresolved check rc=0). Only running the file shows it, and the lab did run it (`lab-head.log:1938`); the triage filed it under "red at base".
- **F2 (CL-014 skipped-fanout warning):** `recordSkippedFanoutGroups` was called only inside `propagateSafe` (base `service.js`), so for durable events it was already dead at base; deleting it with its only caller loses no live observability. The durable plan re-observes targets during a wave (`cdc-propagation-progress.js:37-61`, witnessed by `partition-cdc-topology-progress-currentness` cases 8 and 11), but a group KNOWN to the cache yet not ACTIVE-with-address still receives no warning. If the owner wants that census it belongs in `cdc-group-propagation-durable-plan.js`. Not required.
- **F3 (`replacePendingKey`):** the durable wave never passed it (`durable-delivery.js:73-85` passes `deliveryPriority`/`deliverySource` only), at base and head alike. That is defensible: the router's replace semantics supersede the older pending item (`message-router-outbound-delivery-registry.js:378-406`, `buildSupersededPendingResult`), which for a durable per-event receipt would only turn one event's wave into an unknown answer and a retry. The profile field is live through the forwarding owner (`message-group-forwarding-owner-delivery-methods.js:548,619`). So: not a defect in the wave; the field is not dead; the builder's de-export is the defect (RC1). Owner decision pending: whether the forwarding owner's coalescing is wanted for durable forwards.
- **F4 (`CDC_SAFE_FALLBACK` regex):** `test/distributed/scenarios/postgres-baseline-comparison-constants-and-imports.js:329-330` matches `/falling back to safe cdc propagation mode/i`; the deleted log text was "Falling back to direct-fanout CDC propagation strategy", so the classifier matched nothing at base either. Dead harness config, pre-existing; delete with its class constant (`:312`, `postgres-baseline-config.js:41`) in a harness unit. Not required here.
- **F5 (behaviour change record):** claim 3's fix changes what readiness observes in configured safe mode on every wave. It is correct and witnessed; it should be a quest-log finding/decision entry, not only a commit bullet (R17). Not blocking.
- **F6 (stale baseline rows, no hint printed):** `scripts/check-guideline-decision-boundaries-baseline.json` still names `recoverGroupedDeliveryFailuresWithSafeFanout` (`:7124`) and `deliverToTargets` (`:7115`) (+1 more topology row: matched 751 -> 748); `scripts/check-guideline-hot-path-diagnostics-baseline.json` names `scheduleBackgroundRetry` (`:388`) and `rescheduleBackgroundRetryEntry` (`:415`) (matched 29 -> 28). The checkers print no tightening hint, so CLAUDE.md's rule does not force it; recorded debt.
- **F7 (historical census coupling):** `solve/epics/raft-rs-full-cutover/census-bounded-waits-2026-10-04.md:214,549-551` lists the deleted background wait; `test/distributed/harness/__tests__/scenario-certification.test.js:970,980` asserts that census row exists. The doc is history (R21: do not edit); the test couples a policy check to a wait that can no longer occur. Inert; note for the certification owner.
- **F8 (counts):** lab counts in the claim (610/564/45) do not match the ndjson (615/569/46, see claim 7). Record the ndjson numbers.
- **F9 (base runner artifact, informational):** under `node --test` the base `service.test.js` (a `tap`-based file) reports every case `ok ... # SKIP` although the cases ran (their `wait_bound_spent` logs are in the TAP, `verify-d1e/runs/base/test_topology_cdc-group-propagation-service.test.js.tap:6-8`); the file contains no skip. Head's rewritten files use `node:test` directly, so the artifact disappears. Mentioned so nobody reads the base 19/19 as skipped tests.

## 5. What I ran (all logs under `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/c74561e1-2969-4696-bd5a-1d3a410f38a7/scratchpad/verify-d1e/`)

Thermal gate (`scripts/checks/wait-for-thermal-headroom.js`) before and between every file; one serialized test chain and one static chain, both gated; 64 C / 68 C at start, 57 C / 68 C at end.

- Tests at head and base, one file per process, `node --test --test-reporter=tap --test-timeout=300000` (the implementer's invocation; see Limits): 27 files at head (`runs/head/*.tap`, `runs/head/summary.txt`), 33 at base (`runs/base/`), per-test leaf diff in this report's claim 7 and section 2 row 4. Files: all `test/topology/*.test.js` (9 at head, 15 at base), `admin-cdc-propagation.integration`, `cdc-propagation.integration`, `managed-split-admission-reliability.integration`, `seed-teardown-pending-cdc-delivery`, `latency-topology-owner-delegation`, `control-plane-readiness-service-serve-refresh-and-publication`, `publication-readiness-churn-liveness`, `readiness-planning-publication-atomicity`, `readiness-planning-publication-version-key`, `partition-cdc-topology-progress-currentness`, `partition-cdc-delivery-progress`, `partition-cdc-invocation-custody`, `partition-cdc-obligation`, `message-group-native-provisional-route`, `message-group-native-custody-handoff`, `message-group-service-strict-cdc-forward-routing`, `cdc/cdc-delivery-outcome`, `distributed/harness/__tests__/scenario-certification`. Result: identical leaves everywhere except the three rewritten topology files (expected) and RC1. Pre-existing reds identical at head and base: admin-cdc-propagation (1/1), cdc-propagation (1/1), managed-split (#2-#4), progress-currentness (#1-#6, #11), delivery-progress (#3), native-provisional-route (1/1).
- foreground-boundary x5 at head: `runs/fg-repeat/summary.txt`, 5/5 green.
- Shim: `logs/shim-*.tap` (no src shim), `logs/shim2-*.tap` (with the request-contract shim).
- Static at head: `logs/unused-ratchet-head.log`, `unused-list-head.log`/`ul-head.txt`, `duplication-head.log`, `complexity-scoped8-head.log`, `cognitive-scoped8-head.log`, `cycles-head.log`, `impact-contracts-head.log`, `audit-shards-head.log`, `file-size-head.log`, `metadata-refresh-head.log` (git status empty), `audit-decision-boundaries-head.log`, `audit-hot-path-head.log`, `eslint-head.log` (rc=0 on every changed .js), `node --check` on every changed .js (clean). At base: `unused-ratchet-base.log`, `ul-base.txt`, `duplication-base.log`, `complexity-scoped8-base.log`, `cognitive-scoped8-base.log`, `audit-decision-boundaries-base.log`, hot-path (stdout only: matched 29).
- Lab: no new lab run; recounted `d1e/lab-head.ndjson` and `d1e/lab-base.ndjson` and read `d1e/lab-head.log`.

## 6. Limits

- Local runs used `node --test` per file (as the implementer did) rather than the committed `npm run test:file` runner, to avoid the runner's lab placement; the pass/fail leaves are from the files' own TAP.
- The lab was not re-run; the scaled hang guard is proven only locally (5/5).
- `audit:guideline:decision-boundaries` is rc=1 at both base and head for 24 pre-existing violations outside this unit; I did not run the whole `test:static`.
- The shim is my reconstruction (one `assertCritical` relaxed); it reproduces the implementer's `redbase/shim-*.tap` case-for-case, so I take it as the shim they describe.
- I did not run `npm test` (change-proof orchestrator) or `check:release`.

## 7. Unknowns

- Whether the forwarding owner's `replacePendingKey` coalescing is wanted for durable strict forwards (F3): owner decision.
- Whether `scheduleBackgroundRetry` rows and the third unmatched decision-boundary row should be pruned now (no hint printed).
- Lab behaviour of `foreground-boundary` under the scaled guard (not re-run).

---

# Re-verification r2 (2026-10-25): 745ea039d on e6295c7c4

Delta round. The branch was fast-forwarded to the lineage head `e6295c7c4`
(which now contains C2/C3, C6, F3 and the refusal owner) and the unit was
re-committed as one commit `745ea039d264dd104e2a0a9d197ed540d7d7feed`
(34 files +794/-4912; src 9 files +97/-1295). 2e26c3ddf is gone from the
branch. Scratch worktrees: `verify-d1e/head2` = 745ea039d, `verify-d1e/base2` =
e6295c7c4, `verify-d1e/mut2` = 745ea039d for mutations (all removed at the
end; no repository edits).

## Verdict r2: REQUIRED CHANGES (one, test-only, exact) - otherwise APPROVE

The production change is correct and the r1 regression is fixed. One item
meets the coordinator's stated criterion for a required change:

**RC-r2 (test, required).** The rewritten C2 witness
`test/topology/cdc-group-propagation-transport-outcome-failed-set.test.js`
does not pin the durable wave's consumption of the transport owner's
decision. Two mutations that make the wave ignore `isDelivered` while the CDC
receipt is valid leave it green (4/4 each):

- M1: `src/cdc/cdc-propagation-progress.js:130` `{transport: true}` ->
  `{transport: false}` (the wave observes targets with the plain CDC
  predicates). `verify-d1e/logs/mut-M1-transport-false-failed-set.tap`.
- M2: `src/cdc/cdc-delivery-outcome.js:336-339` `isCommittedCdcDelivery`
  returns `isCommittedCdcOutcome(...)` alone (transport ignored).
  `verify-d1e/logs/mut-M2-cdc-group-propagation-transport-outcome-failed-set.test.js.tap`.

M1 is caught by no test at all: the whole durable-wave set under M1 reproduces
the unmutated counts exactly (failed-set 4/4, service 9/9, stop-arms 11/11,
foreground 7/7, progress-currentness 5/7, delivery-progress 2/1,
invocation-custody 14/14, obligation 20/20, seed-teardown 1/1,
cdc-delivery-outcome 132/132, router round-trip 5/5;
`verify-d1e/runs/mut-M1/summary.txt`). M2 is caught only by the CDC owner's
unit test ("canonical local committed acceptance needs no transport ACK",
`test/cdc/cdc-delivery-outcome.test.js:60-66`), i.e. at the owner, not on the
wave. Cause (probe `verify-d1e/probe-discriminating-reply.mjs`, log
`verify-d1e/logs/probe-discriminating-reply.log`): the CDC owner's committed
predicate is an exact-field table (`cdc-delivery-outcome.js:133-141` +
`OUTCOME_METADATA_FIELDS :112-131`, matched by `outcomeFieldsMatch :166-170`)
that already rejects every reply carrying `noHandler`, `deferRetry: true`,
`retryAfterMs`, `errorCode`, `reasonCode`, `deliveryState !== 'delivered'` or
`acknowledged: false`; so for all four lanes `isCommittedCdcOutcome` is already
false and the transport check in `isCommittedCdcDelivery` never decides. The
witness's header sentence "only the transport owner's classification can keep
it uncovered" is therefore false for every lane it has. Across 15 candidate
replies through the real `MessageRouter` local dispatch, `isCommittedCdcOutcome`
and `isCommittedCdcDelivery` never disagree; the only discriminating input is
a bare committed receipt with no transport envelope (`buildCommittedCdcOutcome`
returned without `acknowledged`): CDC committed = true, transport = failed,
`isCommittedCdcDelivery` = false. The real router always stamps `acknowledged`
and `deliveryState`, so this input needs a router double.

Exact change: add one lane to the failed-set file in which the service's
`messageRouter.deliver` answers the failing target's address directly with
`buildCommittedCdcOutcome([payload], failing.groupId, {index: 1, term: 1})`
(no `router.deliver`, no transport envelope) while the delivered target still
goes through the real router; assert as the other lanes do (`result.success ===
false`, delivered target called once, failing target called >= MAX_ATTEMPTS).
This lane is red under M1 and under M2 (both would accept the bare receipt) and
green at 745ea039d. Correct the header comment to say that the four envelope
lanes are rejected by both the transport owner and the CDC owner's metadata
table, and that the bare-receipt lane is the one that pins the wave's
transport consumption. No src change.

## Per-item results

| # | Item | Verdict | Evidence |
| --- | --- | --- | --- |
| 1 | RC1 fixed | **HOLDS** | `git diff e6295c7c4 745ea039d -- test/message-group/message-group-service-strict-cdc-forward-routing.test.js`: `:40` imports `resolveCdcPropagationDeliveryProfile`, `:625-631` consumes `resolveCdcPropagationDeliveryProfile([...]).replacePendingKey`. Runs: head2 13 cases, 12 ok, only #12 `buildPeerAddress prefers the consensus configuration peer address` red; base2 identical leaves (`runs/head2`, `runs/base2`). Removed exports at 745ea039d (`buildCriticalVisibilityCdcPropagationReplacePendingKey`, `createSourceMessageGroupService`, `reportCdcPropagationBackgroundRetrySpent`, `resolveKnownMessageGroupIds`, `resolveSourceMessageGroupId`, `CDC_GROUP_FOREGROUND_CONTINUATION`, `CDC_GROUP_FOREGROUND_DELIVERY_STATE`): 0 importers in src/test/scripts (the harness `waitForCondition` is gone; the remaining `waitForCondition` hits are unrelated `src/query` helpers of the same name). |
| 2 | C2 interaction: the durable wave's per-target decision | **HOLDS in production (doubly guarded); witness unpinned -> RC-r2** | Decision site: `src/cdc/cdc-propagation-progress.js:124-139` `observe()`; a target leaf's answer goes to `observeCdcCoverage(answer, events, leaf.groupId, {transport: true})` (`cdc-delivery-outcome.js:351-363`): COMMITTED iff `isCommittedCdcDelivery` (`:336-339` = `isDeliveredTransportDeliveryOutcome(classifyTransportDeliveryOutcome(answer)) && isCommittedCdcOutcome(...)`), PROVISIONAL iff `isProvisionalCdcDelivery` (`:341-346`: `acknowledged`, no `noHandler`, `errorCode === null`, `reasonCode === TRANSPORT_DEFERRED`, and the provisional CDC shape), else UNCOVERED. The wave never reads a local flag for the decision; `deliverUncoveredLeaves` (`durable-delivery.js:88-114`) reads `answer?.success` only for the diagnostic `cause`. A FAILED, contradictory, no-handler or deferred transport outcome is UNCOVERED (probe: all such envelopes classify `failed`/`deferred`, `isCommittedCdcDelivery` false, and `isCommittedCdcOutcome` false as well), so `complete()` is false, `deliverToTargetsWithRetry` (`delivery-methods.js:25-43`) re-dispatches only the uncovered leaves (`nextUncoveredLeaf`, progress.js:92-104) up to `deliveryRetryMaxAttempts` within the invocation's remaining duration, and on exhaustion `result()` answers `{...propagationResult(.., unknownCdcAcceptance()), cause}` (`success:false, deferRetry:true`); the subscriber turns that into UNKNOWN/deferRetry (`partition-cdc-propagation-subscriber.js:183-190`) and the source lane keeps the obligation owed and redrives it (`held_by_subscriber`; witnessed end-to-end on the real ledger by foreground-boundary case 4 `assertDebtWithoutAck`). A FAILED outcome cannot count as delivered: it would need transport DELIVERED and a valid receipt, and both predicates reject every failed/contradictory/no-handler/deferred envelope (15 candidates, direct and via the router). Semantics 3 and 4 (no-handler replies and application deferrals are retried by the wave owner) hold on the one remaining path and are witnessed by the rewritten file; what the file does not witness is which owner decided (RC-r2). Pre-existing, not D1e's: the CDC owner's metadata table restates transport facts (`acknowledged`, `deliveryState`, `noHandler`, `retryAfterMs`, `errorCode`, `reasonCode`, `deferRetry`) rather than consuming `isDelivered` alone - a second version of the transport decision (R03) that the C2 rounds accepted. |
| 3a | Conflict resolution: delivery-methods | **HOLDS; nothing of C2 lost** | `git diff 2e26c3ddf 745ea039d -- src/topology/cdc-group-propagation-delivery-methods.js` is empty (D1e's r1 version kept). C2's whole topology footprint on the lineage (`git diff --stat 747a5f80a e6295c7c4` over `src/topology/cdc-group-propagation-*`, `test/topology/`): `delivery-methods.js` +6 (the import and the `isDelivered` check inside the deleted `deliverToTargets`, commit 7bf6ceecb) and the failed-set witness +98, plus impact-contract lists. The hardening's durable equivalent pre-existed at `progress.js:130` -> `isCommittedCdcDelivery`. The witness stays listed in `test/shards/impact-contracts.json:1458,3018`. The unit's own src patch r1 -> r2 differs only by that C2 hunk (`diff` of the two patches); the shared test patches are identical. |
| 3b | `scripts/check-duplication.js` 689/26148 -> 679/25717 | **hint-driven, not a raise** | base2 (e6295c7c4): `689/689`, `26148/26148` exact. With the baseline reverted to 689/26148 at 745ea039d the checker prints "Baseline can be tightened from 689 to 679 ... from 26148 to 25717" (`logs/hint-duplication-at-689.log`); head2 `679/679`, `25717/25717` (`logs/duplication-head2.log`). |
| 3c | `scripts/check-unused-exports.js` 1416 -> 1413 | **hint-driven, not a raise** | The lineage head still carried 1416 (the diff is 1416 -> 1413, as the script comment says; "1415 -> 1413" in the brief is not what the tree shows). base2: `1413/1416` with the hint "can be tightened from 1416 to 1413" (`logs/unused-ratchet-base2.log`) - the slack pre-exists at e6295c7c4; with the baseline reverted to 1416 at 745ea039d the same hint prints (`logs/hint-unused-at-1416.log`); head2 `1413/1413` across 334 files (`logs/unused-ratchet-head2.log`). |
| 4 | Re-runs | **HOLDS** | head2 (`runs/head2/summary.txt`): topology all green - foreground 7, service 9, stop-arms 11, failed-set 4 cases (3 assertions each), group-selection 6, latency-group-manager 7, latency-measurement 5, constants 1, tree 3, anti-entropy 5; seed-teardown 1/1; strict-forward 12/13 (#12 pre-existing); the 3 CDC integration files identical leaves to base2 (admin-cdc-propagation 0/1, cdc-propagation 0/1, managed-split 1/4 with #2-#4 red at both); progress-currentness 5/12 identical; readiness publication 13/13; native-provisional-route 0/1 identical. eslint on every changed .js rc=0 (`logs/eslint-head2.log`); `node --check` rc=0 (`logs/node-check-head2.log`); `test:cycles` 0/0; `audit:impact-contracts` PASS (71 contracts, 44 coupled pairs, sha256 5e7b3f65...); `audit:shards` current (2467 tests); `test:metadata:refresh` then `git status --porcelain` empty (zero drift; `logs/metadata-refresh-head2.log`). |

## Runs and limits (r2)

Same method as r1: one file per `node --test` process, thermal gate between
files, head2 then base2 (`runs/head2`, `runs/base2`), static chain serialized
(`logs/*-head2.log`, `logs/*-base2.log`), mutations in `mut2` with the tree
restored after each (`git status` clean, `logs/hint-mut2-status.log` empty).
Not run: `npm test`, `test:static`, any lab run. The r1 findings F2-F9 stand
unchanged; F5 (record the publicationModeOf behaviour change in the quest log)
and the RC2 record correction from r1 are not visible to me in this tree and
remain for the coordinator to confirm.

---
audience: development
documentClass: evidence
---

# DESIGN: fresh-seed activation (Quest `fresh-seed-activation`)

Epic `raft-rs-full-cutover`. Ordered by owner decision 2 of 2026-10-26
([owner review](../../epics/raft-rs-full-cutover/evidence/owner-review-2026-10-26/OWNER-REVIEW-2026-10-26.md)).
Read at lineage head `a51f4992965d4a1ec94bb7c3b1824795887be129`. This document proposes the
change. It authorizes no production source by itself. Line numbers are at that head.

Inputs:
- [the O-cluster investigation](../retained-seed-original-handoff/evidence/INVESTIGATION-original-allocation-custody-unavailable-2026-10-25.md),
  §5 "smallest owner-shaped unit";
- the contract draft it cites,
  `seed-release-failure-custody/evidence/retained-partial-seed-original-handoff-contract-draft-2026-10-21.md`
  (relocated; read from `a8905df35^`), lines :126, :217-218, :241-248 and :255-266;
- [the lifecycle-owner boundary design](../retained-seed-original-handoff/evidence/DESIGN-original-allocation-lifecycle-owner-boundary-2026-10-24.md),
  §5 Q1-Q5, approved by owner decision 3.

## 0. Outcome, and what this Quest is not

Outcome, verbatim: "A legitimately admitted fresh seed completes protected activation, durably
transfers its original registration and cluster-identity rights, and reaches normal service through
the supported startup path."

This Quest is not an amendment of `retained-seed-original-handoff`. That Quest's acceptance ends at
`HANDOFF_COMPLETE_SERVING_DEFERRED` by design, and it covers the retained (second-start) path.
This Quest covers the virgin first start (`LIVE_ISSUER`) to `success:true`. No receipt of either
Quest counts for the other.

## 1. Seal-time measurement (red)

Witness: `test/bootstrap/fresh-seed-activation.integration.test.js`. Its child is
`test/test-helpers/fresh-seed-activation-public-child.js`.
- It enters the actual `startLagrangeRuntime` in a genuinely new child process. That entry acquires
  the production data-directory owner (`lagrange-runtime-startup.js:719-723`), threads it into
  `BootstrapService` (`:427`) and awaits `prepareOriginalSeedAttempt` (`:438-439`). The harness
  supplies no owner, grant, admission or delegate double. So the O1, O2 and O4 harness gaps cannot
  apply to it.
- The `createPreparedVirginSeedBootstrapService` fixture
  (`work/seed-harness-owner-composition-20261025`) is not in this base. The bare
  `createVirginSeedBootstrapService` would stop at O1 (`original-allocation-directory-custody-unavailable`).
  It also exposes neither the SQL facade nor the public listeners, so it cannot measure
  requirements R3 and R4. The supported public entry is the stronger witness.
- Observation is passive:
  - `setActualCoreEntryObserver`, the production native-entry observer seam: `create_node` and
    `campaign` per group;
  - read-only reads of the durable lifecycle rows through the store owner's `originalAllocationRow`,
    sampled on every macrotask of the live process;
  - external TCP probes of the transport WebSocket port, and HTTP probes of BootstrapAPI `/readyz`.
    Each accepted probe records the durable rights at that instant.

Measured at `a51f49929`. Local run, thermal ok, one file:
```
not ok 1 - fresh seed completes protected activation, transfers its original rights and serves through the supported startup path
  error: |-
    a legitimately admitted fresh seed must reach service; startup refused ORIGINAL_ALLOCATION_HOLD/original-handoff-continuation-unavailable
  stack: ... fresh-seed-activation.integration.test.js:179:10
# startupError.stack: assertOriginalSeedContinuation (seed-original-allocation-startup.js:111)
#   <- startDeferredBootstrapReplicaElections (seed-partitions-phase.js:388:7) <- phasePartitions (:187:16)
# rightSequences: every declared SERVICES right and the anchor identity right = ["UNUSED"]
# admission: []   observerErrors: []
# tests 1  pass 0  fail 1
```
This is the truthful O3 hold. Preparation and native opening succeeded. Every right is durably UNUSED,
no public surface accepted, and the observers raised nothing. The full TAP is raw output and is not
committed (quest-artifacts: TAP streams go to the evidence store).

## 2. The five owner requirements, mapped to owners and files

| # | Requirement (decision 2) | Owner | File and site | Change |
|---|---|---|---|---|
| 1 | Live original issuer only, for openings admitted under its exact allocation | allocation-preparation owner (mode), via bootstrap startup interaction | `src/raft/raft-rs-original-allocation-preparation.js` `#openingMode` (`:257` LIVE_ISSUER, `:287` COLD_RECOVERY), `admitReplica` `:352-386`; `src/bootstrap/seed-original-allocation-startup.js:106-112` | Replace the unconditional `throw CONTINUATION_UNAVAILABLE` at `:111` with one decision of the preparation owner keyed on the preparation's mode. **LIVE_ISSUER** may start elections only for replicas whose opening this attempt admitted and consumed (`openingFor`/`consumeOriginalAllocationOpening`, `:148-171`). **COLD_RECOVERY, null and unknown** keep the hold exactly as today. The caller sites stay the same: `seed-partitions-phase.js:338,388` and `seed-message-groups-phase.js:231`. The decision is asked per replica, not as a boolean. |
| 2a | Registration consumes UNUSED -> SUBMITTED durably before submission | lifecycle owner as the sole rights writer (Q3) | today `transitionOriginalRight` in `src/raft/raft-rs-original-allocation-store.js:109-127`, which has no src caller; consumers in `src/bootstrap/phases/seed-registration-phase.js` `phaseRegistration` `:105-107` (SERVICES INSERTs) and `ensureSystemTableWriter` `:651-653`, plus the anchor's reserved cluster-id CONFIG publication (nothing consumes `IDENTITY_RIGHT` yet) | Each original SERVICES INSERT and the cluster-id CONFIG INSERT goes through one owner operation. It commits SUBMITTED durably (`commitAndReadback`), then submits once. |
| 2b | SUBMITTED -> TRANSFERRED after an exact authoritative committed read | same | same | The same live owner reads the committed row back by exact value and generation, then commits TRANSFERRED. |
| 3 | A missing answer never resets a right | same | `ORIGINAL_RIGHT_SUCCESSOR` (`raft-rs-original-allocation-constants.js:49-52`), which is already monotonic | A lost answer is resolved by an exact read in the same live owner. Timeout or absence never re-arms the INSERT. A cold SUBMITTED stays a typed HOLD, which is the retained Quest's path. |
| 4 | Public admission opens only after the handoff completes; internal activation is narrowly authorized | bootstrap startup admission, consumed by the existing ingress owners | `src/bootstrap/bootstrap-service-runtime-methods.js:299` (`startWebSocketServer`), `:339` (`openExternalTransportAdmission`); `src/bootstrap/bootstrap-service-seed-workflow.js:217` (`completeSuccessfulBootstrap`); BootstrapAPI readiness | Make one startup admission decision: open only when every declared right is TRANSFERRED. Ingress consumes it and never re-derives it. Self-routing and internal SQL stay narrowly admitted for registration. |
| 5 | Retained, partial, uncertain and cold mid-handoff states keep their protections; COLD_RECOVERY is never silently authorized | existing owners, unchanged | `seed-original-allocation-startup.js:63-69` (classification HOLD, FRESH_SEED authority); `preparation.js:389-397` (DIRECTORY), `:375-377` (deferElection), `:409-` (cold validation) | No change. The new decision's default branch is the hold. |

What stays protected:
- the retained-declaration classification HOLD;
- the directory-custody refusal for a null owner (sealed in `seed-original-attempt-lifetime.test.js:368-383`);
- the AUTHORITY refusal when FRESH_SEED membership is absent;
- native entry only by the exact opening;
- every COLD_RECOVERY continuation;
- public effects before TRANSFERRED.

`bootstrapOrExit` stays (it has a live caller); it is not part of this change.

## 3. Decision-free vs Q3/Q4-dependent

| Part | Depends on |
|---|---|
| The mode-keyed continuation decision (requirement 1) | None of Q1-Q5. It needs this Quest's own pre-source correspondence review. |
| The public-admission decision and its consumption by ingress (requirement 4) | None of Q1-Q5. Same review. |
| WHERE the rights-transition writer lives: the store's `transitionOriginalRight`, or a lifecycle-owner operation as the sole writer (requirements 2a, 2b, 3) | **Q3**: the lifecycle owner is the sole writer of allocation fields and rights transitions. **Q4**: the census must first see writes behind imported table-name aliases (store `:6` `TABLE` alias; audit `:201-220,:373-380`; `operation-port-boundary.test.js:182`), failing witness first. This Quest consumes that decision. It does not place the writer itself. |
| `REPLICA_LIFECYCLE_TABLE` home | Q5. Cosmetic for this unit. |
| Incarnation minting order and row birth | Q2 and Q1. Orthogonal: the continuation reads incarnations only through `verifyMemberBinding`. |

Execution order follows owner decision 8:
1. Requirements 1 and 4 can be prepared and reviewed now.
2. Requirements 2 and 3 land after Q3/Q4 have placed the writer.

The witness cannot go green before requirements 2 and 3 land, because R2 asserts the full sequence.

## 4. Acceptance conditions as measurable probes

The sealed `doneWhen` is the `test-receipt` probe over `evidence/receipt.json`, with seven required
receipts. A script probe that ran the witness would start a seed. That is a cluster action, which a
probe may not perform (R27); the witness child calls `refuseUnderProbe`
(`src/test-helpers/probe-guard.js`) and refuses under `LAGRANGE_PROBE=1`. So the receipt is
written by a `scripts/quest-evidence/fresh-seed-activation.js` writer, which this Quest's attempts
add. The writer uses `harness-runtime.js`, records the witness digest, and runs on canonical lab
execution with retries 0.

| Receipt | Measured by | Pass condition |
|---|---|---|
| `protected-activation-admitted-openings-only` | witness R1 (`assertProtectedActivation`) | Every `campaign` before startup returns is on a declared original group, after that group's `create_node`. The campaigned set equals the declared group set. |
| `original-rights-durable-monotonic-transfer` | witness R2 (`assertRightSequences`) plus the parent's post-exit durable read | Every declared SERVICES right and the anchor identity right is observed exactly `[UNUSED, SUBMITTED, TRANSFERRED]`. Durable rows are TRANSFERRED and members are ESTABLISHED. |
| `public-admission-closed-until-handoff` | witness R3 (`assertAdmissionFence`) | Every accepted transport-WS connection or `/readyz` 200 coincides with all rights TRANSFERRED. `/readyz` serves after return. |
| `public-write-and-read-served` | witness R4 | `CREATE`, `INSERT` (affectedRows 1) and `SELECT` succeed through `openApplicationDatabase`. |
| `same-data-restart-served-or-typed-hold` | witness R5 | A cold restart process either serves the pre-restart row, or rejects with `code === ORIGINAL_ALLOCATION_HOLD` and a named reason. Durable rights are byte-for-byte unchanged across the restart. |
| `retained-partial-uncertain-cold-states-keep-hold` | the existing owner witnesses, unchanged, all green on the candidate: `test/bootstrap/seed-original-attempt-lifetime.test.js`, `test/raft/raft-rs-original-*.test.js`, `test/bootstrap/seed-retained-effects*.test.js`, plus one new negative: a COLD_RECOVERY preparation asked to continue still throws `original-handoff-continuation-unavailable` | All pass, and the negative engages. |
| `independent-verification-and-applicable-gates` | an independent verifier (`note --verification`), the land gates and the O-family census re-run | Approve on the exact candidate. The census report separates harness defects resolved, assertions still blocked by a hold, and fresh-seed acceptance demonstrated (owner decision 2, report format). |

## 5. Explicit non-claims

- **No recovery proof.** R5 accepts a typed hold. Retained-history classification, COLD_RECOVERY
  re-activation, cold mid-handoff progress and the two-start composed proof stay with
  `retained-seed-original-handoff` and the final cutover acceptance.
- No multi-node, RF3 cross-host, joiner, snapshot, CDC, TX1 or FreshMG serving claim.
- No change to the retained Quest's eight receipts, its seal or its terminal shape.
- No placement of the rights writer (that is Q3), and no census fix (that is Q4).
- The witness's declaration read (`loadDeclaration`) restates the anchor-row query, the same way the
  existing lane witness `declarationOf` does. If Q3 gives the lifecycle owner a read operation, the
  witness consumes it.
- Green O-family files elsewhere are not this Quest's claim. Many will reach later gates (for
  example the P cluster) once O3 lifts.

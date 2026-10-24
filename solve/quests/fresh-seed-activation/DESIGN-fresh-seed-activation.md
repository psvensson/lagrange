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
`test/test-helpers/fresh-seed-activation-public-child.js`, and both use the custody-free reader
`test/test-helpers/original-allocation-durable-reader.js`.

**Positive tests (`R1`-`R5`).**
- They enter the actual `startLagrangeRuntime` in genuinely new child processes. That entry acquires
  the production data-directory owner (`lagrange-runtime-startup.js:719-723`), threads it into
  `BootstrapService` (`:427`) and awaits `prepareOriginalSeedAttempt` (`:438-439`). The harness
  supplies no owner, grant, admission or delegate double. So the O1, O2 and O4 harness gaps cannot
  apply.
- One shared observation (an initial start, then a cold restart only if the first start served)
  feeds all five positive tests.
- The `createPreparedVirginSeedBootstrapService` fixture
  (`work/seed-harness-owner-composition-20261025`) is not in this base. The bare
  `createVirginSeedBootstrapService` exposes neither the SQL facade nor the public listeners. So the
  supported public entry is the witness for the positives.

**Engaged negatives (in-process).** These build `BootstrapService` through the shared owner fixture
`createVirginSeedBootstrapService`, passing the production `acquireDataDirectoryProcessOwner`
(see §4.1).

**Passive observation (review C4).**
- `setActualCoreEntryObserver`: the complete production native-entry seam (`create_node` and
  `campaign` per group).
- Durable rights:
  - **Hint.** A cached sampler: one read-only handle and one prepared narrow `SELECT` per member,
    opened once. At most one sample per macrotask, and at most one per 1 ms. Measured cost at seal:
    138 samples, 222 ms in total, over a 141-member cohort. A SUBMITTED window shorter than the
    bound would read `[UNUSED, TRANSFERRED]`, which is a false red, never a false green.
  - **Authority.** The store owner's `originalAllocationRow`, read at settle in the child and again
    after the child released custody. R2 asserts that the two reads are equal.
  - Once Q3 places the writer, an owner writer-seam observer replaces the sampler, and the authority
    read stays.
- Public admission:
  - external TCP probes of the transport WebSocket port and HTTP `/readyz` probes;
  - each is **bracketed** by a rights sample before the attempt and one at accept. An accept with
    `after=false` is a definite violation. `before=false, after=true` is reported as ambiguous.
  - Every probe targets the configured host (`127.0.0.1`), which is also the runtime's `node.address`.

Measured at `75424642d` (src byte-identical to the seal base `a51f49929`). Local, thermal ok:
```
not ok 1 - R1 protected activation happens only for openings admitted under the exact allocation
not ok 2 - R2 each original right moves UNUSED -> SUBMITTED -> TRANSFERRED durably and never resets
not ok 3 - R3 public admission is closed until the handoff completes and open after
not ok 4 - R4 a write and a read succeed through public admission
not ok 5 - R5 a restart on the same durable data serves or is held typed and resets no right
    (each) a legitimately admitted fresh seed must reach service; startup refused
           ORIGINAL_ALLOCATION_HOLD/original-handoff-continuation-unavailable
# startupError.stack: assertOriginalSeedContinuation (seed-original-allocation-startup.js:111)
#   <- startDeferredBootstrapReplicaElections (seed-partitions-phase.js:388:7) <- phasePartitions (:187:16)
# rightSequences: every declared SERVICES right and the anchor identity right = ["UNUSED"]
# admission: []   observerErrors: []   samplingCost: {samples: 138, totalMs: 222}
ok 6 - R1 negative: without a live original attempt (null opening mode) every continuation entry holds
ok 7 - R3 negative: with original rights untransferred every public admission entry holds
# tests 7  pass 2  fail 5
```
The seal-time record (one test, at `a51f49929`, `:179:10`) had the same leaf. This is the truthful
O3 hold. The full TAP is raw output and is not committed.

## 2. The five owner requirements, mapped to owners and files

| # | Requirement (decision 2) | Owner | File and site | Change |
|---|---|---|---|---|
| 1 | Live original issuer only, for openings admitted under its exact allocation | allocation-preparation owner (mode), via bootstrap startup interaction | `src/raft/raft-rs-original-allocation-preparation.js` `#openingMode` (`:257` LIVE_ISSUER, `:287` COLD_RECOVERY), `admitReplica` `:352-386`; `src/bootstrap/seed-original-allocation-startup.js:106-112` | Replace the unconditional `throw CONTINUATION_UNAVAILABLE` at `:111` with one decision of the preparation owner keyed on its mode. **LIVE_ISSUER** may start the election of a replica only when this attempt admitted and consumed that replica's opening (`openingFor`/`consumeOriginalAllocationOpening`, `:148-171`). **COLD_RECOVERY, null and unknown** keep the hold exactly as today. The decision is asked per replica, so the sites move slightly. `seed-partitions-phase.js:388` asks once **before** its loop today (`startDeferredBootstrapReplicaElections`). It moves inside the loop, keyed by each replica's `replicaId`. `seed-partitions-phase.js:338` and `seed-message-groups-phase.js:231` ask with `options.replicaId`. |
| 2a | Registration consumes UNUSED -> SUBMITTED durably before submission | lifecycle owner as the sole rights writer (Q3) | today `transitionOriginalRight` in `src/raft/raft-rs-original-allocation-store.js:109-127`, which has no src caller; consumers in `src/bootstrap/phases/seed-registration-phase.js` `phaseRegistration` `:105-107` (SERVICES INSERTs), `ensureSystemTableWriter` `:651-653`, and the anchor's reserved cluster-id CONFIG INSERT `:629-645` (nothing consumes `IDENTITY_RIGHT` yet) | Each original SERVICES INSERT and the cluster-id CONFIG INSERT goes through one owner operation. It commits SUBMITTED durably (`commitAndReadback`), then submits once. |
| 2b | SUBMITTED -> TRANSFERRED after an exact authoritative committed read | same | same | The same live owner reads the committed row back by exact value and generation, then commits TRANSFERRED. |
| 3 | A missing answer never resets a right | same | `ORIGINAL_RIGHT_SUCCESSOR` (`raft-rs-original-allocation-constants.js:49-52`), which is already monotonic | A lost answer is resolved by an exact read in the same live owner. Timeout or absence never re-arms the INSERT. A cold SUBMITTED stays a typed HOLD, which is the retained Quest's path. |
| 4 | Public admission opens only after the handoff completes; internal activation is narrowly authorized | bootstrap startup admission, consumed by the existing ingress owners | `src/bootstrap/bootstrap-service-runtime-methods.js:299` (`startWebSocketServer`), `:339` (`openExternalTransportAdmission`); `src/bootstrap/bootstrap-service-seed-workflow.js:217` (`completeSuccessfulBootstrap`); BootstrapAPI readiness (`/readyz`, `src/bootstrap/owners/bootstrap-readiness-owner.js:106-115`) | Make one startup admission decision: open only when every declared right is TRANSFERRED. Ingress consumes it and never re-derives it. Self-routing and internal SQL stay narrowly admitted for registration. |
| 5 | Retained, partial, uncertain and cold mid-handoff states keep their protections; COLD_RECOVERY is never silently authorized | existing owners, unchanged | `seed-original-allocation-startup.js:63-69` (classification HOLD, FRESH_SEED authority); `preparation.js:389-397` (DIRECTORY), `:375-377` (deferElection), `:409-` (cold validation) | No change. The new decision's default branch is the hold. |

**The reader of "every declared right is TRANSFERRED" (review G2).** On this lineage, the reader is
the allocation-preparation owner. It is the only live holder of the exact declaration, the directory
custody and the member handles. It gains one read operation: handoff complete, yes or no, over every
declared member's rights through `originalAllocationRow`.
- The startup admission decision asks that operation.
- `startWebSocketServer`, `openExternalTransportAdmission`, `completeSuccessfulBootstrap` and the
  readiness owner consume the decision. None of them reads lifecycle rows (R01/R03).
- When Q3 makes the lifecycle owner the sole rights writer and gives it a read operation, the
  preparation owner delegates to that operation, and the decision's consumers do not change.

**What stays protected:**
- the retained-declaration classification HOLD;
- the directory-custody refusal for a null owner (sealed in `seed-original-attempt-lifetime.test.js:368-383`);
- the AUTHORITY refusal when there is no live attempt or no FRESH_SEED membership;
- native entry only by the exact opening;
- every COLD_RECOVERY continuation;
- public effects before TRANSFERRED.

**`bootstrapOrExit` (review G4), settled by grep at `75424642d`** over `src`, `bin`, `scripts`,
`test`, `architecture` and `docs`:
- the only definition is `src/bootstrap/bootstrap-service.js:709`;
- **no production caller** exists in `src`, `bin` or `scripts`;
- one **test caller**: `test/bootstrap/join-resume-replica-lifecycle-owner.test.js:861`;
- one **architecture reference**: `architecture/bootstrap.md:51`.

So the seal-time sentence "it has a live caller" was imprecise. The only caller is a test, and the
other mention is a document. As the investigation says, the entry builds without an owner and would
always refuse DIRECTORY. Under the no-legacy directive, that makes it a deletion finding for its own
owner. It is out of this Quest's scope and is not touched here (R16/R17).

### 2.1 Sealed negatives whose meaning changes (review C1)

Requirement 1 changes the meaning of an existing sealed negative. That edit is a recorded
correspondence update, not a weakening.

`test/bootstrap/seed-original-attempt-lifetime.test.js:403-435` ("continuation entry points hold
elections, registration and public admission while preserving original rights") prepares a
LIVE_ISSUER attempt. With every right UNUSED, it asserts that all six entries reject with
`CONTINUATION_UNAVAILABLE`. Today the hold is unconditional, so one reason covers two different
properties. After requirements 1, 2 and 4 they separate:

| Entry in the sealed list | Today | After this Quest | Why the hold remains or moves |
|---|---|---|---|
| `startDeferredBootstrapReplicaElections` | CONTINUATION_UNAVAILABLE | **Changes meaning.** On LIVE_ISSUER it starts the elections of admitted, consumed openings only. In the sealed fixture no replica was queued or admitted, so it starts nothing and must not reject. | Mode-keyed. The hold stays for COLD_RECOVERY, null and unknown modes. That half moves to new negatives N1 and N2 (§4.1). |
| `phaseRegistration`, `ensureSystemTableWriter` | CONTINUATION_UNAVAILABLE | **Changes meaning.** On LIVE_ISSUER they consume rights through the owner operation, so they no longer hold for a mode reason. | Rights-keyed. They proceed only by consuming UNUSED rights; a SUBMITTED or TRANSFERRED right refuses with `SPENT` (`original-allocation-current-authority-required`). On COLD_RECOVERY they keep CONTINUATION_UNAVAILABLE. |
| `startWebSocketServer`, `openExternalTransportAdmission`, `completeSuccessfulBootstrap` | CONTINUATION_UNAVAILABLE | **Same property, possibly a new reason.** They still hold while any right is untransferred. If the admission decision names its own reason (for example a handoff-incomplete reason in `ORIGINAL_ALLOCATION_REASON`), the sealed assertion's reason changes. Its rejection, the preserved rights, `server === null` and external admission disabled do not change. | Rights-keyed. Today's measurement is the new engaged negative N3 (§4.1), which asserts the hold code and not the reason, so it survives the reason change. |

The attempt that lands requirement 1 edits `:403-435` by this table. It removes or recasts the
mode-keyed entries and keeps every remaining invariant assertion. It records the edit as a finding
citing this section, and its verifier checks the correspondence (template `owner-interaction`). The
new COLD_RECOVERY negative (N2) lands in the same attempt.

Two more witnesses inject the refusal through the delegate seam. They do not prepare an attempt.
- `test/bootstrap/seed-registration-election-scheduling.test.js:135-144` asserts that the
  continuation authority is consulted **once** and that a refusal starts no election.
  - Per-replica asking changes the count: it becomes one consultation per replica, before that
    replica's start.
  - "A refusal starts nothing" is preserved.
  - The attempt updates `checks === 1` by this correspondence.
- `test/bootstrap/seed-registration-phase.test.js:404-430` asserts that each registration entry
  performs no effect under an injected refusal.
  - The property is unchanged: a refusal from the owner still blocks every effect.
  - The attempt keeps it.

No other test asserts `CONTINUATION_UNAVAILABLE` (grep at `75424642d`). The `deferElection !== true` refusal in
`admitReplica` (`:375-377`, lifetime `:204-205`) is a separate admission rule. It stays until a
reviewed attempt shows that non-deferred original elections are needed. Requirement 1 does not need
them.

## 3. Decision-free vs Q3/Q4-dependent

| Part | Depends on |
|---|---|
| The mode-keyed continuation decision (requirement 1) | None of Q1-Q5. It needs this Quest's own pre-source correspondence review. |
| The public-admission decision, its reader and its consumption by ingress (requirement 4) | None of Q1-Q5 on this lineage, with the preparation owner as the reader. Q3 later changes only what the reader delegates to. Same review. |
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
(`src/test-helpers/probe-guard.js`) and refuses under `LAGRANGE_PROBE=1`.

### 4.0 Writer (review C3)

The writer is `scripts/quest-evidence/fresh-seed-activation.js`. It is added now, which is the
writer-at-seal convention of the sampled test-receipt Quests. It is built on `harness-runtime.js`
and run on canonical lab execution with retries 0. No receipt flips to `passed: true` by hand.

| Receipt | `harness-runtime.js` form |
|---|---|
| 1 `protected-activation-admitted-openings-only` | `testFile` = witness, `testNamePattern: '^R1 .*$'`, `expectedTests: 2` (positive R1 plus negative N1) |
| 2 `original-rights-durable-monotonic-transfer` | `'^R2 .*$'`, `expectedTests: 1`. The lost-answer negative N5 joins it as an R2 test once Q3 has placed the writer, and the count goes to 2 in that attempt. |
| 3 `public-admission-closed-until-handoff` | `'^R3 .*$'`, `expectedTests: 2` (positive R3 plus negative N3) |
| 4 `public-write-and-read-served` | `'^R4 .*$'`, `expectedTests: 1` |
| 5 `same-data-restart-served-or-typed-hold` | `'^R5 .*$'`, `expectedTests: 1` |
| 6 `retained-partial-uncertain-cold-states-keep-hold` | shell `command`: `npm run test:file --` over the existing owner witnesses (the lifetime witness, the seven `test/raft/raft-rs-original-*.test.js`, the three `test/bootstrap/seed-retained-effects*.test.js`), with `testFile` = the lifetime witness, which carries N2 and the §2.1 correspondence update |
| 7 `independent-verification-and-applicable-gates` | shell `command`: `node scripts/quest-evidence/fresh-seed-activation.js --check-verification && npm run -s test:duplication && npm run -s audit:shards`. The check reads the log through the solve store owner (`questState`, `verdictOf`). It passes only with at least one attempt and a current approving `subagent:` verification newer than it. A seal review approves no source and does not count (measured today: `approved: false, attempts: 0`). The land guard enforces the same verification independently. |

The positive tests share one observation, so a receipt run that selects one positive test still
performs both starts.

### 4.1 Engaged negatives (review C2), under the existing receipt ids

These negatives discriminate the ordered decisions from a mutant that only deletes the throw at
`seed-original-allocation-startup.js:111`. That mutant passes positive R1 (the opening gate already
confines campaigns) and positive R3 (on this lineage the listeners start after `bootstrap()` returns).

| Id | Receipt | Negative | Status at `75424642d` |
|---|---|---|---|
| N1 | 1 | Without a live original attempt (null opening mode), every continuation entry (`startDeferredBootstrapReplicaElections`, `phaseRegistration`, `ensureSystemTableWriter`, `startWebSocketServer`, `openExternalTransportAdmission`, `completeSuccessfulBootstrap`) rejects with `ORIGINAL_ALLOCATION_HOLD`/`AUTHORITY`, issues no allocation, and creates no router. | **In the witness, green.** Must hold on every head. |
| N2 | 1 and 6 | An unknown or COLD_RECOVERY opening mode keeps the continuation hold. A COLD_RECOVERY preparation is never produced at startup on this lineage (`startup.js:63-66` holds every PRESENT declaration), so it is measured at the preparation owner's new decision, which the attempt for requirement 1 adds. | **Design.** It depends on the fresh-start continuation decision. It lands in the lifetime witness with the §2.1 correspondence update. |
| N3 | 3 | With original rights untransferred on a prepared LIVE_ISSUER attempt, `startWebSocketServer`, `openExternalTransportAdmission` and `completeSuccessfulBootstrap` reject with `ORIGINAL_ALLOCATION_HOLD`. Every right stays UNUSED (owner read before and after each entry), `server === null`, and external admission stays disabled. The reason is not asserted, so it survives §2.1. | **In the witness, green.** It must stay green after requirement 4. The throw-deleting mutant turns it red. |
| N3' | 3 | `/readyz` does not serve while any right is untransferred. | **Today it is the bracketed R3 observation, and it is vacuous** (BootstrapAPI initializes after `bootstrap()` returns, `startup.js:478`). It becomes an in-process readiness-owner negative in the attempt for requirement 4, when readiness consumes the admission decision. |
| N4 | 1 | A LIVE_ISSUER replica whose opening was not admitted and consumed by this attempt is refused election start by the per-replica decision. This covers an undeclared `replicaId`, a declared replica never queued, and an opening from another attempt. | **Design.** The per-replica decision does not exist yet. Today's proxies are green and unchanged: no native entry without the exact opening (`raft-rs-original-opening-authority.test.js`), and admission identity refusals (lifetime `:185-206`). |
| N5 | 2 | A lost answer after SUBMITTED leaves the right SUBMITTED and issues no second INSERT (the SERVICES row count stays 1). An exact committed read in the same live owner resolves it to TRANSFERRED. A timeout or absence never re-arms the INSERT. A cold SUBMITTED is a typed HOLD on restart. | **Design, Q3-dependent.** It is specified now and measured at the owner operation Q3 places, by inducing the lost answer at the owner's submission seam. Today's partial is green: the store refuses SUBMITTED->UNUSED and TRANSFERRED->UNUSED without a write (`raft-rs-original-allocation-store.test.js:35-66`). |

### 4.2 Pass conditions

| Receipt | Pass condition |
|---|---|
| 1 | R1: startup natively opens exactly the declared groups (`opened == declared`). Every `campaign` before return is on a declared group, after its `create_node`, and the campaigned set equals the declared set. N1 holds (and N2, N4 once they land). |
| 2 | R2: every declared SERVICES right and the anchor identity right reads exactly `[UNUSED, SUBMITTED, TRANSFERRED]`. The owner read at settle equals the post-exit durable read, all TRANSFERRED and ESTABLISHED. N5 once it lands. |
| 3 | R3: no bracketed accept with `after=false`; ambiguous brackets are reported; `/readyz` serves after return. N3 holds. |
| 4 | R4: `CREATE`, `INSERT` (affectedRows 1) and `SELECT` through `openApplicationDatabase`. |
| 5 | R5: a cold restart serves the pre-restart row, or rejects with `code === ORIGINAL_ALLOCATION_HOLD` and a named reason. The report says which branch it took. Durable rights are unchanged. |
| 6 | All listed owner witnesses pass, including N2 and the §2.1 update. |
| 7 | The `--check-verification` check plus the ratchets. The census report separates harness defects resolved, assertions still blocked by a hold, and fresh-seed acceptance demonstrated (owner decision 2, report format). |

## 5. Explicit non-claims

- **No recovery proof.** R5 accepts a typed hold. Retained-history classification, COLD_RECOVERY
  re-activation, cold mid-handoff progress and the two-start composed proof stay with
  `retained-seed-original-handoff` and the final cutover acceptance.
- No multi-node, RF3 cross-host, joiner, snapshot, CDC, TX1 or FreshMG serving claim.
- "Public" in R4 means the supported embedded facade (`openApplicationDatabase`). No PG-wire, REST
  SQL or remote transport request is made, and network ingress beyond `/readyz` and the transport
  listener is not claimed. The admin WebSocket surface is not probed.
- No change to the retained Quest's eight receipts, its seal or its terminal shape.
- No placement of the rights writer (that is Q3), and no census fix (that is Q4).
- `readIssuedDeclaration` in the custody-free test reader restates the anchor-row query of
  `preparation.readDeclaration`, which needs custody the child cannot hold. The existing lane witness
  `declarationOf` does the same. When Q3 gives the lifecycle owner a custody-free read operation,
  the reader consumes it.
- Green O-family files elsewhere are not this Quest's claim. Many will reach later gates (for
  example the P cluster) once O3 lifts.

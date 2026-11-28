# Seal and contract check

Quest `transaction-redundant-progress-writes`, stage 0, at `ab347e962`.
**[V]** verified (read, or measured with the output path named), **[I]** inferred.
Measurements are under `/mnt/data/peter/projects/lagrange-oltp-perf-20261128/lab/td-stage0/`
(coordination dir, outside the repository). "Simulated removal" = a scratch
`--import` preload that elides the ACTIVE participant row at
`persistDistributedTransactionParticipantRow` and skips
`setTransactionStatus(PREPARED)`, run against the unchanged `src` (no file
under `src/` was changed).

Verdict legend: **untouched** (the change cannot contradict it),
**consistent** (the record already describes the target state),
**supersession** (an assertion or record must be explicitly superseded in
this quest, naming the original; the closed record stays untouched, R09/R21).

## 1. Closed quests and epics

### `scenario-a-transaction-coordination-fast-path` (sealed `4dc6db6b9`, terminal)

| Item | Verdict | Why |
| --- | --- | --- |
| Constraint `preserve-participant-set-cas-authority` | untouched | The manifest CAS and its readback rules are not changed; only the participant progress row goes. [V] |
| Constraint `preserve-two-phase-decision-protocol` ("insert-once decision recording after all participant PREPARE digests/coordinates are durably retained") | untouched | The PREPARED participant rows (C3) stay and still precede the decision; witness `prepare-evidence-precedes-decision` green today and under the simulated removal. [V] |
| Constraint `preserve-generic-workflow-sequential-default` | untouched | `DurableWorkflowCoordinator` stage semantics unchanged. [V] |
| Statement priority (1): "eliminate duplicated participant persistence, redundant ACTIVE progress writes" | consistent in intent | The epic removed the duplicate participant write and the ACTIVE *status* rewrites on `sql_transactions` (`solve/epics/scenario-a-transaction-coordination-fast-path.md:58-61`); it kept one ACTIVE participant row. Removing that row goes further than the epic, in the same direction. [V] |
| Probe `scripts/checks/scenario-a-transaction-coordination-fast-path-guard.js:333-338` (`participantMutationsOnEnlist.length === ONE`, "newly enlisted participant must be persisted once") | **supersession** | Becomes 0. Precedent: ruling 3 (a supersession finding in the new quest names the closed quest and the exact assertion; the closed record stays). The guard file is outside this stage's writable paths: the implementation stage needs it added to its assignment. [V] |
| Witness `test/query/scenario-a-transaction-coordination-fast-path.test.js:95-99` (one participant mutation on first write) | **supersession** | Same assertion in the witness test. [V] |
| Witness `test/query/scenario-a-transaction-coordination-fast-path.test.js:1441-1484` (Finding 1B: ACTIVE persistence fails / is delayed) | **supersession** | It waits for an ACTIVE write that no longer exists (would hang on `p2Started`). The hazard it witnesses (a failed or late ACTIVE upsert) disappears with the write. [V by reading; I that it hangs] |
| Epic `doneWhen` (this guard at metric 0) | **pre-existing red, finding** | Measured on clean `ab347e962`: **metric 2** (`priority-1`: "executeWriteStatement must persist sql_write_operations once with outcome, 0 !== 1"; `priority-5`: "Missing canonical index idx_orders_customer_latest on orders"). Under the simulated removal still 2 (`priority-1` now fails one assertion earlier, on the participant count). Ruling 3 assumes this guard measures 0; it does not on main. Not this quest's to repair. [V `scenario-a-transaction-coordination-fast-path-guard-{ab347e962,simulated}.json`] |

### `scenario-a-deep-stack-throughput-and-latency` (sealed `b41d4ccec`, terminal)

| Item | Verdict | Why |
| --- | --- | --- |
| Constraint `preserve-cas-and-prepared-evidence-authority` | untouched | CAS writes still run on every set change and freeze; PREPARED participant rows with digest, index and term are still persisted before a COMMIT decision. [V] |
| Constraint `preserve-raft-ready-persistence-ordering` | untouched | No Raft change. [V] |
| Constraint `preserve-row-key-conflict-and-read-your-own-writes` | untouched | No partition change; the row-key hold only gets shorter (fewer rounds between the first write and C6). [V code, I effect] |
| Epic Quest 2 plan "Coalesce non-decision-bearing intermediate coordinator status transitions (`PREPARING`, `PREPARED`, `COMMITTING` on `sql_transactions` ...)" (`solve/epics/scenario-a-deep-stack-throughput-and-latency.md:104-111`) | consistent | Removal (b) completes the PREPARED part the quest did not do (R1 section 2). The plan's four preserve-conditions (initial-lineage trigger, CAS and `decision IS NULL` fencing, PREPARED participant evidence before the decision, terminal semantics) all hold. [V] |
| Probe `scripts/checks/scenario-a-deep-stack-throughput-and-latency-guard.js` | untouched | Metric 0 on the unchanged tree and 0 under the simulated removal. [V `scenario-a-deep-stack-throughput-and-latency-guard-{ab347e962,simulated}.json`] |
| Witness `test/query/scenario-a-deep-stack-throughput-and-latency.test.js:244-288` | untouched | Counts only after the first enlist and only transient statuses. [V] |

## 2. TX1 quests (open, no terminal entry)

### `replicated-transaction-decision-and-apply` and `tx1-single-path-alpha`

| Item | Verdict | Why |
| --- | --- | --- |
| Constraints (`existing-owner-chain`, `coordinator-seam-agreed-first`, `no-weakened-fault-cases`, `single-semantic-owner`, `preserve-current-safety` incl. "PREPARED custody") | untouched | No new protocol, ledger or path; "PREPARED custody" is the participant-side reservation on the workload partition, not the coordinator status. Changes to the coordinator's persistence belong to the query lane under the agreed seam (`seam-2026-10-10.md`): the change must be recorded as a seam-consistent change, see below. [V] |
| Design `design-query-recovery-set-2026-10-11.md:36-51,73-81` ("This column is the admitted set ... Participant rows supply PREPARE evidence/progress; they never establish the set ... status remains a progress hint ... do not infer absence from status") | consistent | Both removals are what this design says the rows and the status already are. [V] |
| Design `design-query-begin-uncertain-insert-resolution-2026-10-11.md:1538-1545,2132-2137,2676-2678` ("a missing progress row remains a legitimate unknown member") | consistent | Recovery with no participant row is a designed case; witnessed today by `restart after the manifest append ... (no participant row exists)`. [V] |
| Seam item E (participant PREPARE evidence retained on the coordinator's participant row before the decision; `seam-2026-10-10.md:215`) | untouched | The PREPARED row is kept. [V] |
| Receipt witness `test/raft/raft-rs-backend/transaction-leg-a-three-replica.test.js:194-232` (A2) and `:473-474` (A5 `afterPrepare`): hold at `statusWriteOf(TRANSACTION_STATUS.PREPARED)` | **supersession** | The hold is never reached once the write is gone. The crash point it names, "after the PREPARE evidence, before the decision", still exists; the hold moves to `isDecisionWrite` (same durable state today except the PREPARED status). Named by both TX1 receipts; `replicated-transaction-decision-and-apply/evidence/receipt.json` binds `testFileDigests`, so editing the file invalidates that receipt's digest binding: the TX1 owners must re-measure or record the supersession. Measured on clean `ab347e962` (lab host tv-dator): A1-A4 pass (A2 with the hold at the PREPARED write, released later); **A5 is red on main**: `afterPrepare` stops at the hold but the recovering coordinator records no decision (`decision: null`, status PREPARING, participants PREPARED on all three replicas) because discovery waits for the deadline (`5f84f0eff`), and the stuck PREPARED reservation then refuses the next two crash cases' PREPARE (`afterDecision`, `duringFanout`: `stopped: false`, ROLLBACK). Pre-existing, route to the TX1 owner (R17). After this quest, A2 would also turn red (hold never reached) unless its hold moves with this supersession. [V `lab-leg-a-ab347e962.log`] |
| Receipt witness `test/integration/transaction-coordinator-restart.integration.test.js:117,261` (hold at `statusWriteOf(COMMITTING)`, expects `{status: 'PREPARED', decision: 'COMMIT'}` at the interruption) | **supersession, and a pre-existing red (finding)** | Measured red on clean `ab347e962` (lab host tv-dator): at the interruption the row is `{status: PREPARED, decision: null}` and recovery recovers nothing (`totalRecovered: 0`). Cause [V by reading, consistent with the run]: since `8897efeca` (2026-11-24) the decision UPDATE carries `status: COMMITTING` (`sql-query-engine-transaction-persistence-methods.js:463-470`), so the hold intercepts the decision write itself before it applies; and since `5f84f0eff` (2026-11-16) discovery waits for the persisted deadline for an undecided row (`distributed-transaction-recovery.js:86-98`), which the test does not advance. The test was last edited in `54dd2d7ce` (2026-10-27). Route: TX1 owner (R17). After this quest the expected status at that point would be PREPARING, so its repair and this supersession must be done together. [V `lab-restart-witness-ab347e962.log`] |
| `test/integration/helpers/pgwire-rollback-recovery.js:89-93`, `tx1-postkill-coordinator-reader.js`, `seed-migration-cutover-persisted.integration.test.js:217-227` | untouched | Terminal or post-decision participant rows only. [V] |

## 3. Tests and guards that assert these writes or their counts

| Witness | Verdict | Change in the implementation stage |
| --- | --- | --- |
| `test/query/tx-metadata-pgwire-and-result-representation.test.js:323-333` (6 `sql_transactions` mutations incl. `status='PREPARED'`, decision at index 4) | **supersession** | 5 mutations, decision at index 3. The atomic freeze+PREPARING and decision+COMMITTING assertions (`:335-352`) are unchanged. |
| same file `:354-362` (row at the PREPARE boundary is FROZEN/PREPARING) | untouched | The freeze still precedes PREPARE (R1 rank 4 is not in scope). [V] |
| same file `:385-392` (`participantAdmission` 2, `preparing` 2, 10 mutations) | **supersession** | 1, 1, 8. Note: this block reads `getLastTransactionBreakdown`, which the telemetry export quest replaces (ruling 7); the two quests edit the same assertions and must be sequenced (the brief already orders the export first). |
| `test/query/transaction-participant-set-authority.test.js:586-620` (zero-participant COMMIT, 3 mutations) | untouched | No participant, no PREPARED. [V] |
| same file `:622-707` (ACTIVE upsert overlaps `executeWrite`) | **supersession** | The overlap no longer exists; the witness's remaining claims (write-operation rows wait for the statement, COMMITTED overlaps read-only release) need a rewritten witness that does not wait on an ACTIVE write. |
| same file `:709-881` (Finding 1B: failed / delayed / stale ACTIVE persistence) | **supersession** | Parts 1-2 witness a hazard that disappears with the write; part 3 (failed COMMITTED status persist with an overlapped read-only release) is independent and must be kept in the rewritten witness. |
| same file `:87-116` (every stale status incl. PREPARED re-drives the exact decision) | untouched | Recovery input tolerance stays. [V] |
| `test/query/transaction-release-census.test.js:144`, `test/runtime/pgwire-transaction-outcome.test.js:64`, recovery fixtures seeding PREPARED (`reader-census.md` section 5) | untouched | They exercise reading of durable rows and labels, which stays. [V] |
| New witnesses of this quest (`test/query/transaction-redundant-progress-writes*.test.js`, guard and its test) | new | See `design-note.md` "Evidence". |

## 4. Architecture, contracts, guidelines, models

| Source | Verdict | Why |
| --- | --- | --- |
| `architecture/postgres-wire.md:320-323` ("The durable manifest is the complete admitted participant set; participant progress rows are recovery hints") | consistent | Removal (a) makes the first progress row the PREPARE evidence. No text change is required; a clarifying sentence ("participant rows begin with the PREPARE evidence") is optional documentation in the implementation stage. [V] |
| `architecture/postgres-wire.md:331-337` (evidence retained before deciding; "`COMMITTING` and other progress labels are projections of that record and never decision authority") | consistent | Removal (b) drops one progress label that was never authority. [V] |
| `architecture/postgres-wire.md:342-347` (recovery restores missing participant hints from the manifest; FROZEN undecided commits only with complete retained evidence) | consistent | Unchanged and witnessed. [V] |
| `architecture/postgres-wire.md:370-377` (schema cutover envelope; "A terminal status by itself never proves disposition") | untouched | The release census keeps accepting PREPARED rows written by earlier builds (reader 8). [V] |
| `architecture/overview.md:236-241` (recovery from the three tables) | untouched | Still true. [V] |
| `architecture/contracts/authority-and-recovery.md` (one owner per authoritative fact, disposable projections) | consistent | Removes two projections of facts owned elsewhere. No contract names either write (searched all of `architecture/contracts/`, `invariants.json`). [V] |
| `architecture/runtime-contracts.md`, `test/guidelines/*.md` | untouched | No mention of these tables' rows or statuses (searched). [V] |
| `models/` (TLA+) | untouched | No model names transactions, participants or these states (searched `models/**`). [V] |
| `docs/benchmarks/tx1-service-time-decomposition.md:270` (prerequisite: frozen manifest and PREPARED participant evidence durable before the decision CAS; COMMITTED only after all commits acknowledged) | consistent | Both conditions hold after the change. [V] |
| Release semantic version `tx1-query-set-v1` (`distributed-transaction-release-census.js:20`) | untouched | Only if the census's accepted status sets are narrowed would the release contract change; the design keeps them (design note, open question 2). [V] |

## 5. Seals that need explicit supersession (summary)

1. Fast-path quest probe `scenario-a-transaction-coordination-fast-path-guard.js:333-338` and its witness test `:95-99`, `:1441-1484` (closed quest; supersession finding in this quest; the guard file needs to enter the implementation assignment).
2. TX1 receipt witnesses `transaction-leg-a-three-replica.test.js` A2 and A5 hold points, and `transaction-coordinator-restart.integration.test.js:261` (open TX1 quests; their receipts bind these files; the restart witness is already red on main).
3. Non-sealed but asserting: `tx-metadata-pgwire-and-result-representation.test.js:323-333,385-392`; `transaction-participant-set-authority.test.js:622-707,709-881`.

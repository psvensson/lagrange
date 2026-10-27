# D1 F1 independent correction review

**APPROVE F1 only**, at `fa85052324778a07cf0067fbfb7bd9cb1ef3028f` against rejected predecessor `e1d26e0eb2e0947f56440427fc1be5ccb56c65a2`. The five runtime files are byte-identical to source commit `b090b0d85dd9a98e119e1efa4bae6813ce356272` and the clean author tree. Their SHA256 values and custody are in `identity.json`.

This closes the specific F1 finding that compact position was accepted as proof of arbitrary exact event identity. It does **not** approve whole D1: the separate F2 owed-work admission requirement remains open. This is not Quest closure, merge, release, publication or native/distributed runtime certification.

Verifier: independent Astra xhigh, `/root/cdc_d1_review`. Author/integration trees were not edited. The review snapshot `/tmp/session-worktree-lpKlgb/tree` was created with `node scripts/session-worktree.js snapshot` after reading AGENTS, rules and router. Rule revision is 2026-10-26, last steering commit `be968204dd298c9da91c3bc99efdfba0e4ea1e1d`. Relevant authority/recovery contracts, verification templates and home-lab policy were consulted. The earlier D1 rejection (`reused/ORIGINAL-D1-REVISE.md`) and the explicit correction decision (`reused/DECISION.md`) remain retained evidence. The only tracked reviewer edit is the independent census test; no production change or gate change was made for approval.

## Finding resolution

The new exact ACK path uses `readCdcObligationStanding` as a positional observation. A reclaimed position answers `cdc_acknowledgement_identity_compacted`, with `success:false`, and the committed command is consumed as `RECORDED_ONLY`. It does not claim that the supplied event existed, was delivered or was replayed. Retained positions still require the exact key digest; unknown positions above the prefix remain unknown. Judgment completes before any delivered flag or progress mutation, so one compacted member refuses the entire mixed command.

The delivery lane has a different, justified input: members that it previously read from this ledger and retained after subscriber receipts. It can reconcile those known pending positions against the committed prefix. It removes the superseded command and covered pending members, preserves uncovered members in a replacement bounded batch, and retries through the existing owner. This is reported as `RECONCILED`, not successful exact ACK admission. It neither stores historical per-event tombstones nor creates another durable progress authority. Full coverage needs no replacement; successive partial coverage can shrink a replacement again before proposal.

The retained-seed observer validates that ACK groups name actual original foundation sources, then reconstructs prior compaction from earlier applied ACKs. A command containing a compacted member contributes no delivery evidence for any remaining member. Later fresh ACKs may discharge those members. This is a read-only correspondence reduction, not a second operational delivery owner. Its preexisting scope restriction to original foundation history and its 4096-row reduction ceiling remain unchanged; it is not a general checkpoint/snapshot interpreter.

The revised O7 retains both the old reclaimed-position misfiled-event attack and the retained-row digest attack. W-D1e now checks exact replay, malicious digest, nonexistent ordinal and generation-origin coordinates after reclamation. The correction decision explicitly distinguishes position from identity; it does not silently rewrite the old acceptance meaning.

## Independent measurements

| Witness | Result | Artifact |
|---|---|---|
| Original F1 malicious-ACK witness, unchanged script | Exact old ACK, wrong digest, nonexistent ordinal and generation marker all return typed compacted refusal. Zero owed rows; compact progress unchanged. | `original-identity-candidate.log`, `original-d1-probe.mjs` |
| Successive partial prefix | A real three-operation transaction delivers three identities into one pending ACK. A competing ACK compacts ordinal 0; original ACK refuses whole and leaves 1/2 owed. Another ACK compacts ordinal 1 before retry. The lane proposes only ordinal 2, then drains without redelivery or a held lane. | `probe.mjs`, `probe-candidate.log` |
| Full prefix through distinct commands | Separate competing ACKs cover ordinal 0 and ordinals 1/2; neither has the original batch ID. The original exact ACK is refused, while its source-known pending work reconciles completely. No replacement ACK or subscriber redelivery occurs. | Same independent probe/log |
| Same source on rejected predecessor | Both lane schedules fail at the behavioral assertion that the old exact ACK must not succeed after compaction. Actual result is `success:true`. Setup/imports/delivery succeeded. | `probe-rejected.log` |
| Complete three-source/two-ACK subset census | All 49 ordered pairs of nonempty subsets are applied through real retained-store/partition owners. Includes out-of-order holes, retained delivered replays, compacted/mixed whole refusals and fresh ACK drain. Observer agrees with actual debt and remains read-only. | `reviewer-census.patch`, `focused-with-reviewer-census.log` |
| Canonical focused suites | Three files pass, 201 runner assertions: obligation 24, reclamation 6, retained-effects 171 (170 existing plus the independent 49-schedule test). | `focused-with-reviewer-census.log` |
| Application rollback | Existing applied-state failure injection rolls back delivered flags, prefix and applied progress together; subsequent retry/drain succeeds on the correction. | `rollback.log`, `rollback.stderr` |
| Impact registry | PASS, current source registry and paired witnesses. Reclamation witness is now explicitly registered with delivery and retained inspection. | `impact-audit.log` |

The canonical runner used its normal thermal gate: CPU 67 C for the ordinary lane and 65 C for bootstrap, NVMe 68 C. A direct thermal check before the small independent probes passed at CPU 62 C/NVMe 68 C. Host/Node identity is retained. No broad corpus or remote lab workload was launched.

The first new independent probe omitted the committed HLC timestamp used by the owner fixture. Three obligations were retained, but delivery did not enter a pending ACK; the probe then failed reading an absent proposed ACK. This is a verifier fixture failure and target-not-reached, not a product failure. `probe-attempt1.mjs` and `probe-candidate-attempt1.log` preserve it. Adding the canonical HLC stamp changed only the fixture. Production stayed byte-identical. The first completed behavioral candidate and predecessor runs are retained without repair.

Reproduce the independent lane A/B:

```sh
node review/d1-f1-independent/probe.mjs .
node review/d1-f1-independent/probe.mjs /tmp/session-worktree-jgoTxb/tree
node review/d1-f1-independent/original-d1-probe.mjs . ack-identity
node review/d1-f1-independent/original-d1-probe.mjs . rollback
LAGRANGE_RETRY_FAILED_ONCE=0 npm run test:file -- test/partition/partition-cdc-obligation.test.js test/partition/partition-cdc-obligation-reclamation.test.js test/bootstrap/seed-retained-effects.test.js
```

Expected A/B exits are 0/1; the other commands pass. The predecessor tree remains at exact rejected e1d26e0. The reviewer census patch is present only in this review snapshot. Root's earlier red/green iterations, census failures and final lint/hook logs are preserved under `reused/`; those logs are supporting evidence, not a replacement for the independent results above.

## Source ownership and remaining attacks

Source evidence below refers to the exact reviewed runtime files:

- **A** — `src/partition/partition-cdc-obligation.js`: `acknowledgementJudgementOf`, `applyCdcAcknowledgementCommand`, `refuseAcknowledgement`, `answerProposer`, `proposeCdcAcknowledgement`.
- **L** — `src/partition/partition-cdc-obligation-ledger.js`: standing/progress/reclamation owners; shared positional predicate has no exact-identity claim.
- **D** — `src/partition/partition-cdc-obligation-delivery.js`: `reconcilePendingAcknowledgement`, `proposePendingAcknowledgement`, `handleAcknowledgementRefusal`, `settleAcknowledgedObligations`, retry and tenure owners.
- **C** — `src/bootstrap/seed-retained-partition-effects.js`: `acknowledgmentCensus`, `acknowledgmentIsCompacted`, `expectedReclamation`, exact obligation census.
- **T** — the three focused suites and the independent logs above. Existing O14 covers unknown acknowledgement outcome retry, O7 exact identities, W-D1a replica agreement, W-D1c hydration and W-D1f hole/backpressure release.

No new mutation occurs between an await and unguarded tenure use. Reconciliation is synchronous after checking the current lane; handling an awaited proposer answer checks tenure before re-entering it. It reads current committed progress rather than trusting an answer's position or a diagnostic cache. Replacement members are a sorted subset of an already admitted batch, so count/encoded ACK size do not increase. Replacement identity is rebuilt by the canonical command builder and proposed through the same deterministic-entry write owner. At most one replacement is retained for the superseded batch; batches are not merged across the outstanding bound.

Changing `pending.eventKeys` to `pending.members` was traced through all command consumers. The full-coverage removal path, pending settlement, retry snapshot, refusal callback and success callback retain their identity meaning. Retained delivered members above a hole remain exact-row verifiable; compacted members cannot be resurrected as newly proven identities. Success after an actual committed original batch and a later compacted refusal are distinct outcomes; no claim of permanently retaining the original caller response is made.

## Checklist dispositions for the F1 delta

PASS is bounded by the component evidence below. SOURCE denotes inspected unchanged behavior, not new physical proof. LIMIT keeps a broader requirement open rather than counting it green.

| Recovery/replay item | Verdict and evidence |
|---|---|
| 1. Durable authority/no stale replacement | PASS: A judges exact rows before mutation; D reads L's committed prefix. Independent successive-prefix schedule and rollback. No diagnostic/census value is consumed as runtime authority. |
| 2. Restart versus live registration | SOURCE, unchanged: lane resets on tenure/replica end and reloads owed work from ledger. F1 adds no recovered historical identity cache. Original D1 restart/registration evidence remains applicable to unchanged mechanisms, not newly repeated physical proof. |
| 3. No empty/current registry laundering debt | PASS for change: only source-known pending members may reconcile; no-subscriber behavior still leaves debt owed. The independent three-event setup proves pending population before reconciliation. |
| 4. Partial-effect replay/dedup/rollback | PASS: refused mixed ACK leaves all remaining owed members unchanged; actual source-known prefix settles separately. Original rollback probe passes. No per-event tombstones are introduced. |
| 5. Missing row is not completion | PASS: compacted identity is typed refusal; above-prefix missing row remains UNKNOWN_EVENT. Original malicious cases and O7/W-D1e. |
| 6. Useful recovery and bounds separately | PASS F1 progress: partial/full known batches drain; no redelivery; pending and command counts return to zero. LIMIT F2 aggregate admitted owed debt. No whole-D1 bound claim. |

| Concurrency item | Verdict and evidence |
|---|---|
| 1. Atomic committed apply | PASS: all exact identities are judged before any row movement; `RECORDED_ONLY` still advances the consumed log. Rollback probe verifies atomic durable state. |
| 2. Check-await-act | PASS: pre-proposal reconciliation is synchronous; awaited response is tenure-fenced; second prefix advance before replacement proposal is measured. D. |
| 3. One durable settlement winner | PASS: actual ACK apply remains A/L's mutation owner. Reconciliation changes only volatile pending bookkeeping and cannot mark an owed row delivered. C independently matches 49 real histories. |
| 4. Timer interleavings | PASS component: successive-prefix test advances existing retry timers and requires canonical replacement proposal. No new timer owner is added. |
| 5. Identity/key scope | PASS: partition-local ledger position plus source-known event key; exact new claims still require digest evidence. Group source indices and ordinals remain separate from ACK marker index. Original marker/missing-ordinal attacks pass. |
| 6. Custody after timeout/cancel | SOURCE/PASS for delta: unknown original command retains members; tenure loss discards only volatile lane custody while ledger remains authoritative. O14 and source review; native cancellation cleanup is unchanged and not recertified. |

| Retry item | Verdict and evidence |
|---|---|
| 1. Retry fires or typed stop | PASS: partial reconciliation schedules the existing retry; successive shrink eventually proposes only last owed member. Full reconciliation has no remaining work and schedules no replacement. |
| 2. Frozen evidence/unreadable state | SOURCE: fixed pending member set bounds one reconciliation. SQLite progress-read failures propagate; no fallback empty/success state was added. Permanent I/O failure recovery not newly certified. |
| 3. Observable exits/logs | PASS local: IDENTITY_COMPACTED and RECONCILED are distinct named results; compacted evidence uses a normal diagnostic rather than false atomicity alarm. Invalid retained identities still alarm. LIMIT lifetime log volume remains unchanged. |
| 4. Mutual suppression | PASS: old batch retired, uncovered members retained/rebatched, retry fired. Successive-prefix witness excludes a permanent pending/ACK veto. |
| 5. Attempts/log ceiling | SOURCE/LIMIT: existing batch count/size and timer backoff remain; no added retry owner. Replacement strictly shrinks. Arbitrary outage duration and additional committed-entry drives have no newly proven global attempt/log bound. |
| 6. Late success | PASS component: separate competing commands fully cover known members without original-ID success; original ACK refuses but lane completes. No duplicate subscriber delivery or replacement remains. |
| 7. Reset semantics | PASS: transport receipt alone is not source settlement; A's committed ACK or L's committed prefix is required. No counter reset from arbitrary compacted ACK success is possible. |
| 8. Finite failure clears | PASS F1: known work remaining after atomic refusal completes via existing retry, with zero final pending commands/debt in tested cases. F2 source admission remains open. |

| Owner-interaction item | Verdict and evidence |
|---|---|
| 1. Single semantic owner | PASS: L owns standing/prefix, A exact admission, D known-pending reconciliation; C only observes correspondence. No competing runtime delivered predicate added. |
| 2. Typed boundary | PASS: IDENTITY_COMPACTED is not success; RECONCILED describes pending bookkeeping. Decision doc explicitly names authority and loss of evidence. |
| 3. Paired invariants/negative | PASS: independent mixed test both refuses exact ACK and drains legitimate remaining debt; rejected e1 is behaviorally red. Existing reclamation/no-loss tests stay green. |
| 4. Stale then fresh | PASS: original now-stale batch, then a second prefix advance, then fresh singleton ACK. C accepts mixed refusal followed by fresh drain across all subset schedules. |
| 5. Pressure/backoff | PASS F1: replacement never grows/merges batches; outstanding gate and backoff remain. W-D1f preserves lowest-owed-hole release. LIMIT F2 admission. |
| 6. Wake/release | PASS: existing retry timer and afterCommit settlement are the only continuation paths; source-owned debt drains in independent tests. |
| 7. Projection authority | PASS: observer does no mutation; test compares SQLite serialization around observation. Runtime does not consume observer result. |
| 8. Treatment fidelity | PASS: same probe source loads exact candidate or exact rejected predecessor; both negative assertions reach real old success after actual compaction. Preserved source/runtime hashes and first failures. |
| 9. No escape hatch | PASS: no legacy success for below-prefix digest, no alternate retry/raw source reader, no unbounded digest retention. Pending replacement uses canonical builder/proposer. |
| 10. Contract/registry/proof | PASS F1: explicit correction decision, restored O7/W-D1e, real mixed-lane/census proof and new reclamation witness entries in both coupled pairs. Registry audit passes. F2 acceptance is explicitly not weakened. |

| Harness fidelity item | Verdict and evidence |
|---|---|
| 1. Correct red | PASS completed A/B: predecessor returns true for exact compacted ACK and fails named assertion. Attempt1 is explicitly fixture/target-not-reached and excluded. |
| 2. Binding double honesty | PASS with ceiling: PartitionService/application/ledger/lane are real; consensus is controllable and subscriber receipts use the existing acknowledging fixture. No claim of native recipient application. |
| 3. Time ordering | PASS: explicit pending original, competing committed prefix, old apply, later prefix, then virtual retry. No expiry constants changed. |
| 4. Owner-built rows/commands | PASS: PREPARE/COMMIT, digest, event identity and ACK builder are production owners. Canonical HLC stamp retained in corrected fixture. Census uses real store application and exact declared outcomes. |
| 5. Nonvacuity | PASS: three real obligations and receipts, nonempty mixed remainder, distinct competing ACK IDs; 49 histories include retained holes and two atomic refusals. |
| 6. Real entry/owners | PASS component: committed entry/apply and actual acknowledgement proposer/lane; census goes through retained durable store and read-only original-seed observer. |
| 7. Evidence ceiling | Explicit: single controller/Node/local SQLite, controllable consensus, receipt-producing subscriber doubles. No new physical crash, network, native raft delivery, install/snapshot or service formation proof. |
| 8. Failure accounting | PASS: author red iterations and first reviewer fixture failure retained. Rejected predecessor behavioral negatives kept separate from candidate positives. Earlier nine inherited D1 cases are not converted into green; no broad rerun or new claim. |

## Remaining disposition

No blocking or nonblocking source defect was found in the F1 delta. The whole-D1 blocker **F2 remains open**: delivered-history compaction plus bounded pending ACKs do not bound admitted owed obligations. The separate F2 draft is discussed in `F2-NOTES.md`, with no implementation approval.

Root owns recording the verdict and further integration. This review grants no startup authority from the retained-seed observer, no legacy recovery exemption, no change to accepted large-input obligations and no release gate waiver. There is no remaining reviewer test process.

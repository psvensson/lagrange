---
audience: development
documentClass: evidence
---

# TX1/TX2 prerequisite review

Date: 2026-10-20. Read-only review by `subagent:release_recovery_writer`.
Source candidate: `0e9ff4fdc11152e6b4da39adb5a1046615d19be4`, branch
`work/control-refusal-provenance-20261020`, inspected in
`/mnt/data/peter/projects/.worktrees/control-refusal-provenance-20261020`.
HEAD was rechecked at 17:12 UTC. The three staged source paths at that check
were `participant-release-diagnostic-observation.js`,
`replica-handler-participant-cutover.js`, and
`partition-participant-transaction-cutover-constants.js`; none of the source
files cited below had a staged or unstaged change.

This report is authored in the separate witness worktree at
`be93c7e5d9a76a39e76a530c93715521b2281356`. Its source observations refer to
the candidate above, not to an assumed integration or landing state. It is an
additive execution input for work package D of the
[approved plan](../../insight-execution-plan-2026-10-20.md). It changes no
source, design, seal, receipt or historical evidence.

## Verdict and existing acceptance boundaries

**Source correspondence is recorded; implementation acceptance is unresolved.**
The existing coordinator, participant, application, CDC and snapshot owners
already supply several required mechanisms. This inspection neither proves
their composition nor establishes a newly reachable defect.

- `solve/quests/replicated-transaction-decision-and-apply/quest.json:7-19,37-49`
  retains its original eight-receipt seal at
  `df51b799acdb224253fdb3548ebdf8471d692f5b`, including real three-replica
  evidence and `recovery-and-cdc-survive-deadline-and-crash`. The stored receipt
  is `fail`, dated 2026-10-11. It contains seven entries: one true and six
  false. The eighth required receipt is absent. These old receipt values are
  not a measurement of the inspected candidate.
- `solve/quests/tx1-single-path-alpha/evidence/receipt.json:24-32` remains
  `fail`: current release/drain/startup/hold preservation and the replicated
  transaction regression cone remain false. The first three bounded removal
  receipts are true in their preserved evidence; that is not whole-TX1
  approval.
- The child's `checkpoint-hold.md` retains deferred-election recovery's
  exhausted healthy ten-second bound, historical W1 and M1 waits, full
  publication proof, and integrated startup/restart/crash/split/merge,
  replacement/seed-loss, application snapshot, FreshMG and CDC obligations.
  Later focused green results do not discharge those historical failures.
- No `transaction-topology-admission-barrier` Quest exists at this candidate.
  `solve/epics/raft-rs-full-cutover.md:99-103` keeps TX2 staged, requiring
  reconciliation with the existing PR100 design and actual local work before
  a meaningful red seal. Its dated progress prose is historical context,
  not current implementation acceptance.

## Source-bound owner correspondence

| Concern | Existing owner and observed boundary | Unresolved evidence or prerequisite |
| --- | --- | --- |
| Historical decision survives a replacement coordinator | `src/query/distributed/distributed-transaction-decision.js:146-176,193-202` records the decision or adopts the authoritative retained decision; uncertain persistence/read stays in doubt. `src/query/sql-query-engine-transaction-persistence-methods.js:266-295` binds the conditional mutation to transaction identity, session, epoch, frozen participant bytes and an absent decision; `:305-319` uses the gateway's authoritative read. `distributed-transaction-recovery-authority.js:102-127` refreshes authoritative state and follows the retained decision. | M5 still requires the exact current production persistence/route path with lost decision response, replacement coordinator, retained manifest and incompatible-body refusal. Source correspondence does not establish cross-host recovery. |
| PREPARED survives deadline and local restart | `src/partition/partition-participant-transaction-store.js:140-163` reads durable reservation rows. `partition-participant-transaction-session.js:177-223` reports held PREPARED rows and does not terminalize them on time. `partition-participant-transaction-apply.js:381-384` readmits reserved writes after the committed terminal transition. | Preserve the existing release/recovery prerequisite and exact authority. A caller deadline is not permission to erase PREPARED. The unresolved child recovery/regression receipts and the parent physical witnesses remain required. |
| Data, terminal result, CDC debt and applied position | `partition-participant-transaction-apply.js:397-441` runs carried operations, retains their outcomes and CDC captures, and moves the participant to its terminal state. `src/raft/raft-rs-application-transaction-owner.js:61-86` encloses the application callback and applied-state write in the same store transaction. `partition-cdc-obligation.js:146-169` records owed events inside application and starts delivery after commit. | The parent atomicity and receipt-8 obligations still need exact-candidate crash/composition proof. These source locations are not an I/O-atomicity or notification-delivery certificate. |
| Frozen participant identity and topology handoff | `src/query/distributed/distributed-transaction-participant-manifest.js:5-21` accepts canonical transaction-bound participant bytes. `src/partition/partition-participant-transaction-topology-fence.js:1-4,70-98` is explicitly an admission hint over existing topology owners; it is not the Leg B topology/commit barrier. | TX1 prerequisites precede TX2 changes. A real drain/cutover witness must preserve exact prepared/terminal routing and recovery custody before exposing a successor route. Arbitrary participant remapping is not authorized. |
| Replay through split/merge | `src/partition/partition-mirror-replay-cursor.js:89-96,118-125` selects ordinary write command types from the durable log. It does not select participant transaction commands. The existing RC2 test explicitly preserves this exclusion. | The exclusion alone is not a discovered defect. It also is not proof that a data handoff transfers prepared obligations or exact retry-result resolution. M6 remains unresolved until the topology/replay owners demonstrate the supported handoff. |
| Application snapshot custody | `src/raft/snapshot-checkpoint-store.js:302-313` removes non-peer application tables from the rs-raft copy path. `src/partition/partition-snapshot-cadence.js:8-19,70-73` explicitly reports `COMMITTED_LOG_UNSUPPORTED` for the ordinary eligible partition tick. The child's `design.md:243-249` records current application snapshot custody as a separate obligation. | Do not infer a TX1 application snapshot from the membership payload path or from the legacy SQLite payload's table preservation. Prepared, outcome and owed-CDC transfer requires its own supported application owner path and witness. No snapshot repair is proposed here. |
| Safe reclamation | `src/partition/partition-committed-statement-outcome-constants.js:17-21` leaves outcome growth to the snapshot/log-bound work. `partition-cdc-obligation-constants.js:79-81` leaves owed-row snapshot retention and delivered-row reclamation to the existing retention owner; its SQL table has no local reclamation policy. | M8 requires delayed old retry after metadata collection and an authoritative identity-retirement or equivalent rule. A local TTL is not that rule. Safety and resource/performance verdicts remain separate; retaining rows is not proof of bounded storage. |

## Existing witnesses and their ceilings

`test/integration/transaction-coordinator-restart.integration.test.js:112`
already exercises interrupted COMMIT fanout and a recovered coordinator.
Its helper, `test/test-helpers/transaction-coordinator-group-fixture.js:11-15`,
explicitly uses a local SQLite coordinator gateway double. It reconstructs an
engine over retained rows; it does not prove a replicated coordinator store,
process death or cross-host failover. Preserve this witness and its limit
when selecting the next M5 discriminator.

`test/partition/partition-transaction-replay-cursor-v4.test.js:138` retains
the RC2 transaction-command exclusion. The topology request-owner witness in
`test/partition/partition-participant-transaction-topology.test.js:88`
tests the admission hint. Neither is a TX2 prepared/terminal handoff witness.

`test/partition/participant-release-retention-native.test.js:11` covers
retained release settlements beyond four outcomes with an unresolved
obligation. Its population is release settlement; it cannot be promoted to
transaction replay-record reclamation proof.

No listed test was run for this review. No full static, integrated-corpus,
lab, GCP, production, independent implementation acceptance or publisher
result is claimed.

## Historical worktrees and writer coordination

The following local state was observed on 2026-10-20. These counts are a
point-in-time inventory, not authority to adopt, discard or merge bytes.

| Worktree under `/mnt/data/peter/projects/.worktrees/` | Observed HEAD | Dirty status entries | Dirty tracked `src` paths compared with the inspected candidate |
| --- | --- | ---: | --- |
| `tx1-work-20261010` | `e7c89f4b5114c0238312d3831b65889a4622f4e9` | 363 | 71 paths: 50 byte-identical, 19 different, 2 missing on one side |
| `tx1-cdc-20261011` | `e7c89f4b5114c0238312d3831b65889a4622f4e9` | 142 | 56 paths: 11 byte-identical, 44 different, 1 missing on one side |
| `tx1-query-20261011` | `be99622d6b21162e9cc459104d7f1b5d8cd3830d` | 79 | 21 paths: 16 byte-identical, 5 different |
| `tx1-seed-composition-20261010` | `e08c103fdce6838fa4311eef3b34a98627d468d9` | 0 | No dirty tracked source paths |

The query differences include the transaction coordinator, recovery,
participant byte owner and query initializer. The participant and CDC trees
overlap application, release/lifecycle, bootstrap and notification owners.
Many dirty bytes already match the candidate; blindly replaying these trees
would be unjustified.

No process whose working directory was under these four worktrees was found
at the check. This narrow observation does not establish that a writer has
relinquished ownership or that another process is not using their paths.
Reconcile current owners before activating a source change. Keep one writer
for each shared interaction.

## Bounded continuation

Continue the existing TX1 decision/recovery and receipt-8 work under their
current prerequisites. The next D discriminator should close a specific
missing real-owner boundary, such as retained COMMIT and exact manifest
recovery through the actual coordinator persistence route, with a positive
case and a targeted semantic negative. Preserve the established local and
native witnesses rather than replacing their contracts.

Keep topology handoff, application snapshot custody and replay-record
reclamation as separately bounded follow-ups within the existing epic.
Their source gaps and unmeasured gates are not permission for a new ledger,
retry framework, topology authority or broad redesign. The plan's M5, M6 and
M8 production verdicts remain **UNRESOLVED**.

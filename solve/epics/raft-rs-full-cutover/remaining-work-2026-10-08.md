# Remaining cutover and 0.3 work - 2026-10-08

Status snapshot and work ordering; not a new authority, acceptance change or
completion receipt. Product source reviewed:
`3fda8406d4c97bfd47231072e8065fb61f3a13f6` (runtime unchanged since
`605789e86aaf7dcca8fa4406235388b998460eb0`).

## Cutover implementation still required

1. Finish the existing FreshMG production chain. Dormant repository admission,
   terminal/non-admission resolution, promotion-versus-abandonment selection,
   initial learner intent and the repository-to-native consumer are increments,
   not the full operation. Wire the real operation owner, recipient/transport
   identity, current runtime authorization, committed learner observation,
   exact durable CREATE and actual transfer/open. Then promotion, named handoff,
   old-source removal, both absence proofs, exact cleanup, and outstanding-debt
   restart recovery must execute through the existing owners. Do not simply
   remove planner/handler parks or accept copied test admission packages.
2. Complete/classify snapshot and reconstruction interactions: intact local
   reopen, known destructive loss, accepted native Ready plus application-image
   install, and unavailable authority. A legacy-image refusal or isolated fresh-
   learner component test is not proof of intact partition catch-up.
3. Resolve the recorded lab failures by owning interaction. The original
   941/918/23/30987 result remains FAIL. Fixed-source attribution reproduced
   fifteen assertion/fixture failures at both base and candidate; that does not
   waive them. Query election/retry timing, one environment-sensitive owner-path
   result and six slow failures remain open. Two fixture/steering corrections
   are published; the restart file's duration contract remains unresolved.
4. Resolve runtime-source review/complexity and current writer/reader census
   findings without deleting negative tests or blindly accepting new allowlist
   entries. Preserve J1: durable promotion authorization chooses forward
   recovery; target rollback cannot race source retirement.

The next bounded investigation is the election/unknown-outcome retry window.
Use the existing clock, delay, budget and native tick owners. Distinguish a
controlled owner-boundary response schedule from real composed SQL/Raft
execution. Missing the request deadline must remain typed unknown with the
same entry identity, never success or an invented cancellation.

## Candidate ready to integrate versus epic DONE

Before shared-main integration: compose only independently accepted increments,
freeze one exact candidate, reconcile with current main, and run the applicable
ordinary/bootstrap/exclusive/static/owner-boundary and zero-reference gates.
Prove the actual FreshMG two-serial-replacement scenario on distinct off-seed
storage, then seed-storage loss, new quorum/election, authoritative SQL write
and read, CDC and routing/cache reconstruction. Preserve all failed runs.
Run the remaining exact-candidate R8 matrix: cold 3/5-node formation, topology
changes, leader loss during acknowledged writes, restart/reconstruction,
snapshot/wiped follower handling, hostile metadata, retained worker/WASM paths
and the approved runtime-fatal/blast-radius contract. Earlier implementation
or component proof is not automatically absent, but must be traced to current
accepted bytes and remeasured where required.

After controlled integration: verify the actual main SHA and durable full
release proof for that SHA; remeasure core-convergence readiness Q0. Only then
may the epic oracle become zero/terminal. The parent epic explicitly requires
exact-main evidence, so full epic closure cannot truthfully precede the main
commit it certifies. Do not reinterpret this ordering as permission to merge a
red candidate. PR #73 is still an older draft at 6df3ec5e; it is not the current
composed product. No merge or release is authorized by this status note.

## Separately required for Release 0.3 Queryable Core

Current authoritative branch PR #74 is
`quest/0-3-queryable-core-foundation` at
`0ec0d720e2278d756149a334d8bcb7a7543eb4a6`.
Its PR description tracks A1-v13; the tasks.md A1 heading still says v12.
Treat the actual v13 Quest/evidence as current, not the stale heading.

- A1: final exact-cutover compatibility check, independent review and Solver
  landing; PR #103 is a review surface, not a direct merge source.
- A2-A6: typed durable boundaries/index tuples, declared primary-key metadata,
  compound-PK narrowing, existing local index DDL/lifecycle wiring, and correct
  ordered-prefix/range planner semantics plus explanation.
- B1-B5: locking-read wait/conflict/recovery policy, canonical FOR UPDATE AST,
  replicated participant reservations, release/cancellation/restart, public PG
  proof. No PG-local lock authority or new transaction coordinator.
- C1-C5: choose and seal non-unique global-index maintenance mode, managed dataset
  lifecycle, resumable backfill, maintenance/recovery and correct routing/fallback.
- D0-D6: repair roadmap authority, canonical live-plan dependencies, selective
  partition CDC, gap-free initial frontier, result maintenance/reexecution,
  shared subscription/topology recovery and unsolicited anti-polling API proof.
- Prepared/in-flight 2PC across split/merge: separately blocked under PR #100,
  currently one design commit daddead73. The user chose FIX AND PROVE, not a
  release exclusion. Replicated durable PREPARE/recovery and the owning split/
  merge cutover barrier must preserve the original participants.
- E1/E2: all supported capability/exclusion evidence, current docs/examples,
  one final version/changelog commit, exact-main publishability/full release
  proof, preflight, then the release owner's explicit tag/publish action.

This is the current agreed scope, not a recommendation to expand it. A smaller
0.3 would need an explicit new owner decision; it is not assumed here.

## Followups that must not silently expand the gate

The parent epic separates part-(b) followups from part-(a) cutover closure.
Foreign-replica startup sweeping is mandatory before advertising in-place
upgrade from affected MOVE builds; otherwise that upgrade stays explicitly
unsupported. Dead MOVE handoff deletion, lingering-group operator retirement
and wider unresolved-operation convergence retain their recorded dispositions.
Do not imply an unimplemented reseed/operator exit exists. Broad architectural
convergence remains behind cutover and Q0, not an extra rewrite prerequisite.

## Evidence and resource policy

Keep Actions/GCP for owned measurements and distributed runs; the user's local
agent remains test-only and stopped after the failed selection. No repeat full
lab run, physical baseline or statistical campaign on unchanged blocked bytes.
The raw uploaded lab tar is still local/conversation evidence unless an actual
canonical upload is recorded. Never claim it is durably published by inference.
A runner PASS means only the named measurement passed. It does not waive the
separate duration policy, prove distributed acceptance, or confer independent
source approval.

# Closeout plan: steps from the current lanes to a main merge (2026-10-17)

Status snapshot and work ordering requested by the owner on 2026-10-17; not a
new authority, acceptance change or completion receipt. Binding sources it
orders, never rewrites: the epic's completion criteria (parts a, b, c), the
owner rulings of 2026-10-04 (closeout) and 2026-10-05 (integration order,
certification, closeout shape), the alpha single-path decision of 2026-10-13,
and the sealed oracle `solve/oracle/raft-rs-full-cutover.json` (metric 8,
target 0, status `transport-predecessor-in-progress`). This file is updated
by appending dated status lines under "Tracking"; earlier lines stand.

## 1. Where the work is (measured 2026-10-17)

`origin/main` has moved only by nightly formation-trend records since the
rs-raft lanes forked (merge-base of the creation lane with main is
`d60c30921`, 2026-10-04; main is 13 inert commits ahead of it). The cutover
therefore lives in branches that have diverged from EACH OTHER:

| Branch (origin unless noted) | Role | Relation to the creation lane `work/rs-raft-event-reconciliation-20261016` (89e70949f) |
| --- | --- | --- |
| `finalize/zero-liferaft-2026-10-02` (PR #73 to main, draft; head 6df3ec5e1) | the zero-Liferaft integration PR, exact-SHA qualified 2026-10-07 | 12 commits NOT in the lane (merge-base 26bdc07e3) |
| `integration/rs-raft-candidate-20261011` | candidate: FreshMG C1/C2 + TX1 increments 1-4 + C0 record reconciliation + ratchet repairs | 59 commits NOT in the lane; lane 381 ahead of their common base |
| `integrate/rs-raft-contract-first-20261008` (PR #104) | C0 contract-first canonical continuation | 9 commits NOT in the lane; lane 528 ahead |
| creation stack PRs #127-#134 (this lane) | service-instance selection, creation intent, bound bootstrap, genesis, event reconciliation, serving/publication/retirement | contains `handoff/rs-raft-safety-first-20261010`, `work/freshmg-registered-learner-read-20261009`, `resume/rs-raft-runtime-recovery-20261012`, `continue/rs-raft-control-pause-census-20261014` |
| `integrate/rs-raft-2026-09-30` (LOCAL only, primary checkout, another agent's 18 staged paths) | replica-lifecycle r8 D1-D11 integration from 2026-09-30 | 311 commits not on main, forked before every lane above (merge-base e0b0854f3); not pushed; must not be touched by this lane |

Open quests in the epic: 23 (board 2026-10-17). The long poles by attempt
count: `zero-liferaft-active-runtime` (77), `message-group-fresh-identity-membership`
(50), `replicated-transaction-decision-and-apply` (47). `cutover-transition-authority-review`
(C0) last stood REJECT (truncated fork; canonical continuation = PR #104).

## 2. What "mergeable" means here (the bar, not restated)

- Epic part a: every active consensus group rs-raft; no selector/fallback;
  old durable state refused; message groups/worker/WASM rs-raft or removed;
  measured election settings enabled and re-certified; runtime blast radius
  owned; snapshot/recovery rs-raft; old files and dependency gone; zero-reference
  ratchet green; exact-main release proof durable; Q0 READY; fresh-identity
  message-group ADD/promotion proven and mg-1 replicated off the seed.
- Closeout shape (ruling 11): integrated PR head, each merged quest SHA,
  verifier verdicts, static/integration/lab results, exact certification
  topology, release blockers vs follow-ups, three consecutive certification
  formations passing at one frozen SHA (five distinct machines, host-level
  spread, any spent wait fails, durable per-run evidence with digests).
- Merge mechanics: independent verification before merge; the owner's
  authenticated GitHub approval plus an append-only quest-log decision naming
  the exact merge SHA; a GitHub-merged head has no corpus proof until
  `npm run publish -- --post-merge <sha>`; then the parked governance quests
  A and B land on the new main.
- Part c stays separate: PG-wire DML row counts, `RETURNING`, 2PC atomicity
  at split/merge, in-place upgrade from builds that moved message groups. An
  epic-level "no regression from main" never clears one of them.

## 3. Steps, in order, with the acceptance each must show

### Step 1. Finish the creation lane to a bounded closure (owner: this lane)

- 1a DONE 2026-10-17: serving grant, receiver-local publication,
  RETIRED-before-CLOSED (89e70949f; verified APPROVE; lab-accepted).
- 1b IN FLIGHT: amendment A2/A2' bounded owner-side re-decide for slot
  transitions (owner decision 2026-10-17; vetted; Opus implementer running).
- 1c discovery stage: endpoint/services-row/ACTIVE projection and role/leader
  publication for bound replicas with the instance-qualified identity; the
  production `creationWake` consumer wired into the operation owner; F-M1/F-W2
  witnesses; `CONSUMER_ABSENT` observability.
- 1d recovery stage: COMPLETED-row re-entry, restart-scan retirement custody
  (`service-lifecycle-recovery.js` generic rows), intact restart with metadata
  unavailable, by-path tombstone `storage` field.
- 1e terminal landing of `wasm-creation-genesis` with its eight receipts
  (`contract-approved`, `creation-native`, `recreation-mutation`,
  `async-custody`, `process-recovery`, `writer-completion`, `static-cone`,
  `independent-final-review`) through `solve land`.
- Acceptance: quest probe done; retained lab selection green at the exact tip;
  the three lane reds recorded 2026-10-17 (`durable-commit-replica-kinds`,
  `wasm-service-group-on-raft-rs`, `wasm-service-replica` unit) owned and
  fixed or formally parked by their owners before step 2 completes.

### Step 2. Compose ONE integration candidate (owner: integration lead; start as soon as 1b lands)

- Branch `integration/rs-raft-candidate-<date>` from the creation lane tip;
  merge in this order, one merge per commit, hooks enabled, no `--no-verify`:
  (i) PR #73 head (12 commits; exact-SHA qualified), (ii) the 2026-10-11
  candidate (59 commits: FreshMG C2 component, TX1 increments, C0 record
  reconciliation, ratchet repairs), (iii) contract-first (9 commits).
- Quest logs: union append-only per quest (the TX1 and C0 logs forked; the
  codex union recipe is recorded in the 2026-10-12 handover); never truncate.
- Conflicts resolved through the owning module, by the owner's reading, never
  by taking one side wholesale; every resolution a named finding.
- Regenerate metadata, owner-debt inventory and import-graph seal; ratchets
  tightened on hints, never raised; literal/complexity/duplication reds repaired
  at their owner.
- OWNER DECISION NEEDED before (iv): whether the local
  `integrate/rs-raft-2026-09-30` work (replica-lifecycle r8 D1-D11, 311
  commits, unpushed, another agent's staged paths) is composed, superseded by
  the later lanes, or archived as a preservation ref. This lane will not touch
  it; the question is raised here and in the owner's next session.
- Acceptance: one pushed candidate head; retained lab selections of every
  merged lane green at that head; full corpus on the lab (all shards, one
  frozen SHA) with every red classified at base; static gates green.

### Step 3. Close or park the epic's open quests on the candidate head (owners: each quest)

Required to close (part a and rulings): fresh-identity message-group
ADD/promotion with mg-1 replicated off the seed (MG1); TX1 with all eight
receipts and the alpha single-path deletions (no sessionId transport fallback,
no local BEGIN/PREPARE/COMMIT engine, no competing prepared-state
reconstruction); C0 authority review to APPROVE on the canonical continuation;
snapshot-receiver-admission and snapshot-lifecycle-staging-boundary;
replica-opening-history; startup-refusal-cleanup-custody;
replica-cleanup-host-custody; zero-liferaft-active-runtime (zero-reference
ratchet, old files and dependency deleted); measured election settings
(`pre_vote`, `check_quorum`) enabled and the disruption matrix re-run through
the production port; runtime failure isolation proven or bounded and approved.
The remaining open quests (seed-release and participant-release family,
inbound liveness/extent, storage reservation lost-outcome, wasm-writer-slots,
alpha single-path, ordering completion consumer, control proof amortization)
close, fold into one of the above by owner decision, or park with a recorded
reason. The follow-up quests of part b (`message-group-foreign-replica-startup-sweep`
REQUIRED before any in-place upgrade claim; `move-replica-handoff-deletion`;
`group-retirement-operator-retirement-fact`; `single-unresolved-operation-owner`)
stay follow-ups unless an owner ruling pulls one in.
Acceptance: epic oracle metric 0; Q0 READY for core convergence.

### Step 4. Prove the frozen candidate head (owner: integration lead; lab)

- Full corpus on the lab at the exact head (lab-first; placement by
  discovery, never hardcoded hosts; thermal gates; one exact PID per kill).
- Static gates and ratchets green (`npm run test:static` set).
- Three consecutive certification formations at the SAME frozen SHA on five
  distinct eligible machines with host-level spread, publication convergence
  independently observed with the stability window, any spent wait = FAIL,
  manifest/verdict/gates committed per run with node-log digests recorded on
  the quest log.
- Acceptance: three passes in a row; a red restarts from run 1 after its fix.

### Step 5. Closeout report and independent verification of the integrated head

- Report in the ruling's three parts: conditions met (with the merged quest
  SHAs and verifier verdicts), follow-up quests created, release blockers that
  remain (part c, each with its owner).
- One independent verifier (verification protocol v2, category-complete) over
  the integrated head and the report; REJECT names every finding in one round.
- Acceptance: APPROVE recorded on the epic's quest records.

### Step 6. Merge and publish

- PR to main from the candidate (supersedes PR #73 or fast-forwards it), draft
  removed only after step 5.
- Owner's authenticated GitHub approval + append-only quest-log decision
  naming the exact merge SHA; receipt-route authorisation finding on top of
  the merge.
- After the GitHub merge: `npm run publish -- --post-merge <sha>` so the
  corpus proof binds the merged head; then land the parked governance quests
  (A `src-changes-land-through-the-solver`, B `verification-binds-and-classes`)
  on the new main in that order with fresh approvals.
- Release 0.3 is a separate gate: part c items are fixed or excluded by the
  supported-contract documentation before any release claim.

## 4. Rules that govern every step

Systemic, never local (census consumers, one owner per subsystem and per
interaction); lab-first for suites and batches; independent verifier before
any src lands; one writer per worktree; preservation pushes for every unit;
no baseline raises; first failures preserved; read the owner's code in full
before changing it; red signatures matched against the base before being
called known.

## 5. Tracking (append dated lines; do not edit earlier ones)

- 2026-10-17 plan written; step 1a done (89e70949f); step 1b in flight;
  owner question for step 2 (the local 2026-09-30 integrate work) open.
- 2026-10-17 step 2 conflict probe (scratch worktree at 89e70949f, each merge
  aborted): PR #73 head merges clean (12 commits: CI release-proof delegation,
  PR73 metadata/seal refresh, two test conformances; 3 files); contract-first
  merges clean (9 commits, contracts/docs/analysis; 8 files); the 2026-10-11
  candidate conflicts in 9 files (src/raft: committed-membership-context,
  committed-membership-read, operation-port, peer-identity + constants,
  runtime-owner; src/rebalancer: message-group membership authorization and
  permit; test/shards/impact-contracts.json) with 131 clean changes. None of
  PR #73's 12 commits is in the candidate. Composition order stands: lane tip
  -> #73 -> contract-first -> candidate (conflicts through the raft port and
  message-group membership owners).

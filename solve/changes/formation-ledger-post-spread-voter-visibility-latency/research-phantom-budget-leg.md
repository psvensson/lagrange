# Research: the "phantom budget" leg (run-27, 13:22:09-13:22:19.6)

Quest: `formation-ledger-post-spread-voter-visibility-latency`. Logs:
`solve/changes/formation-ledger-spread-window-follow-up-latency/run27-node-logs/node-{0..4}.log.gz`.
Node ids: node-0 = `1024dc6c`, node-2 = `d267454f`, node-3 = `f1bb7a68`,
node-4 = `6b8aeeb7`, node-1/other = `aa4a50e7`.
Skip census 13:22:09-13:22:20: node-0 **80** x `budget_exceeded`, node-3 **4** x
`budget_exceeded`, zero skips of any other reason on any node; last skip
13:22:19.463, client CREATE failed 13:22:19.605, "Shutting down..." 13:22:19.682
(node-0 main).

## Q1: which budget lane produced the skips? NEITHER — `budget_exceeded` here is the operation-ledger interlock, not the concurrent-add budget

The concurrent-add budget lanes never ran for these skips. In
`createOperationInternal`, the ledger interlock
(`ensureOperationLedgerSelfMoveSerialized`) executes at
`src/rebalancer/rebalance-coordinator-operation-creation.js:291-297`, BEFORE the
budget gate `runConcurrentCreateBudgetGate` at line 336. Every interlock
rejection is deliberately typed as the standard budget skip:
`createOperationLedgerInterlockError` calls
`this.createConcurrentOperationBudgetError(normalizedMoveType, 1, {message})`
(`src/rebalancer/rebalance-coordinator-ledger-interlock-admission.js:322-339`),
i.e. `rebalanceSkipReason=BUDGET_EXCEEDED` at hard-coded **limit 1**, with the
real cause only in `error.message` / `error.admissionResult.reason` — neither of
which the MOVE_SKIPPED log line prints (`error:null`,
`admissionDecisionType:null`; emission at
`src/rebalancer/unified-rebalancer-follow-up-move.js:623-643`).
`admissionDecisionType=null` is consistent with a throw before any
storage-admission decision.

Smoking gun that the interlock (quorum-spread branch) was the thrower: the DDL
provisioning path DOES print the wrapped error, and at 13:22:19.605-19.606
node-0's `sql-query-engine` / `table-creation-service` show **all five nodes**
rejected with `blockingReasons:["operation_ledger_quorum_concentrated"]`,
message "Operation-ledger partition replica_operations-p1 quorum is
concentrated on one node; operation admission deferred until the ledger
spreads" (node-0 13:22:19.605 "Provisioning target-node convergence timed out"
rejectedTargetNodePlans; 13:22:19.606 "Initial table partition provisioning
failed": `rejected=<all nodes>:operation_ledger_quorum_concentrated`).

Lane facts for completeness (had the budget gate been reached):

- All skipped partitions (`control_plane_publications-p1`, `sql_transactions-p1`,
  `sql_transaction_participants-p1`, `sql_write_operations-p1`,
  `replica_operations-p1`) are in `PRIORITY_CONTROL_PLANE_TABLE_IDS`
  (`src/bootstrap/system-partition-classification.js:17-23`), so a REPLACE of any
  of them takes the PRIORITY lane: `shouldUsePriorityConcurrentAddLane` returns
  true for ADD/REPLACE + priority partition
  (`src/rebalancer/rebalance-coordinator-concurrent-add-budget.js:113-129`), and
  the read mode resolves to `OWNER_RPC_RECHECK_ON_SATURATION`
  (same file, lines 86-111).
- Limits in the 5-node demo (no demo override found in scripts/config; grep for
  `maxConcurrentAdds` outside src is empty): `config.maxConcurrentAdds` = **5**
  (`src/rebalancer/rebalancer-constants.js:80` `MAX_CONCURRENT_ADDS: NUM.FIVE`,
  wired `src/rebalancer/rebalance-coordinator-lifecycle.js:162-164`).
  `ordinaryPriorityAddBudgetLimit = maxConcurrentAdds = 5`;
  `emergencyPriorityAddBudgetLimit = 5 (+1..2 overflow slots only while
  emergency recovery is active)`
  (`src/control-plane/priority-recovery-snapshot-workflow.js:60-69`).
- Rows each coordinator could have counted: only two operations ever existed
  (op-1 `69cd7863`, op-2 `9ab6ae15`), so cached-incomplete counts were 0-2 in
  the whole window — **never ≥ 5**. The counting lanes mathematically could not
  return `budget_exceeded`; decisive that the interlock did.

## Which interlock branch each skip came from

`ensureOperationLedgerSelfMoveSerialized`
(`rebalance-coordinator-ledger-interlock-admission.js:129-220`) throw sites, all
surfacing as `budget_exceeded`:

- B1 (lines 160-171): disruptive ledger self-move waits for idle ledger
  (`operation_ledger_self_move_waiting_for_idle_ledger`).
- B2 (lines 192-219): other ops defer while a live ledger self-move row exists
  (`operation_ledger_self_move_in_flight`).
- B3 (lines 233-256, `ensureOperationLedgerQuorumSpreadFirst`): the run-22
  quorum-spread hold (`operation_ledger_quorum_concentrated`).
- Plus the synchronous co-scheduling gate
  `runOperationLedgerInterlockAccountedCreate` /
  `assertOperationLedgerSelfMoveGateOpen` (lines 355-480), same error type.

Evidence:

- **Dependent REPLACEs (the ~82 skips) = B3, the quorum-spread hold.** Node-0
  WARN 13:22:03.528 (1 ms after op-1's first completion 13:22:03.527) and node-3
  WARN 13:22:06.855: "Operation-ledger quorum concentrated on one node;
  deferring dependent operation admission until the ledger spreads",
  `concentratedPartitions=[{partitionId:replica_operations-p1, totalVoters:2,
  maxVotersOnOneNode:2, hottestNodeId:1024dc6c(node-0),
  spreadActionable:true}]`. The warn is rate-limited to one per 30 s per
  coordinator (`OPERATION_LEDGER_QUORUM_HOLD_WARN_INTERVAL_MS`,
  ledger-interlock-admission.js:42, 291-300), so all later rejections in the
  window are silent — and the 13:22:19.605 provisioning rejection proves the
  hold was STILL engaged on every node at shutdown.
- **The cure self-move skip (node-3 13:22:17.488, REPLACE
  `replica_operations-p1-r3` → node-4)**: two moves entered execution in the
  same tick — node-3 "Executing rebalancing move" for BOTH
  `replica_operations-p1-r3` and `control_plane_publications-p1-r1` at
  13:22:17.487, skipped at .488 and .490. The exact throw site is not
  distinguishable from logs (message not logged on the rebalance path); the two
  candidates are (i) the synchronous gate — the concurrent publications create
  held `otherCreatesInFlight>0` when the disruptive self-move entered
  (`assertOperationLedgerSelfMoveGateOpen`, lines 465-480), and/or (ii) B1
  against a stale non-terminal op row in the cache-preferred read
  (`queryIncompleteOperations` default
  `CACHE_PREFERRED_SQL_FALLBACK`,
  `src/rebalancer/rebalance-coordinator-operation-read-methods.js:41-81`; cached
  rows, when present, are used as-is —
  `src/rebalancer/replica-operation-repository-visibility-methods.js:652-686`).
  Not observed: any log of node-3's ops-row cache content at 13:22:17.

## Q2: the row/actuals staleness — what was actually stale, and what "unblocked" at 13:22:19.65 (answer: nothing — the run ended)

### Ops-row (replica_operations) terminal-status trace

- Who writes COMPLETED: the coordinator driving the workflow. For op-1
  (`69cd7863`, REPLACE `replica_operations-p1-r1`@node-0 → r4@node-3; created
  by node-0 13:21:46.059 "Creating operation"
  targetNodeId=f1bb7a68): node-2 (`d267454f`) drove settlement — "Priority
  recovery drain settled operation" 13:22:03.016; then **"Committed replica
  operation transition not yet authoritatively visible" (status=removed) +
  "Committed terminal transition not authoritatively visible; repair scheduled"
  at 13:22:09.625; "Operation completed" 13:22:09.987; "Terminal transition
  repair confirmed authoritative visibility" 13:22:10.220** (all node-2). So the
  terminal write itself took ~6.5 s (13:22:03.5 → 13:22:09.99) to become
  authoritatively visible — a write INTO the ledger while the ledger was
  finishing its own move (leadership handed to r4@node-3 13:22:02.767-03.026).
- CDC extraction at the new ledger leader (node-3, r4 "Became leader (liferaft)"
  13:22:03.026) was LIVE, not stalled: node-3 `partition` "Fetched updated row
  for CDC" tableName=replica_operations at 13:22:03.515, 13:22:04.476,
  13:22:08.066 (op-2 completion write, completed_at=13:22:08.065), and
  13:22:10.139 (op-1 terminal repair write). Node-3's cache reconciliation had
  been lagging one step behind authoritative through 13:22:06.9-08.119
  ("Cache/authoritative divergence detected during reconciliation" for
  `9ab6ae15`, cacheValue creating vs authoritative active/completed_at set at
  13:22:08.119). After 13:22:10.2 neither coordinator logs ANY op-row activity
  (no divergence, no non-terminal sighting) — **not observed** either way, but
  authoritative + extracted terminal by 13:22:10.2. The ops-row staleness
  therefore bounds at ~7 s (03.5→10.2) and cannot explain the 13:22:12-19.5
  skips.

### What actually stayed stale ≥11-16 s: the SERVICES-row voter view

The quorum hold's only input is `systemTableCache` `services` rows filtered on
`status ∈ {active, removing}` AND `raft_role ∈ {leader, follower, candidate}`
plus `nodes`/`partitions` rows
(`src/rebalancer/operation-ledger-quorum-concentration.js:24-29,48-55,170-208`).
Cache-only, synchronous, no authoritative fallback ("actuals-only" by design
comment, lines 8-19).

Ground-truth placement vs what the hold saw:

- r1: physically removed from node-0 at **13:22:02.905** (node-0
  replica-handler "Replica removal completed" `replica_operations-p1-r1`).
- r4: voter-ready 13:22:02.191, **leader at 13:22:03.026** on node-3.
- r5: **voter-ready 13:22:07.704** on node-2 ("Replica reached voter-ready
  activation state").
- So true voter placement from ~13:22:08: {node-0: r3, node-3: r4, node-2: r5}
  = 3 voters, max 1 per node — **NOT concentrated**. Yet every admission view
  still computed `totalVoters:2, maxVotersOnOneNode:2, hottest=node-0` (the
  13:22:03.5/06.8 warns) and still rejected with
  `operation_ledger_quorum_concentrated` at **13:22:19.605** on all 5 nodes.
- The caches DID have the new replica ROWS (inserts propagated): node-3 planner
  at 13:22:17.370 "Deferring spread-driven count-increasing ADD while already
  at/over target replica count" for `replica_operations-p1` — it saw ≥ target
  replicas, which is why it planned the count-neutral cure REPLACE r3→node-4.
  What it did not see were the UPDATED FIELDS: r1's row still voter-qualifying
  (status active/removing) and r4/r5 rows not voter-qualifying (raft_role not
  leader/follower). tv=2/max=2 is exactly {r1,r3}@node-0 as voters with r4/r5
  present-but-not-voters.
- Role/status write-path distress in the window: node-2 "Metadata publication
  CAS missed observed state; refreshing guard row from authority" for
  `replica_operations-p1-r5` (raftRole=follower) at 13:22:07.708 and
  13:22:08.909; node-3 "Replica create status write deferred after retryable
  control-plane failure" 13:21:56.956; node-2's op-1 terminal write needing a
  visibility repair (above). No log shows the r1-removal / r4-leader /
  r5-follower services-row updates reaching any coordinator cache before
  shutdown — consistent with the quest's leg A (raft_role/status write
  visibility loss), and 13:22:19.605 proves the stale view persisted cluster-wide.

### The 13:22:19.65 "unblock" is a misreading

Nothing unblocked. Node-0: client provisioning timed out 13:22:19.605 (after
`waitedMs:19663` of a 30 s budget window that started at the 13:21:59.941
"Whole-cluster transient provisioning hold" retry), "Initial table partition
provisioning failed" 13:22:19.606, main "Shutting down..." 13:22:19.682,
"HeartbeatService published shutdown status" 13:22:19.696. The node-0 "Fetched
updated row for CDC" burst 13:22:19.653-13:22:21.074 is `nodes`-table rows
(shutdown-status heartbeat writes) plus one `control_plane_publications` insert
at 13:22:19.803 — not ops-row or services-row fan-out. CDC propagation then
stops: "CDCGroupPropagationService stopped" 13:22:21.172 (node-0) /
13:22:22.678 (node-3).

### control_plane_publications dependency?

Plausible contributor, not directly evidenced as the blocker. Node-3 spams
"Membership reconcile deferred: not the control_plane_publications
write-leader" throughout 13:22:06-13:22:10+, and the services-row role writes go
through the metadata-publication guard/CAS machinery that was missing CAS on
node-2. But `control_plane_publications-p1` never actually moved (all its
REPLACEs were themselves skipped by this same hold), so its leadership was not
in transit; the write-leader ambiguity predates the window. Periodic
"CDC catch-up hydration completed" cycles ran on both coordinators every ~5 s
(node-0 13:22:08.928/13.969/19.088; node-3 13:22:06.241/11.773/17.061) yet did
not refresh the voter fields — the staleness is upstream of consumption
(the services-row updates themselves not visible/authoritative), which again
points at leg A's write-visibility surface rather than a consumer stall.

## Q3: was the authoritative-owner fallback available? Yes — but structurally upstream-bypassed

- Both counting lanes carry the fallback: ordinary lane saturation →
  `resolveAuthoritativeAddAdmission` with
  `OWNER_RPC_REQUIRED`
  (`src/rebalancer/rebalance-coordinator-priority-budget-helper.js:394-417,
  452-483`); priority lane saturation → authoritative
  `getConcurrentAddCountByPriorityClass` with `OWNER_RPC_REQUIRED`
  (same file, lines 560-596). The read mode passed in was correct
  (`OWNER_RPC_RECHECK_ON_SATURATION` for priority control-plane partitions,
  concurrent-add-budget.js:104-110).
- They never corrected anything because **the throw happened one gate earlier**:
  the ledger interlock runs before `runConcurrentCreateBudgetGate`
  (operation-creation.js:291 vs :336) and its quorum-spread branch is
  synchronous and cache-only (`evaluateOperationLedgerQuorumConcentration(this.systemTableCache)`,
  ledger-interlock-admission.js:233-239) — there is NO authoritative re-read of
  services/nodes/partitions rows anywhere on that branch, by explicit design
  ("actuals-only", quorum-concentration.js:8-19, 158-166). `admissionDecisionType=null`
  in every skip line confirms no admission decision was ever computed.
- The interlock's async row check does have observation-state handling
  (deferred outcomes throw `DEFERRED_RETRY_PENDING`, ledger-interlock-admission.js:175-185),
  but a stale CACHED non-terminal row is a successful observation, not a
  deferred one — cache-preferred reads return cached rows as-is with no owner
  recheck (replica-operation-repository-visibility-methods.js:675-682).

## Q4: VERDICT

**Binding mechanism: (a) — leg B is downstream of the voter/role-write
visibility loss.** The 84 `budget_exceeded` skips and the 13:22:19.605 client
failure were all one mechanism: the operation-ledger **quorum-spread hold**
(`operation_ledger_quorum_concentrated`) evaluated over `services` rows whose
`status`/`raft_role` fields were 11-16 s stale against real placement (spread
was physically complete by 13:22:07.7: r1 removed 13:22:02.905, r4 leader
13:22:03.026, r5 voter-ready 13:22:07.704 — yet all five nodes still computed
2-voters-on-node-0 at 13:22:19.605). The hold reads exactly the raft_role/status
write surface that leg A already owns; when those field updates land, the hold
releases — no ops-row CDC change needed for THIS leg.

- Not (b): the ops-row CDC/terminal-visibility gap was real but bounded
  (~13:22:03.5→10.2; terminal write repair 13:22:09.99/10.22, extracted by the
  new leader's CDC at 13:22:10.139) and did not bind the 13:22:12-19.5 skips —
  those were the quorum hold, whose input is services rows, not ops rows. The
  ops-row gap (writes into the mid-move ledger needing a visibility repair) is
  the formation-circularity flavor, but it self-healed 9 s before the window
  ended. Its only possible late contribution is the 13:22:17.488 cure skip
  (B1/sync-gate, indistinguishable in logs).
- Not (c): no accounting defect. Limits (5) never engaged; counts (≤2) never
  reached them; `isConcurrentAddBudgetOperation` filtering was never exercised
  for these skips. The one accounting-adjacent defect is **label fidelity**:
  every interlock rejection reports `reason=budget_exceeded, limit=1,
  admissionDecisionType=null, error=null`, hiding the real reason code that the
  error already carries in `admissionResult.reason`
  (ledger-interlock-admission.js:44-55, 322-339) — this mislabel is what made
  leg B look like a budget lane bug.

**Honest fix surfaces (named, not designed):**

- REUSED: leg A's role/status write-visibility repair (metadata-publication
  guard/CAS path into services rows) — the hold releases for free once those
  writes are visible; per the no-secondary-caches directive the existing
  mechanism should be made to land, not a new read path added.
- EXTENDED (observability): MOVE_SKIPPED emission
  (`unified-rebalancer-follow-up-move.js:623-643`) already receives an error
  carrying `admissionResult.reason`/`message`; surfacing that reason code in the
  skip line removes the budget_exceeded mislabel.
- EXTENDED (candidate, needs a design decision): the quorum-spread hold could be
  given the same on-saturation authoritative recheck discipline the budget lanes
  already have (existing OWNER_RPC machinery) before rejecting client-facing
  provisioning — flagged only as a surface; the actuals-only design comment
  (quorum-concentration.js:158-166) argues both ways.
- NEW: nothing evidenced as necessary.

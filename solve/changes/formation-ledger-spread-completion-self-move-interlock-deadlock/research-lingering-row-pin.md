# Run-28 lingering-row pin: which replica_operations row dams node-3's ledger spread REPLACE

READ-ONLY forensic analysis of run-28 node logs. Goal: pin the identity of the
non-terminal `replica_operations` row that node-3 (`d57be316`, the steady-state
`replica_operations-p1` ledger rebalancer leader) sees as a live incomplete
operation through 16:24:55–16:25:45, causing 17 consecutive
`operation_ledger_self_move_waiting_for_idle_ledger` admission rejections of a
correct count-neutral spread REPLACE.

## Evidence provenance / node-id map correction

The log **filenames do not match** the prompt's node-index map. Keyed by the
`nodeId` field actually present in each file:

| file | nodeId (short) | role |
| --- | --- | --- |
| node-0.log.gz | `36f4e509` | seed; op-1 source; op-1 coordinator until handoff |
| node-1.log.gz | `cdbd94e7` | op-2 ADD target |
| node-2.log.gz | `59ee7466` | — |
| node-3.log.gz | `d57be316` | **steady-state ledger rebalancer leader; op-1 target** |
| node-4.log.gz | `a0d0c2e6` | spread REPLACE target node (empty) |

All timestamps below are UTC from the `time` field. Everything is keyed by
`nodeId`, not filename.

Only **two** operation ids appear anywhere in the cluster logs (confirmed by
`grep -oE '"operationId":"[0-9a-f]{8}'` / `"rowKey"` on every node):

- **op-1** `084ad886` — REPLACE of `replica_operations-p1`, source `36f4e509`
  (seed, replica `…-p1-r1`), target `d57be316` (node-3, replacement replica
  `…-p1-r4`).
- **op-2** `8e47ecf6` — ADD of `replica_operations-p1`, target `cdbd94e7`
  (NOT node-3; prompt's "→node-1" is a mislabel, the row's `targetNodeId` is
  `cdbd94e7`).

---

## 1. Row-identity verdict

**Verdict: Candidate (A) — op-1's REPLACE drain-tail — is the blocking row, with
the divergence mechanism being (D): a raft leadership handoff that landed 5 ms
after op-1's terminal write, leaving node-3 with a cache-stale, non-terminal view
of an operation that is authoritatively COMPLETE. Confidence: HIGH.**

### Why it must be op-1 (elimination)

`SELECT_INCOMPLETE_OPERATIONS`
(`src/rebalancer/replica-operation-repository.js:152`) scopes to
`(source_node_id = ? OR target_node_id = ?)` with both params = `this.nodeId`.
node-3 therefore only sees rows where it is source or target.

- **op-2 is out of scope AND terminal.** Its `targetNodeId` = `cdbd94e7`,
  `sourceNodeId` = null (ADD), so it is neither sourced nor targeted at node-3 —
  it can never appear in node-3's owner-scoped incomplete read. It also
  terminalized: node-3 logs op-2 `Operation completed` (type ADD) at
  **16:24:52.150**. Rules out candidate (B).
- **No reservation/other row exists.** Both ops logged `Storage reservation
  released` (op-1 on seed 16:24:50.680; op-2 on node-3 16:24:52.150), and only
  the two op ids exist cluster-wide. Rules out candidate (C).
- **op-1 is in scope (target = node-3) and matches the incomplete-step
  filter.** The filter admits `workflow_step IN (PENDING,SENDING,CREATING,
  SYNCING,STOPPING) OR (workflow_step = ACTIVE AND type = REPLACE)`. op-1 is a
  REPLACE stuck at STOPPING in node-3's cache — it matches.

Since op-1 is the ONLY operation in node-3's owner scope that is non-terminal in
node-3's view, it is necessarily the `liveOperations[0]` that
`ensureOperationLedgerSelfMoveSerialized` throws on
(`rebalance-coordinator-ledger-interlock-admission.js:160-171`). (The rejection
log line — `admissionReason: operation_ledger_self_move_waiting_for_idle_ledger`,
`entityId: replica_operations-p1`, `replicaId: replica_operations-p1-r3`,
`moveTargetNodeId: a0d0c2e6` — does not echo the conflicting op id, so identity is
established by scope-elimination, not by a quoted conflict id.)

### node-3's view DIFFERS from the authoritative view — it is a stale/ghost row

op-1 is authoritatively **terminal**. The seed (`36f4e509`), which owned/
coordinated op-1 until leadership transferred, logged its full terminal tail:

```
node-0 16:24:50.560  replica-handler       Handling REMOVE_REPLICA request   reason=replace_source_removal  part=replica_operations-p1
node-0 16:24:50.567  replica-handler       Replica removal completed          reason=replace_source_removal  replica=replica_operations-p1-r1
node-0 16:24:50.666  (drain)               Priority recovery drain settled operation   step=STOPPING  part=replica_operations-p1
node-0 16:24:50.680  rebalance-coordinator Operation completed   type=REPLACE  part=replica_operations-p1  targetNodeId=d57be316
```

node-3's own view of op-1 stops one step short and never reaches terminal. Its
last three op-1 observations are cache↔authoritative reconciliation divergences
whose *authoritative* value climbs ACTIVE → STOPPING but never COMPLETED:

```
node-3 16:24:49.825  divergence  cache=SYNCING  authoritative=ACTIVE   (updated_at 1783268689809 = 16:24:49.809)
node-3 16:24:49.903  replica-handler  Replica leader handoff completed   part=replica_operations-p1  replica=…-r4
node-3 16:24:50.576  divergence  cache=ACTIVE   authoritative=STOPPING/removing  (updated_at 1783268690561 = 16:24:50.561)
node-3 16:24:50.671  (op-1 step change dispatch_stopping — LAST op-1 mention on node-3)
```

After 16:24:50.671, **node-3 never mentions op-1 again** (verified: no
`084ad886` line on node-3 with `time > 16:24:51`). It holds op-1 frozen at
`workflow_step = STOPPING`, `type = REPLACE`, target = self → passes the
incomplete-step filter, is `LOCAL_OWNER` (target = node-3) →
`shouldExposeIncompleteOperationToOwnerRead` = INCLUDE
(`replica-operation-repository-incomplete-read-methods.js:165-167`).

### The divergence mechanism is the leadership handoff (D)

The terminal write and the leadership handoff are effectively simultaneous:

```
node-3 16:24:49.903  Replica leader handoff completed   (r4 becomes p1 raft leader)
node-0 16:24:50.680  Operation completed (op-1 terminal write, on the OLD coordinator/seed)
node-3 16:24:50.685  Became leader (liferaft) / Became leader, starting rebalancing scheduler
```

node-3 assumed the ledger coordinator role **5 ms after** the seed wrote op-1's
terminal transition. It inherited a cache whose last-seen authoritative op-1
state was STOPPING (the 16:24:50.576 divergence) and never re-observed the
terminal transition. Compounding this, `queryIncompleteOperations`
(`…incomplete-read-methods.js:279-295`) is **cache-first**: with op-1 present in
cache the cached list is non-empty, so node-3 returns the stale cached row and
short-circuits — it never issues the authoritative `SELECT_INCOMPLETE_OPERATIONS`
that would (if node-3's authoritative store carries the terminal write) reveal
op-1 as COMPLETED.

So the blocking row is **op-1's REPLACE (A)**, and it is a **cross-node stale /
ghost row**, not a genuine in-flight operation: node-0 shows it terminal at
16:24:50.680; node-3 shows it live STOPPING through 16:25:45.

---

## 2. Staleness-exclusion analysis (why CL-043 never fires in the window)

The interlock treats a non-terminal op as a live holder unless
`isConcurrentOperationStalePastStepTimeout` returns true
(`rebalance-coordinator-ledger-interlock-admission.js:83-97`). That predicate
(`operation-workflow-recovery-timeout.js:612` → `…577` →
`resolvePriorityRecoveryOperationDrainStepAgeMs:541`) ages the op from its
**step-entered** timestamp (preferred over `updatedAt`) and compares against
`getTimeoutForStep(workflowStep)`.

- op-1's `workflow_step` in node-3's cache = **STOPPING**.
  `getTimeoutForStep(STOPPING)` returns `config.removingTimeoutMs`
  (`operation-workflow-recovery-status-reconcile.js:383-384`), whose default is
  `REBALANCER_DEFAULT.COORDINATOR.REMOVING_TIMEOUT_MS = 60000`
  (`rebalancer-constants.js:79`). **Step timeout = 60 s.**
- op-1 entered STOPPING at **16:24:50.561** (`updated_at 1783268690561`, the
  16:24:50.576 divergence's authoritative value). The step-entered anchor is
  frozen because node-3 never touches op-1 again — nothing refreshes it, so the
  age clock runs monotonically from 16:24:50.561.
- Rejection window: first 16:24:55.017, **last 16:25:45.568**. Age at the last
  rejection = 16:25:45.568 − 16:24:50.561 = **55.0 s < 60 s**. Even the prompt's
  quoted 16:25:49 gives ≈ 59 s — still under 60 s.

So the CL-043 stale-past-step-timeout exclusion **never fires within the observed
window** for the simple reason that the STOPPING/removing step timeout (60 s) is
longer than the window in which the row damned admission. The row is *not* being
kept artificially fresh (the step anchor is frozen at 16:24:50.561); it is simply
that the 60 s self-heal deadline had not yet elapsed.

The 60 s point (≈ 16:25:50.561) falls in the final gap: after the last rejection
(16:25:45.568) no further rebalance cycle ran, and node-3 received SIGTERM /
`total_clean_drain` teardown at **16:25:52.612**. The demo's steady-state
patience expired ~2 s after the staleness threshold and before any cycle could
have exploited it. **The deadlock is bounded at ~60 s by CL-043, but 60 s exceeds
the demo's convergence deadline** — hence it presents as a hard wedge, not a
transient.

---

## 3. Raft-safety verdict for the proposed exclusion, and the safest predicate

Proposed fix (a): narrow the idle-ledger gate to exclude the ledger partition's
own drain-tail rows so the next spread REPLACE can admit.

### Is it safe in run-28? YES — op-1's config change was already committed.

The hazard the interlock guards against is **two concurrent raft configuration
changes on the same `replica_operations-p1` group**. In run-28 that hazard does
not exist at admission time:

- op-1's source-removal membership change **completed at 16:24:50.567**
  (`Replica removal completed`, `replace_source_removal`, `…-p1-r1` on the seed).
- op-1's replacement (`…-p1-r4`) was ACTIVE by 16:24:49.812 (`Replica creation
  completed`) and promoted to raft leader by 16:24:49.903 (`Replica leader
  handoff completed`); node-3 `Became leader (liferaft)` 16:24:50.685.
- op-1 fully terminalized 16:24:50.680.
- The **first** rejected spread REPLACE is at **16:24:55.017 — 4.3 s later**.

So by the time the second spread REPLACE is being admitted, op-1's
reconfiguration (member removed, replacement promoted) is a committed, settled
config change. The lingering non-terminal row is **pure workflow bookkeeping lag**
(a cache row that never advanced to COMPLETED across the leadership handoff), not
an in-progress reconfiguration. Admitting the second REPLACE would **not** create
two concurrent config changes.

### The trap in a naive "exclude the ledger partition's drain-tail" predicate

A predicate that keys on `workflow_step past STOPPING` does NOT help here and is
unsafe in general: node-3's stale row is stuck **AT** STOPPING, which from
node-3's local view looks exactly like "source removal still in progress." A
genuinely mid-reconfiguration REPLACE (source still a voter, REMOVE_REPLICA not
yet committed) is *also* at STOPPING. Cache-state phase alone cannot separate
"config change done, row merely lagging" (op-1, safe to exclude) from "config
change in flight" (unsafe to exclude) — because both read as non-terminal
STOPPING in a possibly-stale cache.

### Safest narrow exclusion predicate

The distinguishing property must be the **authoritative commit state of the raft
reconfiguration**, not the cache-first workflow phase:

> **Exclude a same-ledger-partition drain-tail row from the idle-ledger gate only
> when its raft reconfiguration is provably committed — i.e. an AUTHORITATIVE
> owner read of the operation row (bypassing the cache-first path) shows it
> TERMINAL (member removal committed), or equivalently the operation carries a
> settled-drain / source-removed witness (semantic phase SETTLED: replacement
> promoted AND source removal completed). Continue to BLOCK whenever an
> authoritative read still shows the row non-terminal (removal not yet
> committed).**

Concretely this means the disruptive-self-move liveness check
(`ensureOperationLedgerSelfMoveSerialized` at lines 143-158) must not trust the
cache-first `queryIncompleteOperations` result for a **same-partition ledger
drain-tail** candidate: it must re-confirm liveness against an authoritative
point read — exactly the pattern the sibling `tryClearHeldOperationLedgerSelfMove`
already uses for the locally-held self-move (`queryOperationById` →
`isOperationTerminal || !isLiveOperationLedgerInterlockOperation`, lines 517-532).
That path terminalizes the hold correctly; the incomplete-read path does not,
because it cache-short-circuits before it would ever issue an authoritative read.

This predicate is safe because it excludes ONLY rows whose config change is
authoritatively committed (op-1's exact situation) and never excludes a row whose
member removal is genuinely still outstanding, so it cannot stack two concurrent
config changes on the ledger raft group.

---

## 4. What is inconclusive from logs, and what the DT must model faithfully

The run-28 SQLite control-plane store is gone, so I **cannot dump the actual row
node-3 held**, nor prove *where* op-1's terminal write did or did not land. Two
hypotheses are consistent with the logs:

- **(H1 — best supported) Cache-first stale read.** node-3's authoritative store
  did receive (or would return on read) op-1 as terminal, but
  `queryIncompleteOperations` short-circuits on the non-empty stale cache and
  never issues the authoritative `SELECT_INCOMPLETE_OPERATIONS`. Supported by:
  the repeated cache↔authoritative divergence trail with
  `reconciliationReason: recovery_operation_persist_confirmation` (cache
  persistently lagging authoritative), the cache-first structure of
  `queryIncompleteOperations` (lines 279-295), and the fact that node-3 stops
  reconciling op-1 the instant it becomes leader (nothing re-reads it).
- **(H2 — possible) Unreplicated terminal transition across the handoff.** The
  op-1 terminal write was performed on the seed at 16:24:50.680, 5 ms before
  node-3's `Became leader`. If that write did not replicate into node-3's raft
  state before the handoff, even an authoritative owner read on node-3 would show
  non-terminal. This cannot be excluded from logs alone.

Both hypotheses share the same fix-relevant conclusion: node-3's *view* of op-1
diverges from the authoritative terminal state established on the seed, and the
interlock trusts that stale view. Under H1 an authoritative re-read fixes it
outright; under H2 the authoritative re-read plus the CL-043 staleness bound (60 s)
is the backstop — which argues the exclusion predicate should combine an
authoritative liveness re-confirmation with the settled-reconfiguration witness,
so it is correct under either hypothesis.

### What the DT must model to be faithful

1. **Leadership handoff of the ledger raft group landing across the
   REPLACE terminal write** — the coordinator role must transfer from the source
   (seed) to the replacement (node-3) within a few ms of the terminal
   `Operation completed`, so the inheriting leader's cache holds the op at
   STOPPING and never observes the terminal transition. This is the root
   generator; a DT that completes the REPLACE under a single stable leader will
   not reproduce the wedge.
2. **Cache-first incomplete read that short-circuits before the authoritative
   read** — the stale STOPPING row must be present in the inheriting leader's
   operation cache so `queryIncompleteOperations` returns it without ever issuing
   the authoritative SQL.
3. **STOPPING/removing step timeout of 60 s** as the sole self-heal, so the
   deadlock persists past the (shorter) convergence deadline; the DT's virtual
   clock must let the interlock be sampled repeatedly within [step-entry,
   step-entry + 60 s) and assert the gate stays closed for the whole interval.
4. **Same-partition second spread REPLACE** on `replica_operations-p1` targeting
   an empty node, count-neutral, being admission-rejected with
   `operation_ledger_self_move_waiting_for_idle_ledger` while the only "live"
   row is the authoritatively-terminal op-1 — and, post-fix, admitting once the
   authoritative re-read / settled-reconfiguration witness clears op-1.

---

## Summary

- **Blocking row:** op-1 `084ad886`, the `replica_operations-p1` REPLACE
  drain-tail (candidate A), target = node-3. It is authoritatively **terminal**
  on the seed (`Operation completed` 16:24:50.680) but node-3 holds it frozen at
  `workflow_step = STOPPING` because the ledger raft **leadership handoff**
  (node-3 `Became leader` 16:24:50.685) landed 5 ms after op-1's terminal write
  and node-3's **cache-first** incomplete read never re-observed the terminal
  transition. op-2 and any reservation row are excluded (out of owner scope +
  terminal; released). It is a cross-node stale/ghost row, not an in-flight op.
- **Staleness:** CL-043 never fires in-window because STOPPING uses
  `removingTimeoutMs = 60 s`; the row's frozen step-entry (16:24:50.561) is only
  ~55 s old at the last rejection (16:25:45.568), and teardown (16:25:52.612)
  preempts the 60 s self-heal.
- **Raft safety:** SAFE in run-28 — op-1's source-removal config change committed
  at 16:24:50.567, 4.3 s before the first rejection; the row is bookkeeping lag,
  not an in-flight reconfiguration.
- **Recommended exclusion predicate:** exclude a same-ledger-partition drain-tail
  row from the idle-ledger gate ONLY when an **authoritative owner read** (not the
  cache-first incomplete read) shows it terminal, or it carries a settled-drain /
  source-removed witness (replacement promoted AND source removal committed);
  keep BLOCKING while an authoritative read shows the reconfiguration still
  outstanding. Mirror the authoritative point-read that
  `tryClearHeldOperationLedgerSelfMove` already uses. This admits op-1's
  successor immediately while never permitting two concurrent config changes on
  the ledger raft group.
- **Caveat:** SQLite is gone; cannot prove cache-lag (H1, best supported) vs
  unreplicated-terminal-across-handoff (H2). The predicate above is correct under
  both.

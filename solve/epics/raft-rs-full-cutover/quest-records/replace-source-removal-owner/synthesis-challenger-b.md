# REPLACE source-removal owner: model challenger B (temporal, timing, interleaving, recovery)

Read-only. No repository edits, no git writes, no suites run. No probe was needed: every claim below is a direct read of production code or of the raft-rs crate.

**What I read**
- Worktree `.claude/worktrees/replace-owner`, branch `quest/replace-source-removal-owner`, head fbbf2d7a2. Production is the F1 head's.
- The design record `design-replace-source-removal-owner-2026-09-25.md`, all sections, and the owner constraints `owner-constraints-replace-source-removal-2026-09-25.md`.
- Background: `quest-records/f1-step-down-port/synthesis-challenger-b.md` and `finding-slo-residual-remove-safety.md`.
- raft-rs: `~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/raft-0.7.0/src`.

**Abbreviations**
- `RO` = `src/raft/raft-rs-runtime-owner.js`.
- `RPSO` = `src/control-plane/readiness-planning-snapshot-owner.js`.
- `RPCA` = `src/control-plane/readiness-planning-completion-admission-methods.js`.
- `DRR` = `src/rebalancer/operation-workflow-dispatch-response-reconcile.js`.
- `DRE` = `src/rebalancer/operation-workflow-dispatch-rearm-evidence.js`.
- `RT` = `src/rebalancer/operation-workflow-recovery-timeout.js`.
- `SR` = `src/rebalancer/operation-workflow-recovery-status-reconcile.js`.
- `raft.rs` = raft-0.7.0 `src/raft.rs`.
- Design section numbers (§3.3 and so on) and the design's names (K1-K13, T-1-T-12, E1-E10, R-1a-f, S1-S10) are the design record's.

---

## 0. Findings at a glance

| ID | Dimension added or corrected | Kind | Severity | Owner decision? |
|---|---|---|---|---|
| **BR1** | Lost wake-up: the §3.3 recheck compares the wrong generation. A publication **never** changes the planning identity | **New** (a flaw in the design's mechanism) | High: the common case falls back to the 1 s timer | No |
| **BR2** | Wake coalescing is lossy: the op lane *joins* the holder and discards the waker; the tokenKey dedupe is blind to build variants and to live-veto republications | **New** (coalescing semantics) | High | No |
| **BR3** | Wake and input mismatch for the leader-ownership deferral: the wake is a core event, but the input is a lagging row projection | **New** (event ≠ input) | Medium | No |
| **BR4** | Owner lease (K10) × unbounded ACTIVE (S9): a live, waiting owner loses its lease after 30 s. R-1c then FAILs it on the refresh-pending heuristic | **New** timing crossing, caused by S1 × S9 | **High: the healthy target is removed** | **OWNER DECISION** |
| **BR5** | Top-level operation budget 300 000 ms from `createdAt` × S9: a long ACTIVE wait makes the first STOPPING reconcile FAIL | **New** timing crossing | **High: quorum hazard** | **OWNER DECISION** (joint with BR7) |
| **BR6** | The DISPATCH entry applies the membership-epoch fence to an ACTIVE REPLACE. The drain hand-back, the dispatch retry and the self-owned wake all use that entry. Which wake wins decides between FAILED and progress | **New** (the wake route changes the outcome; P3 is not equivalent) | High | **OWNER DECISION** (narrow: the scope of the audit-finding-7 fence) |
| **BR7** | No FAIL is safe once the removal effect may have been taken. The durable phase "ACTIVE, effect taken, STOPPING not durable" is missing, and the terminal CAS does not compare the step | **New** (irreversible effect × FAIL × B3) | **High: quorum hazard** | **OWNER DECISION** (B3 contract and the audit-finding-6 CAS) |
| **BR8** | R-1f's "once per leader term" is unsound. raft-rs drops a conf change with no term change and no event | **New** (a rate limit against a raft fact) | **High: T-7 hazard reopened** | No (inside S2) |
| **BR9** | Handoff-attempt identity. The accepted answer carries neither the effect term nor the chosen transferee, and O's term read can be the cached observation. A late *effect* (not a late answer) is the live hazard; a local-step transfer is not term-fenced | **New** (correction of §3.4) | Medium-high | Port answer shape: decision-adjacent, like S5.2 |
| **BR10** | Attempt resolution by W elapsed on O's clock is not anchored to the leader's window. Restart and W_max put latency of up to about 31 s on T5 | Instance of F1 B4/B5 + new crossing | Medium | No |
| **BR11** | CL-043 authorizes removal on *acknowledged but unresolved* election evidence; §3.2 check 3 forbids it. Merging the evidence maps silently supersedes CL-043 | **New** (conflicting authorities) | Medium | No (R09 supersession record) |
| **BR12** | The effect-boundary re-read of R can be the captured snapshot when visibility is deferred | **New** (a cached-input class) | High | No |
| **BR13** | A source node that dies during an unbounded ACTIVE wait has no path. REMOVE_REPLICA cannot be delivered; every outcome is FAIL then B3, or waiting forever | **New** input (source liveness) | High | **OWNER DECISION** |
| **BR14** | Backstop cadence K1 is not 1000 ms. The sweep awaits every op's lane and each remote wake serially; K12 runs only after it | Correction of K1 / K12 / T-11 | Medium | No |
| **BR15** | Commit → membership event on O lags by the Ready's awaited sends plus persistence admission. "Commit → completion 0 ms" is measured from O's announce, not from the commit | Correction of §4.7 latency | Low-medium | No |
| **BR16** | Cross-node cache lag lets the leader re-admit s after R-1f's REMOVE_PEER commits | **New** (competing authority re-adds the source) | Medium | No |
| BR17 | Smaller items: the identity read has side effects; a waiter leaks on a remote terminal; the handoff role no-op answer is unclassified; the second evaluation at DRR:284; the subscription lifetime | Instances | Low | No |

What stands. These parts of the design survive the attack:
- The effect boundary's synchronous revalidation block has no internal await.
- raft-rs term fencing makes resolution (1) sound **at the leader**.
- Removing a non-member is a raft-rs no-op, so R-1f duplicates are idempotent (`confchange/changer.rs:237-240`).
- F1's B7 nested-turn hazard is closed at this head. `enqueue` sets `group.tail` **before** `run()` (`RO:683-708`), so a synchronous listener re-read inside `announce` gets the observation just recorded at `RO:987`.
- The subscription is node-scoped. It does not depend on partition leadership or on re-leases (§1.5).

---

## 1. Question 1: the lost-wakeup design (§3.3)

### BR1. The recheck compares a generation that a publication never changes

**The claim under test.** §3.3 reads `readPlanningProjectionIdentity(node)` before the participation read. It re-reads the identity after registering, and wakes if the identity is current and not equal to the one observed.

**Proof that a publication happens with an unchanged identity.**
- A build publishes only if `captureCompletionCurrency` finds it current (`RPCA:487-545`). Listeners are notified only on `currency.current` (`RPCA:637-658`).
- Currency requires `planningIdentitiesEqual(startSource.identity, currentSource.identity) && currentSource.sequence === startSource.sequence` (`RPCA:473-485`). The one exception is the feedback case, which requires `sequence === start + 1`.
- So **every non-feedback publication happens with the planning identity exactly equal to the identity at build start.** A build that saw the identity rotate is stale. It re-queues (`RPCA:640-651`) and does not notify.
- The planning identity is the semantic *source* generation: `{globalPlanningGeneration, nodePlanningGeneration, saturated}` from the tracker (`readiness-planning-semantic-currency-methods.js:319-344`). Only source changes advance it. A build *completing* never does.
- The refresh-pending placeholder is served while a build for the **current** identity is queued or in flight:
  - no completed record: `RPSO:565-572`;
  - a live veto or an identity mismatch: `RPSO:595-612`;
  - behind the barrier: `RPSO:624-647`.
- Its flip to eligible **is** the publication of that build, under the same identity.

**Counter-ordering.** It is reachable in the common case.
1. A source change (for example a heartbeat on node N, a nodes-table revision) rotates N's identity to I1 and enqueues a build (`RPSO:237-254`).
2. R's evaluation reads `observedIdentity[N] = I1`. It then reads participation, which is refresh-pending because the I1 build has not run.
3. The evaluation continues through its awaits: authoritative rows, completion, leader safety. The measured duration is 250-999 ms (finding §2b).
4. Inside that span the I1 build runs in its own macrotask (`defaultMacrotaskScheduler` = `setImmediate`, `readiness-planning-version-contract.js:173-175`). It publishes with identity I1 (`RPCA:652-658`). The waiter does not exist yet, so the event is dropped.
5. The evaluation returns DEFER. The owner registers `{N: I1}` and rechecks: `readPlanningProjectionIdentity(N)` is I1, current and **equal**, so there is no wake.
6. The next evaluation comes at the K2 timer (`DRE:494-590`, 1000 ms).

**Arithmetic.**
- A node's refresh-pending read returns to current within about 100-300 ms (finding §2c).
- The evaluation window is 250-999 ms.
- So the publication usually lands **inside** the window. The case the recheck exists for is the typical case, and the recheck misses it.
- Normal progress is again bounded by K2 = 1000 ms. That contradicts constraint 5(a) and constraint 12 and TC2.

**The identity *can* change without any publication.**
- `readPlanningProjectionIdentity` calls `refreshLivenessSemanticIdentities` and `ensureSourceRevisionBaselineAndWake` (`:274-293`, `:337`, `:350-361`). These refresh time-driven liveness projections and can fold a change into the tracker.
- The feedback path also bumps the **global** generation on any node's publication (`classifyPlanningBuildFeedback`, `:189-209`). That rotates every node's identity.
- So the recheck produces spurious wakes (harmless, bounded by coalescing) and misses the real one.

**Kind.** New. A flaw in the mechanism: the generation chosen measures source currency, not publication.

**Amendment (model and design)**
- **The recheck must re-read the level, not a generation.** After registration, in the same synchronous block, re-run the synchronous participation read (`getControlPlaneParticipationSync(node, <the remove-safety options>)`) for every registered node. If any read is no longer the placeholder, wake.
  - That is a true subscribe-before-recheck: registration is a synchronous map write, and publications run in macrotasks.
  - It needs no new ledger. The participation read's side effect is an idempotent `enqueueBuild`; it coalesces per queue key.
- **Alternative with the same guarantee:** an owner-controlled per-operation wake sequence (§BR2 amendment).
- Mutation **M4 must be redefined.** Today it is "registration without a recheck, or the identity read after the value". Add "the recheck compares a source generation instead of the level". The current design is itself that mutant.
- **Anchor AN5 must use a publication with an unchanged identity** (the refresh-pending → current flip). A test that rotates the identity passes against the design as written. It would be vacuous.

### BR2. Coalescing into a lost edge: three independent mechanisms

**(a) The operation lane joins; it does not queue.**
- `runExclusive` returns the in-flight promise and **discards** the new factory when the key is held (`src/workflow/durable-workflow-coordinator.js:479-500`). `OperationLane.run` delegates to it (`src/workflow/operation-lane.js:73-83`).
- The codebase already documents this as a loss: "operationWorkflowRunExclusive COALESCES — a held lane returns the holder's promise and discards the factory — so a plain single submission loses the evidence" (`operation-workflow-executor-outcome-reconcile-methods.js:101-118`, CL-029).
- §3.3 says "enqueue one coalesced `EXECUTE` for R in its single-flight lane, as the timer does". The timer does exactly the lossy submit (`DRE:529`).
- **Counter-ordering:**
  1. An evaluation holds R's lane; it read participation before the publication.
  2. The publication arrives, and its EXECUTE joins the holder.
  3. The holder DEFERs on pre-publication state.
  4. The edge is lost unless the registration recheck reads the level (BR1).
- The same applies to the membership-changed event at STOPPING. There is **no** K2 timer at STOPPING. A membership event that joins a holder (for example a DISPATCH wake from the seed, BR6) waits for `checkTimeouts` (K1_eff, BR14).
- T-2's "at most one evaluation in flight plus one queued per operation" is **not** what the lane does. Nothing is queued.

**(b) The tokenKey dedupe is blind to build variants.**
- The event carries `{ownerKey, snapshot, capturedToken}` (`RPSO:219-228`). There is no `buildOptionsKey`.
- `tokenKey` is global: it encodes the tracker counters only (`freezeToken`, `readiness-planning-version-contract.js:228-263`).
- One node has several build variants: remove safety's participation kind, the dispatch service's default, routed reads. They are separate queue keys drained one per macrotask (`maxItemsPerDrain: 1`, `RPSO:129-149`).
- **Counter-ordering:**
  1. The default variant of node N publishes under token K. The waiter wakes and dedupe records K for (R, N).
  2. The evaluation reads remove safety's variant, which is still queued. It is refresh-pending, so R DEFERs and re-registers.
  3. Remove safety's variant publishes under the same K. The dedupe drops it.
  4. The edge is lost until K2.

**(c) The tokenKey dedupe is blind to same-token republications.**
- A completed record becomes non-reusable with **no** token or identity change when its live veto changes (`RPCA:178-189`):
  - the evidence age crosses `clusterMemberStaleHeartbeatMaxAgeMs` = 30 000 (`control-plane-readiness-constants.js:142`; `readiness-planning-publication-contract.js:176-195`);
  - or a transport or publication guard changes.
- The rebuild publishes under the **same** tokenKey. The dedupe drops it.
- The dispatch service's dedupe (`replica-dispatch-service-lifecycle.js:257-287`) is correct for its purpose, a per-token node-ready retry. It is the wrong precedent for a level-triggered waiter.

**Kind.** New: coalescing semantics.

**Amendment**
- Remove the tokenKey dedupe from the REPLACE waiter. Coalescing belongs to the operation, not to the event.
- Replace the lane submit with a **dirty-bit rerun**. Keep a per-operation in-memory `wakeSeq`, incremented by every wake: readiness, membership, term/leader, remote, timer.
  - An evaluation records `wakeSeq` at entry.
  - On DEFER, if `wakeSeq` advanced, it re-runs immediately instead of arming.
  - This is the "owner-controlled ordering" constraint 4 allows, and it is the pattern `redriveExecutorOutcomeReconcile` already uses (`operation-workflow-executor-outcome-reconcile-methods.js:119-150`).
- Add a model event class: **"wake arriving while the lane is held"**, crossed with every wake type. Add mutation **M4b**: submit through the joining lane with no rerun. Expected red: the latency anchors.

### BR3. The wake does not match the input for the leader-ownership deferral

**Evidence**
- `WAIT_REPLACEMENT_LEADER_OWNERSHIP` is decided from the persisted replacement `raft_role` and the partition `leader_node_id` rows. The code itself says these "lag live raft leadership (CL-016/CL-035 write-through family)" (`src/rebalancer/priority-publication-leader-safety.js:645-670`, and `:20-26` "via the natural leader_node_id row update").
- §3.3 and §3.5 wake it on "a leader or term event on O", which is a core event (`RO:988-999`).

**Counter-ordering**
1. t wins; O's core announces LEADER_CHANGE; R wakes.
2. Leader safety reads rows that still name s, so R DEFERs.
3. No further port event comes. The row write arrives later as a cache event, which nothing subscribes to.
4. The edge is lost until K2.

**Kind.** New: the event and the input it guards are different.

**Amendment**
- Model rule: **every deferral reason must name the authority it reads, and the wake must be that authority's change event.** For a reason that reads rows, the wake is the services/partitions cache change for P. For a reason that reads the core, it is the port event.
- Better, and consistent with constraint 1: when O hosts t, "t leads" is a local core fact (`status.lead === peerId(t)`, read in O's port). The ownership wait should read that, with rows as a corroborating projection only.
- Add the pair E8 × "row projection lagging the core" to §4.6.

### 1.4 The other sub-questions

- **Is registration then recheck race-free?** Yes, *if* the recheck reads the level. The DEFER branch registers synchronously after its last await (`DRR:309-330`), and publications run in macrotasks (`RPSO:129-149`). So a publication is either before the recheck (and visible to it) or after registration (and delivered).
  - **There is no gap between the recheck and the waiter becoming effective** when the map write precedes the recheck in one synchronous block.
  - Record that ordering as a model invariant, with a mutant that swaps it.
- **The waiter's node set must come from the *final* evaluation.** The DEFER branch can run a **second** `evaluateRemoveSafety` after a handoff response (`DRR:274-288`), and that evaluation's DEFER is the one returned. E1 must name `DRR:284` as a resume point too (BR17).
- **Can the identity stay equal while participation flips?** Yes, in both directions:
  - placeholder → current is by construction (BR1);
  - current → placeholder by live-veto expiry (BR2c) or by a node-table-only advance.
  - The latter matters to §3.2 check 4. The SAFE evaluation's read can be eligible and check 4's read refresh-pending, with no identity change.
  - That pair (evaluation read eligible × effect-boundary read placeholder) must be a P2 cell. The answer is WAIT, which is correct but costs one more evaluation.

### 1.5 Is the subscription permanent?

- **Owner restarts.**
  - The readiness planning owner is created once, in the readiness service constructor (`control-plane-readiness-participation-base.js:67`, `:344-349`).
  - Its `shutdown()` clears every listener (`RPSO:763-781`, `:769`).
  - The delegate returns a silent no-op unsubscribe when the planning owner is absent (`control-plane-readiness-planning-owner-delegate-methods.js:53-56`).
  - So the subscription is permanent only while both the coordinator and the readiness service live. A re-init of either side must resubscribe. A subscription taken while the owner is absent must fail visibly, not no-op.
  - Liveness is covered by K2 and K1 (latency only). Add it as an invariant plus a diagnostic.
- **Re-leases.** Irrelevant. Local ownership is a pure function of the row (the target node), and the subscription is node-scoped.
- **Partition leadership changes of O.** Irrelevant. The workflow owner and its `checkTimeouts` interval are node-scoped (`src/rebalancer/rebalance-coordinator-lifecycle.js:575-606`, `:657-681`) and independent of `setLeader`.
- **Waiters are in memory**, lost on restart and recovered by the backstops. A waiter must also be dropped when R becomes terminal through a *remote* writer, or it leaks until its node publishes (BR17).

---

## 2. Question 2: async resume edges and their re-read inputs

### 2.1 Every await, timer, callback and recovered continuation, ACTIVE to terminal

| # | Resume point | file:line | Current re-read | Design's re-read | Missing |
|---|---|---|---|---|---|
| E1a | After `evaluateRemoveSafety` | `DRR:261` | Everything, inside the evaluation | §3.2's four checks | BR12 (visibility class), BR13 (source reachability) |
| E1b | After the handoff STEP_DOWN deliver (lane held ≤ 5000 ms, router default) | `DRR:268-273` → `src/rebalancer/priority-publication-handoff.js:265-283` | Evidence maps | Attempt record | Effect term and chosen transferee (BR9) |
| E1c | After `shouldContinueAfterRemoveSafetyHandoffResponse` and the **second** `evaluateRemoveSafety` | `DRR:274-288` | Everything | Not listed | Must be a named resume edge; its DEFER is the one registered |
| E1d | **After the REMOVE_REPLICA deliver** (≤ 5000 ms, `REPLICA_OPERATION_DISPATCH_TIMEOUT_MS`, `src/rebalancer/operation-workflow-owner-shared.js:347`), before the STOPPING CAS | `DRR:455-516` → `DRR:535-545` | None: the STOPPING write expects ACTIVE | Not listed | **The effect precedes its durable record** (BR7) |
| E2 | Readiness publication | new | – | "everything" | BR1, BR2 |
| E3 | K2 safety timer | `DRE:515-561` | Visibility observation, **or the captured snapshot** | R-1e | BR12 |
| E3b | K3 priority active-REPLACE resume (250 ms) | `DRR:692-720` | Same visibility read | Not listed | BR12 |
| E3c | **Dispatch-retry timer** after a REMOVE_REPLICA delivery failure; runs the **DISPATCH** action | `DRE:359-440` (DISPATCH at `:421-432`) | `getDeferredDispatchRetryOperation` | Not listed | **The epoch gate (BR6)**; ambiguous effect (BR7) |
| E4 | Orphan sweep | `RT:365-433` | Lifecycle reconcile | R-1e | Runs only after `checkTimeouts` (BR14) |
| E5 | Restart | – | Periodic paths | R-1e | BR5 budgets; BR10 restart attempt rule |
| E6 | Remote wake: drain hand-back, coordinator-created wake, self-owned wake | `src/rebalancer/operation-workflow-owner-handoff-state.js:229-300`, `:453-458` → `dispatchOperation` → `src/rebalancer/operation-workflow-dispatch-execution.js:399-450` | Ledger idle gate, reservation gate, **epoch gate** | "same as E4" | **It is not the same as E4** (BR6) |
| E7 | Late STEP_DOWN answer | – | Late responses are absorbed without a consumer unless a `responseContext` is supplied (`src/transport/message-router-inbound-dispatch.js:513-527`) | Identity echo | The live hazard is a late **effect** (BR9) |
| E8 | Membership, leader or term event | `RO:979-1000` | – | ConfState and status | BR3, BR15; no event when `before === null` (below) |
| E9 / E10 | Executor outcome; REMOVE_REPLICA answer | as design | – | R-1a | – |
| E11 | Terminal transition retry, transition grace | `src/rebalancer/operation-workflow-transition-retry.js:197` | – | Not listed | Must enter through R-1e |

**`announce` emits no event for the first observation after (re)construction.**
- `if (before && …)` guards every emit (`RO:985-999`); `lastStatus` starts null (`RO:1395`).
- A membership-changed event built the same way loses the first conf change applied after a group (re)construction.
- R-1e at every entry and the backstops cover it. The model should list "no event for the initial observation" under E8, as a liveness fact covered by the backstop and not by the event.

### 2.2 Inputs the revalidation must re-read, beyond §3.2's four

| Candidate | Verdict | Evidence |
|---|---|---|
| The target's own membership (voter, not learner) | **Already in** §3.2 item 2 | – |
| **The visibility class of R's re-read** | **Missing: BR12** | `DRE:456-468` |
| **The lease after S1** | **Missing as a fence** (BR4, BR7) | The §3.2 item 1 re-read is a cache read. It is not a durable fence against a remote FAIL, and the terminal CAS does not compare the step (`replica-operation-repository-mutation-row-methods.js:79-101`) |
| **The source node's reachability** | **Missing: BR13** | `DRR:455-505` |
| The published membership epoch | **Missing implicitly**: the DISPATCH entry fails R on it (BR6) | `operation-workflow-dispatch-epoch-gate.js:113-120` |
| The ledger self-move interlock | **Not an input** to the effect. The gate applies only to the PENDING claim (`operation-workflow-dispatch-ledger-self-move-gate.js:16-40`; `dispatch-execution.js:406-411`). R holds the hold until terminal. Its relevance is only that R's own row can live on the partition being changed (BR7, trigger 3) | – |
| The source's services row (REMOVING or absent) | Should route to the STOPPING owner (BR7) rather than re-run remove safety | `operation-workflow-recovery-observation.js:744-766` |

### 2.3 Is there an await between the revalidation and the effect?

- **For REMOVE_REPLICA: no await between the checks and `deliver`**, if §3.2 is implemented as written.
- **But the effect precedes its durable record.** After `deliver` there is the response await (≤ 5000 ms) and then `updateStep(STOPPING)` (`DRR:542`). BR7 turns this on.
- **For the R-1f REMOVE_PEER re-drive: the decision reads the cached observation.**
  - `readStatus` answers the last completed drain's observation whenever the group's queue is busy (`RO:1073-1091`).
  - Application happens only after the Ready's awaited sends and the admission wait (`RO:874-927`).
  - The proposal itself is a queued runtime turn. So "s ∈ committed voters" may already be false in the core.
  - That is harmless: a removal of a non-member is a no-op (`changer.rs:237-240`), and a second pending conf change becomes an empty entry (`raft.rs:2062-2090`).
- **The leader and term check (§3.2 item 3) reads the same cached observation.**
  - The stale-*safe* direction: the transfer already landed and the cache says the source still leads. The result is WAIT.
  - The stale-*unsafe* direction: the cache says t leads while the core has processed a re-election of s.
  - The consequence is bounded. A REMOVE_REPLICA to a leading source retires its lifecycle while leader (design §2(f) gap 3). Followers elect after one election timeout (W). R-1f re-drives at the new term, provided BR8's rate limit is fixed.
  - Record this as the F1 "processed but not announced" class (F1 B2), transferred to the effect boundary. Its staleness bound is the in-flight turn: ≤ Σ awaited sends (5000 ms each to an unresponsive peer, `websocket-transport.js:607-627`; `transport.js` MESSAGE_TIMEOUT_MS 5000) plus admission.

---

## 3. Question 3: handoff attempts (B5, constraint 7)

### BR9. The attempt identity cannot be built from what the port answers

**Evidence**
- `transferLeadership` reads status and ConfState fresh, decides and steps, all in one turn (`RO:1199-1219`).
- Its accepted answer is `transferAccepted(reason)` = `{outcome: CORE_OK, reason}` (`raft-rs-leadership-transfer.js:44-46`). It carries **no term and no transferee**.
- For the most-caught-up kind (H-A) the transferee is chosen **at the leader** (`raft-rs-leadership-transfer.js:118-132`). The issuer never learns it.
- So `{operationId, attemptTerm, transfereeReplicaId}` has an unknown `transferee` for H-A, and "success iff `lead` is the transferee" is undefined for H-A.
- §3.4's `attemptTerm` is "the term O's local core reports when the attempt is created", through `readStatus`. When O's queue is busy, that is the **cached** observation (`RO:1073-1091`). It can be lower than the term the leader accepts the transfer in.

**Counter-ordering (false resolution, then a retarget)**
1. O's cached observation says term T while an election to T+1 is processed but not announced.
2. The attempt records `attemptTerm = T`. The leader of T+1 accepts the transfer.
3. O announces T+1, so "term > attemptTerm" and the attempt is "resolved"; `lead ≠ transferee`, so it counts as failed.
4. The owner creates a new attempt, possibly to a different successor, inside the T+1 leader's running window. That is a retarget.

**raft-rs facts that bound it**
- Any term change at the leader aborts a transfer (`reset` → `abort_leader_transfer`, `raft.rs:986-996`).
- A forwarded `MsgTransferLeader` is term-stamped (`raft.rs:646-663`: only `MsgPropose` and `MsgReadIndex` are left unstamped). A leader of a newer term ignores it (`raft.rs:1393+`).
- So resolution (1) is **sound if and only if `attemptTerm` is the term of the leader that took the effect.** The named-self forward (H-B) is term-fenced by raft-rs.
- The most-caught-up leg (H-A) is stepped **locally** at the source node as a term-0 local message (`RO:1209-1213`). It is **not term-fenced.** A STEP_DOWN queued behind the source's runtime queue (persistence admission ≤ 120 000 ms, F1 K4) can take effect after the issuer resolved the attempt. It then retargets the next attempt's transfer.

**Late answer or late effect?**
- Late STEP_DOWN answers have no consumer today. The handoff deliver is awaited in the lane (`priority-publication-handoff.js:265-283`), and a post-timeout response is absorbed (`message-router-inbound-dispatch.js:513-527`, because no `responseContext` is supplied).
- So E7's "late answer from attempt A" is not reachable unless the implementation adds a `responseContext`. **A late *effect* of attempt A is reachable** through the timed-out or queued H-A step.
- Constraint 7's "a late result from attempt A must not … mutate attempt B" is at risk through the effect, which the identity echo cannot stop.

**Kind.** New. It corrects §3.4 and constraint 7's mapping.

**Amendment**
1. The transfer answer carries the facts of its own turn as data: `{term, transferee}` from `observed.value.status.term` and `decision.transferee` (`RO:1200-1212`).
   - `attemptTerm` is that `term`, and the transferee is that `transferee`.
   - For a forwarded answer the follower's term equals its known leader's term (a follower learns `leader_id` only at its own term). The same field serves.
   - This changes the operation port's answer shape. **Decision-adjacent, like S5.2**: confirm with the owner that data-only answer fields keep the port authoritative.
2. The STEP_DOWN request carries `attemptTerm`. The executing runtime refuses when its core term ≠ `attemptTerm`. That gives the local step (H-A) the fence raft-rs gives the forwarded kind, so a late effect cannot cross a term.
3. **Retarget only across a term boundary.** Within `attemptTerm` a new attempt may only name the same transferee (raft-rs ignores it, no reset, `raft.rs:1889-1898`), or wait.
4. Add the answer class **ROLE_NO_OP** to the resolution taxonomy (the handler's projection-decided no-op, `replica-handler-leader-handoff-methods.js:84-104`, `:126-134`; F1 B2 staleness). It means "no effect taken" and resolves immediately with a fresh re-read. It is neither acceptance nor success.

### BR10. W-elapsed resolution and the restart rule are anchored to the wrong clock

**Evidence**
- The leader's window starts when the leader *processes* `MsgTransferLeader`, after:
  - the STEP_DOWN deliver;
  - the handler;
  - the forward hop;
  - the leader's inbound queue, where persistence admission can stall a turn ≤ 120 000 ms (F1 K4).
- The window counts **ticks**. Ticks are lost while admission is closed, and they queue behind stalls (F1 B4). So W_wall > W_nominal.
- O's "W_max elapsed since the attempt" can therefore expire while the leader's transfer is still running, or has not started. Resolution (3) then admits T5, or a new attempt, inside the leader's window.

**Arithmetic**
- W(i) = 1000 + 2500·i: 1000 / 3500 / 6000 / 8500 ms for i = 0..3. The hash-fallback index reaches about 31 000 (design K7; `raft-rs-runtime-tuning.js:26-37, 52-54`).
- Resolution by W_max blocks T5 (check 3) for up to **W_max** whenever the transfer was a silent no-op. Examples:
  - a same-transferee repeat;
  - a forwarded transfer dropped by a leaderless follower (`raft.rs:2339-2347`, which answers Ok);
  - a leader whose window already expired.
- That is up to 8500 ms (index 3) or about 31 000 ms (hash fallback) of T5 latency with every prerequisite true. Constraint 12 crossing.
- **Restart rule.** "Wait for a term change or W_max" when the leader is **already t**: `lead === t` in a fresh core read proves no transfer is running at t. Transfer state lives at the leader, and t has no `lead_transferee` unless someone asked t. The pseudo-attempt must resolve at once, not after W_max. Otherwise every restart costs up to W_max (about 31 s).

**Kind.** Instance of F1 B4/B5, plus a new crossing: W_max against T5.

**Amendment**
- Resolution (3) is never a permission to retarget (BR9 item 3). It only permits T5, **and** R-1f must tolerate a proposal dropped by a still-running window (BR8).
- The restart pseudo-attempt resolves on a fresh core read showing `lead === peerId(t)`. It blocks new *issuance* (C3) but never blocks T5 when t leads.
- Put "W_wall vs W_nominal" and "window start = leader processing, not issuer send" into the Phase 6 table.

### BR11. CL-043 authorizes the removal that §3.2 check 3 forbids

**Evidence**
- `priority-publication-leader-safety.js:645-670` authorizes removal on COMPLETED replacement-election evidence. Its own words: "the evidence proves the election was requested/accepted, NOT necessarily already won".
- That evidence is the per-leg map §3.4 merges into the attempt record. Under §3.2 check 3 the same fact is an *unresolved attempt*, which blocks T5.
- The design supersedes CL-043's authorization without naming it.

**Kind.** New: conflicting authorities over one fact.

**Amendment**
- Record the supersession (R09): "COMPLETED election evidence no longer authorizes removal; a term change with `lead = t`, or a refusal, does."
- Name the latency consequence:
  - SAFE after a handoff now waits for the term-change event (median 56 ms, max 490 ms in F1's 39 transfers);
  - or for W_max when the transfer silently does nothing (BR10).
- This is the correct direction. It closes T-9, a removal proposed inside the window. But it is a behaviour change and needs a witness.

### The constraint 10 cases

- **A transfer succeeds but its callback is delayed.**
  - The lane is held by the STEP_DOWN deliver, ≤ 5000 ms (router default; F1 B14: the caller times out exactly when the transferee is unresponsive).
  - The term-change event joins the holder and is lost as an edge (BR2a).
  - The post-response second evaluation (`DRR:284`) re-reads, but under check 3 it cannot SAFE until resolution is observed. With BR2's dirty-bit rerun this becomes 0 ms. Without it, it is K2.
- **A transfer fails after another leader already exists.**
  - The foreign election reset the leader (`raft.rs:986-996`), so the transfer is dead. The late refusal (`not-leader`) resolves the attempt.
  - Sound, provided `attemptTerm` is the effect term (BR9).
- **Leadership changes without the REPLACE initiating it.**
  - Resolution (1) is correct at the leader.
  - The false resolution comes only from a stale `attemptTerm` (BR9).
  - An unrelated election that happens to elect t reads as success. That is harmless, because the goal state holds.

---

## 4. Question 4: recovery equivalence (P3, constraint 5)

### BR6. Recovery by the DISPATCH entry is not the owner decision that EXECUTE runs

**Evidence**
- `advanceDispatchCandidateStep` (`src/rebalancer/operation-workflow-dispatch-execution.js:399-450`) runs `ensureDispatchMembershipEpochOrSkip` for every ADD and REPLACE, **whatever the phase** (`operation-workflow-dispatch-epoch-gate.js`: `isEpochFencedOperationType` checks the type only).
- On an epoch mismatch it **FAILs** the operation (`:113-120`).
- The gate's own contract is about "a queued ADD/REPLACE [that] can sit PENDING across a membership epoch advance" (`:1-9`).
- Entries that run it:
  - E3c, the dispatch retry (`DRE:421-432`);
  - E6, the drain hand-back, which is R-1b's `WAKE_REMOTE_OWNER` → `REPLICA_OPERATION_DISPATCH` ingress (`operation-workflow-owner-handoff-state.js:229-300`);
  - the self-owned coordinator wake (`:453-458`);
  - the membership-publication dispatch retry.
- EXECUTE entries (K2, `checkTimeouts` → `EXECUTE_ACTIVE_REPLACE` → `executeOperationFromReconcilePath`, `SR:398-407`) go straight to `executeOperationInternal`, **without** it.

**Counter-ordering**
1. R is ACTIVE and deferring (S9, unbounded).
2. Any node joins or leaves, so the published membership epoch advances.
3. The seed's next sweep hands back with `WAKE_REMOTE_OWNER`. The owner runs DISPATCH, the epoch gate FAILs R, and B3 removes the healthy target.
4. The same R woken by K2 instead would have progressed.
- The outcome depends on which wake wins the lane.
- That violates P2 (scheduling equivalence) and P3 (the recovery path must invoke the same owner). R-1b *adds* traffic into this entry.

**Kind.** New: the wake route changes the outcome.

**Amendment**
- The epoch fence must not apply once the plan has dispatched: `isReplaceRemoveDispatchPhase`, or step ≥ ACTIVE.
- Or every entry converges on one function: R-1e, then the phase decision.
- **OWNER DECISION (narrow):** the scope of the audit-finding-7 fence. The lead can probably decide it, because the fence's stated intent is PENDING dispatch.
- Add a model axis, **"entry route: EXECUTE | DISPATCH | timeout-reconcile | orphan"**, crossed with every phase. P3 compares outcomes across entry routes.

### BR7. After the effect there is no safe FAIL, and a durable phase is missing

**Evidence**
- The terminal CAS deliberately carries **no expected step**: "a terminal write must overwrite any lagging NON-terminal step (deliberately no expected-step CAS)" (`replica-operation-repository-mutation-row-methods.js:79-101`, audit finding 6).
- So a remote FAIL decided on an ACTIVE snapshot lands on a STOPPING row. Candidates: R-1c "source retained", A3, A4.
- Once REMOVE_REPLICA has been delivered, s's lifecycle is retired and its row is REMOVING or gone (design H5). A FAILED REPLACE then feeds B3, which removes the **target** (`move-planner-move-calculation-methods.js:220-252`).
- Result:
  - with s already removed from the conf, the partition keeps one voter;
  - with s still a committed voter, one of the two remaining voters is dead.

**The durable phase P3 omits: "ACTIVE, removal effect taken, STOPPING not durable".** Three triggers:
1. **The REMOVE_REPLICA deliver times out** (≤ 5000 ms). It is retryable with `deferRetry` (`DRR:100-106`, `:465-478`). The source may have executed the removal, and the row stays ACTIVE.
2. **The STOPPING write fails** after an INITIATED answer. For a REPLACE on `replica_operations-*`, R's row can live on the partition whose membership is changing. Its write then needs both remaining live voters, and a transfer window drops proposals (F1 X1: 2000 ms write budget).
3. **A restart** between `deliver` and `updateStep`.
- On resume at ACTIVE:
  - a REMOVING source goes to STOPPING (`operation-workflow-recovery-observation.js:763-765`), which is fine;
  - an **absent** source row with s still in ConfState (a lost REMOVE_PEER) makes R-1a answer SOURCE_STILL_VOTER. R-1e then "continues the chain", which re-runs remove safety at ACTIVE, where R-1f does not apply because it is gated on STOPPING.
  - That holds until the evaluation happens to SAFE and a NOT_FOUND answer moves R to STOPPING (`priority-publication-safety-topology.js:50-54`).
  - With S9 there is no bound. If safety DEFERs, R waits at ACTIVE with a lost conf change.

**The ambiguous-effect FAIL.**
- For ordinary (non-system) partitions a retryable REMOVE_REPLICA delivery failure is **not** deferred: `shouldDeferRetryableDispatchFailure` is `systemTable`-only (`DRE:146-153`). It FAILs at `DRR:503` even though the source may have executed it.
- For system partitions the retry goes through DISPATCH, which is BR6's epoch gate.

**Kind.** New: an irreversible effect × FAIL × B3.

**Amendment**
- **The effect is fenced durably before it is sent.** A CAS write immediately before `deliver`, for example a lease touch or a "removal intent" stamp with `workflow_step = ACTIVE AND completed_at IS NULL`, is the **last await**. §3.2's synchronous checks follow it.
  - Under S1, the renewed live lease fences R-1c for 30 000 ms. That covers the deliver window (≤ 5000) and the STOPPING write.
- **Every FAIL edge that claims "source untouched"** (R-1c, A3, A4, the ACTIVE epoch gate, the dispatch failure) uses an expected-step terminal CAS (`workflow_step = ACTIVE`). Or B3 refuses to remove the target of a FAILED REPLACE whose `steps_history` contains STOPPING, or whose source row is REMOVING or absent.
  - **OWNER DECISION:** the sealed audit-finding-6 CAS, or the B3 contract.
- Add the durable phase **"ACTIVE, effect taken"** to P3's list. R-1e at ACTIVE with the source row REMOVING, REMOVED or absent routes to the STOPPING / AWAITING_COMMITTED_MEMBERSHIP owner (so R-1f applies) instead of re-running remove safety.
- Add the output **"FAILED with the removal effect taken"** to §1.2. It must be 0.

### BR12. The effect-boundary re-read of R can be the captured snapshot

**Evidence**
- K2, K3 and the dispatch retry resolve R with `resolveDeferredRetryVisibleOperation`. It returns `cloneOperationSnapshot(fallbackOperation)` when the visibility observation is **deferred** (`DRE:456-468`; the callers pass `allowPriorityRecoveryDeferredVisibility: true`, `DRE:532-542`, `DRR:700-710`).
- The fallback is the operation captured when the timer was armed.
- §3.2 item 1 prescribes "a cache re-read of R (`getOperationByIdVisibilityObservation`, used the same way by the safety retry)".
- Under deferred visibility that re-read compares the snapshot with itself: non-terminal, ACTIVE, same step-entry timestamp, all vacuously true.
- When is visibility deferred? When R's row sits on a ledger partition that is leaderless or in a transfer window. That is exactly a REPLACE of a `replica_operations-*` partition during its own handoff.
- Meanwhile a remote writer may have made R terminal.

**Kind.** New: a cached-input class (I3 gains a third value).

**Amendment**
- I3 = {authoritative, cache, **deferred → captured snapshot**}. At the effect boundary, and at handoff issuance (TC5), the deferred class is **WAIT**, never permit.
- Mutation **M5b**: treat a deferred-visibility snapshot as current at the boundary. Expected red: an AN8-like anchor with R's row invisible.

### 4.1 Per durable phase: does recovery invoke the same owner and re-read authority?

| Phase | K1 `checkTimeouts` (local owner) | Orphan sweep | Startup | Remote drain | Verdict |
|---|---|---|---|---|---|
| ACTIVE deferring (target added, source present) | EXECUTE path, same owner (`SR:398-407`) | Same | Same via K1 (the RECOVERY cause is unwired, §2(h)) | R-1b → **DISPATCH** (BR6); R-1c on an expired lease (BR4) | **Not equivalent** until BR4 and BR6 are fixed |
| ACTIVE, effect taken, STOPPING not durable | Resumes at ACTIVE and re-runs safety | Same | Same | R-1c can FAIL it (BR7) | **Missing phase** (BR7) |
| STOPPING, row REMOVING | `RECONCILE_STOPPING`, 60 000 step budget **and** 300 000 top-level budget (BR5) | Same | Budget consumed during downtime | – | Budget edge (BR5) |
| STOPPING, row gone, conf uncommitted | R-1f, "once per term" | Same | R-1f record lost, so it re-proposes (fine) | – | Stalls without a term change (BR8) |
| STOPPING, conf committed, terminal unwritten | R-1a → T8 | Same | Same | – | Equivalent, given BR15's lag |
| Handoff requested, outcome unknown | Attempt in memory | – | Restart rule (BR10) | – | Latency up to W_max; a late H-A effect (BR9) |

**Can a recovered continuation act on a pre-restart cached decision?**
- *Across* a restart: no. The in-memory maps (attempt, evidence, waiters, the R-1f term record) are gone. Resumes re-read rows.
- One side effect: the R3 escalation anchor `recordPriorityPublicationSourceLeaderHandoffRequested` (`priority-publication-handoff.js:256-263`) is in memory. After a restart the owner re-issues the source leg instead of the escalated target leg. P3 must compare modulo the handoff kind, or the anchor must be derived from durable state.
- *Within* a process: yes, through BR12's snapshot fallback.

---

## 5. Question 5: timing arithmetic (Phase 6)

### 5.1 Constants, verified at fbbf2d7a2

| # | Constant | Value | file:line |
|---|---|---|---|
| K1 | `checkTimeouts` interval, with the orphan pass chained after it | 1000; skipped while in flight | `rebalancer-constants.js:97`; `rebalance-coordinator-lifecycle.js:662-675` |
| K1_eff | Real period | max(1000, Σ serial remote-wake delivers + max over op lanes) | `RT:234-247` (serial `await` of the remote wake in the loop), `RT:315-317` (`Promise.all` of lane runs) |
| K2 | Safety fallback | 1000; the timer deletes itself on fire and relies on the joined holder to re-arm | `operation-workflow-owner-shared.js:339`; `DRE:515-516, 529` |
| K3 | Active-REPLACE resume | 250, suppressed while K2 is armed | `owner-shared.js:341`; `DRR:663-700` |
| K4 | Dispatch retry | 250, doubling to 8000, jitter 1/5 | `owner-shared.js:341-344` |
| K5 | `checkRebalance` minimum | 1000 priority / 5000 other | design K5 |
| K6 | Handoff re-request / staleness | 5000 / 60 000 | `owner-shared.js:388-389` |
| K7 | Transfer window | 1000 + 2500·i; about 31 000 for the hash fallback | design K7 |
| K8 | STEP_DOWN deliver | 5000 (router default; no `timeoutMs` passed) | `priority-publication-handoff.js:266-269`; `transport.js` MESSAGE_TIMEOUT_MS |
| K8′ | REMOVE_REPLICA deliver (system and priority) / retry-after | 5000 / 1000 | `owner-shared.js:347-348`; `DRR:164-181` |
| K9 | Readiness build | per macrotask, one item per drain | `RPSO:129-149` |
| K9′ | Ready lease / heartbeat | 15 000 / 5000 | `src/constants/time.js:5-6` |
| K9″ | **Live-evidence max age** (a completed readiness record goes non-reusable by time alone) | 30 000 | `control-plane-readiness-constants.js:142`; `readiness-planning-publication-contract.js:176-195` |
| K10 | Owner lease | `updatedAt` + 30 000, renewed **only** by canonical transition writes | `replica-operation-owner-lease.js:41, 138-144`; `replica-operation-repository-mutation-update-methods.js:225-239` |
| K11 | Step budgets | ACTIVE 30 000 (never enforced at ACTIVE, §2(h)); STOPPING 60 000 | `rebalancer-constants.js:86, 89` |
| **K11′** | **Top-level operation budget from `createdAt`** | **300 000**, minimum grant 5 | `src/control-plane/timeout-budget.js:16-17`; `SR:612-647` |
| K12 | Orphan throttle | 5000, and runs only after K1 completes | `RT:365-377`; `rebalance-coordinator-lifecycle.js:667-668` |
| K14 | Transport ack quarantine | 2 consecutive ack timeouts | `transport.js` ACK_TIMEOUT_QUARANTINE_THRESHOLD |
| K15 | Persistence admission wait | poll 10, bound 120 000 | F1 K4 (`raft-rs-runtime-owner-constants.js:140-143`) |

### 5.2 Crossings that remain after the design

| # | Crossing | Arithmetic | Effect | Finding |
|---|---|---|---|---|
| X-A | K10 × S9 | The lease expires at ACTIVE entry + 30 000 (no persists while deferring). R-1c is then gated on the participation read with `REMOVE_SAFETY_OWNER_PARTICIPATION_KIND` (`RT:824-842`). Its refresh-pending rate is 48/74 = 0.65, 60/94 = 0.64 and 93/150 = 0.62 (finding §2a). P(not yet FAILed after k seed sweeps) ≈ 0.37^k: 0.37, 0.14, **0.05** at k = 3 | A **live** owner's REPLACE is FAILED about 31-33 s after ACTIVE; B3 removes the healthy target | **BR4** |
| X-B | K11′ × S9 | ACTIVE wait ≥ 300 000 − (PENDING..SYNCING) − 5, so at STOPPING the first not-progressed `RECONCILE_STOPPING` has `stepAllocation.allowed = false` and FAILs (`SR:647-683`) | FAIL with the source's lifecycle already retired: T-7 hazard | **BR5** |
| X-C | K11 ACTIVE 30 000 × the CL-043 staleness exclusion | After 30 s R is "not active" for other operations' concurrency gates (`RT:663-668`) | Design T-6 already | – |
| X-D | K2 × lost wakes (BR1, BR2) | Per-node refresh 100-300 ms < evaluation 250-999 ms, so the publication lands inside the window; bounded by K2 = 1000 | Normal progress is again 1 s-bounded | BR1, BR2 |
| X-E | K8 × the lane | The STEP_DOWN deliver holds R's lane ≤ 5000; every wake in that span joins the holder | Edges lost; K1_eff ≥ 5000 + E | BR2, BR14 |
| X-F | W_max × check 3 | A silent no-op transfer blocks T5 for up to W(3) = 8500 or about 31 000 (hash fallback) | Latency with every prerequisite true | BR10 |
| X-G | W at the leader × W_max on O | The leader's window starts after deliver + forward + inbound queue (≤ K15 = 120 000) and stretches with lost ticks | False resolution; a proposal dropped by the still-running window | BR10, BR8 |
| X-H | R-1f once per term × a transfer abort with no term change (`raft.rs:1107-1108`) or a pending-conf empty conversion (`raft.rs:2062-2090`) | No re-drive until STOPPING 60 000 | FAIL, then B3: the T-7 hazard reopened | **BR8** |
| X-I | Commit × announce on O | Application waits for the Ready's awaited sends (≤ 5000 per unresponsive peer; ≤ 2 × 5000 before quarantine) plus admission (≤ 120 000) (`RO:874-927`) | The membership event lags the commit | BR15 |
| X-J | K1_eff on the seed | The serial `await` of each `WAKE_REMOTE_OWNER` delivery (timeout 5000) gives N_unresponsive × 5000 per sweep | R-1c and every other drain decision slow down proportionally | BR14 |
| X-K | K9″ × the tokenKey dedupe | Every 30 000 a completed record is republished under the same token | Dropped wake | BR2c |
| X-L | Source node death × S9 | K9′: the ready lease lapses 15 000 after the last renewal. REMOVE_REPLICA is then undeliverable; the dispatch retry backs off to 8000 through DISPATCH | Epoch gate FAIL after the node-membership epoch advances; or an immediate FAIL on a non-retryable class | **BR13** |

### 5.3 Does S9's unbounded ACTIVE wait interact with a lease or readiness expiry?

Yes, four ways: X-A, X-B, X-L and X-C.
- The **source's ready lease** expiring is not an input to SAFE, which is correct: removing a dead source is desirable. But it decides whether the effect can be delivered at all (BR13).
- The **target's** ready lease is on O, which is alive by construction while it runs the owner.

### BR4. S1 × S9: a live, waiting owner looks dead after 30 s

**Evidence**
- Arithmetic X-A.
- The design's T-8 assumes "Live owner: its own T9 at 30 000". Under S9 there is no T9 at ACTIVE (`SR:398-407`, and the design's own §2(h)).
- So the only live-vs-dead evidence after 30 s is the refresh-pending-prone readiness read, the F-d class.
- R-1c "FAIL, source retained" then fires on healthy owners. B3 then removes the healthy target.
- It also races the owner's own effect (BR7).

**Kind.** New. It emerges from two owner decisions composing.

**Amendment, OWNER DECISION.** Choose one:
- (a) A waiting owner renews its durable lease below the TTL, for example every 10 000 ms while non-terminal. That is a ledger write per waiting REPLACE per 10 s, and it composes with BR7's pre-effect fence.
- (b) R-1c's unavailability evidence is node liveness (the nodes-row ready lease K9′, or a transport ping as CL-044 does, `RT:680-692`), never the planning participation read.
- (a) keeps S1's "live lease means available" literally true for a waiting owner.
- Add the pair **K10 × S9** to §4.6, and anchor it: ACTIVE deferring for 31 s with a healthy owner is never FAILED.

### BR5. The 300 000 ms top-level budget × S9

**Evidence.** Arithmetic X-B. `createTopLevelOperationBudget` is anchored at `createdAt` (`SR:612-623`). It is independent of the step budgets and fails at STOPPING the moment `RECONCILE_STOPPING` answers "not progressed".

**Kind.** New timing crossing.

**Amendment.**
- For a REPLACE past T5, the budget failure must evaluate R-1e and R-1f, and must never FAIL while s may be retired. Joint with BR7.
- S9 says no timer forces an outcome at ACTIVE. The owner should confirm that the 300 s budget is also suspended for a REPLACE whose ACTIVE wait consumed it, or that its FAIL never hands the target to B3.
- **OWNER DECISION**, joint with BR7.

### BR8. R-1f's "once per leader term" rate limit

**raft-rs facts**
- A leader drops every proposal while a transfer runs (`raft.rs:2032-2040`). A follower forwards `MsgPropose` fire-and-forget (`raft.rs:2310-2322`), so a forwarded REMOVE_PEER's drop is invisible to O.
- The transfer ends at the leader's election timeout **without a term change** (`raft.rs:1107-1108`). O gets no event.
- A conf change proposed while another is pending becomes an empty normal entry with an Ok answer (`raft.rs:2062-2090`).
  - When the pending one applies, O gets a membership event. But "once per term" forbids the re-drive in the same term.
- The peers' own REMOVE_PEERs are one-shot on the row DELETE event (`partition-service-raft-peer-cache-reconciliation.js:160-186`).

**Counter-ordering**
1. T5 is admitted after BR10's false W_max resolution.
2. The source deletes its row. The peers and R-1f propose; the leader, still inside its window, drops them all.
3. The window aborts with no term change.
4. R-1f has already proposed this term, so it waits. Nothing else proposes.
5. STOPPING 60 000 expires: FAIL, then B3. The quorum hazard S2 was meant to close.

**Kind.** New: the rate limit contradicts a raft fact.

**Amendment**
- R-1f re-drives on **every** membership, leader or term event while s ∈ voters. Duplicates are no-ops (`changer.rs:237-240`; `raft.rs:2062-2090`).
- It also re-drives on a W-derived timer: once per max(W_max, one commit round trip) while s ∈ voters, as the backstop for drops that raise no event.
- This is a raft-derived bound, not the 1 s planner cadence. Constraint 5 allows a low-frequency path that invokes the same owner.
- Mutation **M13b**: rate-limit per term. Expected red: an anchor where the proposal is dropped inside a window that then aborts.

### BR13. A dead source node during an unbounded ACTIVE wait (OWNER DECISION)

**Evidence**
- The chain requires the source's executor: REMOVE_REPLICA → the source deletes its row → the peers propose (design H5).
- Delivery to a dead node:
  - no connection → `buildNoConnectionResult` (`websocket-transport.js:597-603`);
  - non-retryable → FAIL at `DRR:503`;
  - retryable on a system table → DISPATCH retry (`DRE:359-440`), which hits BR6's epoch FAIL once the node's death advances the membership epoch.
- **Every branch ends in FAILED, then B3 removes the healthy target**, leaving {r1, s-dead}: 1 live voter of 2, so no quorum. The alternative is waiting forever.
- The planner cannot help. Creation refuses any REMOVE of an active REPLACE's source (`rebalance-coordinator-priority-budget-admission.js:505-574`), with no staleness exclusion (verified).
- R-1f is STOPPING-only.
- A direct REMOVE_PEER at ACTIVE would leave s's services row ACTIVE. Row-driven reconciliation on the leader re-admits any ACTIVE row missing from the peers (`partition-service-raft-peer-cache-reconciliation.js:295-356`; only FAILED, REMOVING and REMOVED rows are skipped, `:92-102`).

**Kind.** New input: I11, the source node's reachability and liveness.

**Amendment, OWNER DECISION.** Who retires a dead source's row and its conf membership inside a REPLACE? For example: the owner writes the source row REMOVED on the node's behalf after a liveness proof, then R-1f.
- Until decided, the model needs the cell **"source node dead at ACTIVE, SAFE"**, with the expected outcome stated.

---

## 6. Question 6: causal-boundary latency (constraint 12)

### 6.1 Cadences still on the critical path under the design as written

1. **K2 (1000) through lost wakes** (BR1, BR2). That is the common case, not the tail.
2. **K1_eff at STOPPING** through a membership event lost to a lane join (BR2a). STOPPING has no K2. K1_eff is ≥ 1000, and ≥ 5000 + E whenever any op's lane holds a deliver (BR14).
3. **W_max on T5** through a silent no-op attempt (BR10): up to 8500 or about 31 000.
4. **The R-1f "once per term" stall** (BR8): unbounded within a term, capped by STOPPING 60 000, and it ends in FAIL, not completion.
5. **Not a cadence, but a bound**: commit → announce on O (BR15). Σ awaited sends: 5000 per unresponsive peer, ≤ 10 000 before quarantine. Plus admission ≤ 120 000.
6. **The drain hand-back → owner wake** is not on the critical path, because the owner has its own wakes. It matters only as BR6.

### 6.2 Worst case from "prerequisites true" to completion

**As designed:** unbounded until 60 000 ms, and then FAILED rather than completed (BR8). Excluding the R-1f stall, it is the sum of:
- K2 (1000) + E (≤ ~1000), for a lost readiness edge;
- W_max (≤ 31 000), for check 3;
- K8′ (≤ 5000), the REMOVE_REPLICA deliver;
- the STOPPING write;
- the source's row delete and the peers' proposals;
- the commit;
- O's apply (≤ 10 000 + K15);
- K1_eff for a lost membership edge (≥ 1000).

**With BR1, BR2, BR3, BR8, BR10 and BR15 amended:**
- no planner or remove-safety cadence remains;
- the latency is E, plus the deliver and CAS round trips, plus the raft commit, plus O's apply;
- the one timer on the path fires only after an eventless drop, and it is bounded by W_max. It is raft-derived, so it is allowed under constraints 5 and 12.
- The latency test must start its clock at the commit on the leader, not at O's announce.

### BR15. "Commit → completion 0 ms" is measured from the wrong instant

**Evidence**
- `announce` runs only at the end of a drain chain (`RO:929-943`).
- Application of committed entries waits for the Ready's sends (sequential, each awaiting an ack) and for persistence admission (`RO:874-927`).
- **When t leads** (the post-handoff normal case), t's Readies include messages to s.
  - A retired group on a live node answers `noHandler` fast (`RO:768-775`).
  - A **dead** source node costs 5000 per Ready until quarantine.

**Kind.** Correction of the §4.7 latency definition.

**Amendment.**
- Define the boundary as "applied on O → completion = 0 ms", and separately "commit on leader → applied on O ≤ Σsends + admission".
- Include a dead-source variant in the Phase 6 table.

---

## 7. Question 7: duplicate wake-ups and duplicate reconciliation under concurrent CAS

| Duplicate | Idempotent? | Evidence | Note |
|---|---|---|---|
| Same-node wakes (timer, readiness, membership, DISPATCH, K1, orphan) | Idempotent in effect (the lane joins), but **lossy as edges** | `durable-workflow-coordinator.js:484-486` | BR2a |
| DISPATCH vs EXECUTE for the same wake | **Not idempotent**: DISPATCH can FAIL on the epoch | BR6 | – |
| REMOVE_REPLICA re-sent | Yes: a re-dispatch to REMOVING restarts the removal; NOT_FOUND moves to STOPPING (`priority-publication-safety-topology.js:50-54`) | Design §2(h) | – |
| REMOVE_PEER duplicates (peers + R-1f) | Yes: a pending conf change makes the entry empty; removing a non-member is a no-op | `raft.rs:2062-2090`; `changer.rs:237-240` | A duplicate can be *silently emptied*, which is BR8's reason for level-triggered re-drives |
| STEP_DOWN duplicates, same transferee | Yes: raft-rs ignores it, with no reset | `raft.rs:1889-1898` | – |
| STEP_DOWN duplicates, different transferee | **No**: abort and restart | `raft.rs:1899-1906` | BR9 item 3 |
| Terminal writes REMOVED vs REMOVED | Yes: first-terminal-wins (`completed_at IS NULL`) | `mutation-row-methods.js:91-99` | – |
| Remote FAIL vs the owner's STOPPING | **No**: the terminal CAS ignores the step | BR7 | – |
| Owner STOPPING CAS vs the remote FAIL landing first | The STOPPING CAS fails, but the effect was already sent | BR7 | – |
| Readiness waiter registrations | Idempotent per operation | – | Waiters leak when R goes terminal remotely (BR17) |
| **BR16.** R-1f REMOVE_PEER vs the leader's row-driven admission | **No**: flip-flop | See below | – |

### BR16. The leader re-admits s after R-1f's REMOVE_PEER commits

**Evidence and counter-ordering**
1. T7's precondition "the source row is gone" is read on **O's** services cache.
2. The leader L's cache can still show s ACTIVE.
3. L's next services reconciliation (`reconcileRaftPeersFromCacheForService`, leader-only admission, `partition-service-raft-membership-administration.js:120-135`) re-admits s once REMOVE_PEER has committed: s is not in the peers, and its row is not skipped (`:92-102`).
4. s is re-added as a learner. That does not break C1 (voters only), but it changes the membership after completion. A learner-promotion path could later promote it.

**Kind.** New: a competing authority re-adds the source.

**Amendment.**
- T7 reads the source row from the authoritative services read, not the cache.
- Add a P1 corollary: after REMOVED, s is not re-admitted. Anchor it with a lagging cache on the leader.
- Medium confidence: I did not trace whether admission adds a learner or a voter, or whether promotion follows.

---

## 8. BR14 and BR17 (details)

### BR14. Backstop cadence K1 is not 1000 ms

**Evidence**
- The sweep awaits `wakePriorityRecoveryRemoteOwnerFromDrainSnapshot` **serially**, per operation, in the loop (`RT:238-247`, `operation-workflow-recovery-drain.js:469`, deliver timeout 5000).
- It then awaits `Promise.all` of every op's lane run (`RT:315-317`). A lane held by a 5000 ms deliver stalls the sweep.
- The orphan pass runs only after it (`rebalance-coordinator-lifecycle.js:667-668`). The interval skips while in flight (`:663-664`).

**Consequences**
- T-11's "≤ K1 (plus sweep duration)" is really unbounded in the number of unresponsive owners and lane holders.
- Under R-1b, every seed sweep sends a DISPATCH wake to each waiting owner (deduped only while a retry is active, `recovery-drain.js:459-468`). That is a ≥ 1/s evaluation source per REPLACE for the whole S9 wait (R12 load).

**Kind.** Correction of K1, K12 and T-11.

**Amendment**
- Phase 6: K1_eff = max(1000, Σ serial wakes + max lane hold).
- The backstop proof (5b) must hold under K1_eff, not K1.
- Consider rate-limiting R-1b's hand-back per operation, for example only on a verdict change.

### BR17. Smaller items (instances)

- **The identity read is not side-effect free.** It refreshes liveness projections and can wake barrier-blocked builds (`readiness-planning-semantic-currency-methods.js:319-361`). Moot once BR1's level recheck replaces it.
- **Waiter cleanup.** Drop R's waiter on any terminal observation, including a remote terminal seen through the cache.
- **The second evaluation at `DRR:284`** is a resume edge (E1c). Its evaluation context supplies the waiter's node set and the check 3 attempt state.
- **The ROLE_NO_OP answer class** (BR9 item 4).
- **Subscription lifetime** (§1.5): resubscribe on either side's re-init; fail visibly when absent.

---

## 9. Consolidated model amendments

1. **§3.3 (R-2)**
   - The recheck re-reads the **level**: the participation read, with remove safety's options (BR1).
   - Drop the tokenKey dedupe. Wake-arrived-during-run triggers a rerun through a per-op `wakeSeq` (BR2).
   - Every deferral reason's wake is its own authority's change event (BR3).
2. **§3.2 (the effect boundary)**
   - The last await is a **durable CAS fence** (expected step ACTIVE, `completed_at IS NULL`, lease renewal), followed by the four synchronous checks (BR7, BR4).
   - The deferred-visibility snapshot means WAIT (BR12).
   - Source reachability is a named input (BR13).
3. **§3.4 (B5)**
   - The attempt's term and transferee come from the port answer of the effect turn. The STEP_DOWN request carries `attemptTerm`, and the executor fences on it. Retarget only across a term. ROLE_NO_OP is a resolution class (BR9).
   - The restart pseudo-attempt resolves on `lead === t` and never blocks T5 (BR10).
   - Record the CL-043 supersession (BR11).
4. **§3.1 R-1f.** Level-triggered on every membership, leader and term event, plus a W_max-derived backstop timer. No per-term limit (BR8). T7 reads authoritative rows (BR16).
5. **§4.2-§4.3 states and edges**
   - Add the durable phase **ACTIVE / EFFECT_TAKEN**. Its R-1e routes to the STOPPING owner (BR7).
   - T9 is split: "FAIL before the effect" (legal) and "FAIL after the effect may have been taken" (forbidden, or FAIL without B3).
6. **§4.4 resume edges.** Add E1c, E1d, E3b, E3c and E11. E6 is "DISPATCH entry", not "same as E4" (BR6).
7. **§4.6 inputs and pairs**
   - Inputs: I3 gains the deferred class; add I11 (source reachability); add I12 (entry route); add I13 (published membership epoch).
   - Pairs:
     - K10 × S9;
     - K11′ × S9;
     - W_max × check 3;
     - wake × lane-held;
     - the E8 core event × a lagging row projection;
     - remote FAIL × effect in flight;
     - R-1f proposal × a transfer window that aborts without a term change.
   - Temporal classes: add **"processed but not announced"** (F1 B2) for the §3.2 checks 2 and 3 and the R-1f decision; add **"effect taken, durable record pending"**.
8. **§4.7 properties**
   - P3 ranges over entry routes as well as phases.
   - The latency boundary starts at the leader's commit (BR15).
   - AN5 uses an identity-preserving publication (BR1).
   - New anchors:
     - a 31 s ACTIVE deferral with a healthy owner is not FAILED (BR4);
     - an epoch advance during ACTIVE does not FAIL via DISPATCH (BR6);
     - REMOVE_PEER dropped in an aborting window is re-driven (BR8);
     - a deferred-visibility snapshot does not permit the effect (BR12).
9. **§4.8 mutations.** Add:
   - M4b, a joining submit with no rerun;
   - M4c, an identity recheck instead of a level recheck;
   - M5b, a deferred snapshot treated as current;
   - M13b, a per-term re-drive limit;
   - M15, the epoch gate applied at ACTIVE;
   - M16, a terminal FAIL without an expected-step CAS after the effect.
10. **§5 Phase 6.** Add K1_eff, K8′, K9″, K11′, K14, K15, and crossings X-A to X-L.

## 10. Items that go back to the owner

- **BR4 (S1 × S9).** A waiting live owner's lease expires at 30 s. Either renew it while waiting, or base R-1c on node liveness instead of the planning participation read.
- **BR5 + BR7.** No FAIL may hand the target to B3 once the source removal may have been effected. Options:
  - an expected-step CAS on "source retained" FAILs (this changes the sealed audit-finding-6 terminal CAS);
  - or a B3 exemption for a REPLACE whose history shows STOPPING;
  - or the 300 s top-level budget suspended for REPLACEs.
- **BR6.** The audit-finding-7 epoch fence's scope: PENDING dispatch only, not the remove phase. The lead can probably decide this narrow case.
- **BR13.** Who retires a dead source node's row and membership inside a REPLACE.
- **BR9 item 1.** The port's transfer answer carries `{term, transferee}` as data. This is decision-adjacent, the same class as S5.2.

Everything else is design or evidence work inside the owner's 2026-09-25 decisions.

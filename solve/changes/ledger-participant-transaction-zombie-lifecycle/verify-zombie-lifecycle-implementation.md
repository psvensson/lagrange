# Adversarial verify: zombie-lifecycle implementation (uncommitted working tree)

Status: IN PROGRESS 2026-07-05. Diff read (11 files, +257/-32). Vet amendments Z1-Z4, G1-G4, minimal-fix-set = binding.

## Surfaces
- A: role-honesty of the heal gate (this.role vs liferaft state)
- B: prepared/active sweep interplay, single shared ROLLBACK bookkeeping
- C: pinned solo property test + routing + ACID suites
- D: absorption-removal blast radius (sessionless callers)
- E: coordinator guard blast radius — empty-key stage false-abort (CRITICAL check)
- F: at-risk suites with real exit codes
- G: ratchet/lint/accounting

## Findings (write-as-you-go)

### Diff-level observations (pre-run)
- Sweep exec-ROLLBACK failure path: catch logs then STILL clears dedup set, refreshes cache, and DELETES bookkeeping (both loops run). If ROLLBACK genuinely failed with tx still open, session becomes invisible (Z4 principle says keep registered on failure). Pre-existing shape for prepared branch; now extended to ACTIVE. Severity to assess.
- Gate = role NOT IN {LEADER, CANDIDATE} → permits FOLLOWER + LEARNER, matches vet ruling; solo carve-out via replicaIds.length<=1.
- G4 move verified in diff: deferCandidacy now BEFORE successorViable return, gated !isSoloReplicaGroup — matches ruling.
- recover() participant loop: skip keyed on resolveParticipantKey(participantRecord) — need to verify key derivation matches createParticipantRecord's participantKey (raw row vs record shape mismatch could make the skip never fire).

### A: role-honesty — code-verified
- promote() (base liferaft :698-732) runs raft.change({state:CANDIDATE}) SYNCHRONOUSLY → 'state change' → emit('candidate') → wireReplicaLifecycleEvents → applyReplicaDemotion sets this.role=CANDIDATE, ALL before `await raft.packet('vote')` sends anything. So this.role cannot be FOLLOWER while votes are in flight. Gate input honest for the FOLLOWER case. PASS.
- Ignore paths where this.role diverges from raft.state: (1) solo leader (isSingleReplica && isLeader) — role stays LEADER, solo carve-out permits heal anyway, coherent; (2) joining LEARNER — CANDIDATE/FOLLOWER events ignored (raft-init-base:400-421), so a learner whose raft campaigned has role=LEARNER + raft.state=CANDIDATE with vote packets out → heal permitted at a phantom index. THEORETICAL Z2 hole (learner must hold a 60s-stuck participant tx, campaign, and win). LOW severity; belt fix = also consult this.raft?.state in isStuckTransactionHealPermitted (idiom already exists at :690 etc.).
- DEFECT (deviation from vet ruling): isSoloReplicaGroup() = replicaIds.length<=1 ONLY; the ruling said "same predicate family as shouldIgnoreDemotionEvent", whose isSingleReplica ALSO requires raft peerCount===0 (raft-init-base:394-399). replicaIds is reconciled lazily (partition-service-raft-peer-cache-reconciliation.js:109-111 pushes peers from service rows periodically) → window where a joining peer exists in raft.nodes but not in replicaIds → wedged multi-node LEADER classified solo → bare ROLLBACK with a real raft peer able to hold/truncate the suffix. MEDIUM (window race; exactly the coherence the vet ordered). Fix: add `(this.raft?.nodes?.length || 0) === 0` conjunct (leader case), or reuse isSingleReplica.

### B: sweep interplay — code-verified PASS
- beginTransaction refuses any new session while activeTransactions.size>0 OR preparedTransactions.size>0 (:487-492) and prepare MOVES active→prepared (:572-582) → at most one logical session exists; prepared+active coexistence structurally impossible; the ACTIVE collector's preparedTransactions.has() skip is a redundant belt. No double-report. Single shared ROLLBACK covering both lists = G3 as ruled.
- G2 race (sweep under prepare's replicate await): sweep marks session lost; prepare then registers a phantom prepared entry and returns success, but commitTransaction checks preparedStateLostSessions FIRST (:603-608) → typed PREPARE_LOST → coordinator abort. Bounded-loud; phantom entry expires via the next sweep. Vet's "prefer mark-lost check post-await" not implemented but outcome ≥ vet's acceptable baseline. MINOR note.
- MINOR (Z4-consistency): in the SWEEP, if db.exec(ROLLBACK) throws, the catch logs and execution FALLS THROUGH to clear dedup/cache and DELETE bookkeeping — session invisible with tx possibly still open (Z4 says keep registered on failure; honored in rollbackTransaction catch, not in the sweep). Pre-existing shape for the prepared branch; ROLLBACK realistically only throws when no tx is open. LOW.

### E: false-abort analysis — PASS (no false abort)
- Producers (protocol.js:37-78) CAN return [] on replay (all participants at target status). BUT coordinator executeParticipantStage (:410-413) treats an EMPTY options.participantKeys as absent → falls back to Array.from(workflow.participants.keys()) (non-empty registry) → idempotent re-drive, pre-existing behavior, guard does NOT fire. Guard fires only when the REGISTRY is empty AND enlistedParticipantCount>0 = exactly the lost-enlistment shape. No legit path empties a live registry (zero participants.delete/clear hits in src/).
- Post-restart: recover()'s participant fill bypasses upsertParticipant → restored workflows have count 0 → guard inert post-restart; registry restored from rows is the protection there. Matches vet minimal form ("count lives on the live record"). Count is NOT needed post-restart for correctness — confirmed.
- createWorkflowRecord spreads ...record so the count survives copies of live records; restoreRecoveredWorkflowRow skips live records entirely → count survives recovery. Recover-skip key (resolveParticipantKey) uses the same key derivation as createParticipantRecord (participantKey||partitionId||participantId) → the gap-fill skip actually engages.
- Missing-key branch: producer keys derive from tx.participants, the same object requireWorkflow returns (both registries hold the same reference via setWorkflowState) → a requested-but-missing key means the Map lost state mid-flight = genuine violation, correct to fail.
- Pre-existing (not a regression): a second registerWorkflow() for an existing live workflowId still clobbers participants Map + count (begin-retry path). Recorded only.

### A addendum: solo-predicate window bounded to LOW
- Peers enter raft.nodes ONLY via joinPeer (liferaft-provider.js:250-255); callers: raft-init-base:497 (init, from replicaIds) and raft-peer-cache-reconciliation.js:140 — which PUSHES the peer into replicaIds (:109-111) in the loop BEFORE any joinPeer. No auto-join on packet receipt (base liferaft emits 'join' only on explicit join()). No shrink path assigns this.replicaIds after removal. So the nodes>0-while-replicaIds-solo LEADER window is not reachable through current wiring except possibly a learner attached outside the reconciliation path — and there the loss degenerates to the vet-accepted solo crash-equivalent semantics (learner truncation self-heals via catch-up). Downgraded to LOW/robustness: still recommend the peerCount===0 conjunct for literal compliance with the vet's "same predicate family" instruction.

### D: absorption-removal blast radius — PASS
- Sessionless commitTransaction()/rollbackTransaction() NEVER used the adoption arm: both normalize null→'default' (normalizeTransactionSessionId :15-19) BEFORE resolving, so the resolver's first branch returns 'default' and lookup misses → idempotent-success/throw paths, IDENTICAL before and after. The vet's claim that dt6-fitness cleanups "relied on the adoption arm" was wrong in mechanism — they were no-ops before and remain no-ops (cleanups at :157/:244/:362 left sessionless; cosmetic only).
- Raw-null resolver callers = prepareTransaction (:537) and write-metrics executeQuery (:53 read, :77 write, :169 executeTransactionWrite). Post-change: sessionless write + foreign session → proposeWrite (semantics pinned by partition-service-transactions-query-routing.test.js — ran green); sessionless prepare + foreign session → typed NO_ACTIVE_TRANSACTION_PREPARE (no production sessionless prepare exists — entry-apply-base:181-187 passes the entry's sessionId).
- Behavior note (accepted): sessionless SELECT while one foreign tx open no longer gets that tx's snapshot filter (raw rows, same-connection read-uncommitted physics) — now consistent with the multi-session behavior; adoption-based filtering for an unrelated reader was itself dubious.
- syncLegacyTransactionAliases size===1 fallback kept untouched per vet ruling.

### C/F: suite runs (real exit codes, all EXIT=0)
- dt6-zombie + dt6-fitness together: 43/43 PASS (claim verified).
- partition-transaction.property + transactions-query-routing + single-partition-acid: 70/70 (solo prepared-sweep pin at property:521,550-570 green; proposeWrite routing pin green; DEFAULT-session absorption green).
- test/workflow/ + test/transaction/: 406/406.
- test/query distributed-transaction {coordinator,coordinator.property,recovery-owned-routing,sql-engine-distributed,write-coordinator x2}: 355/355.
- partition-transaction-handler + sql-query-engine-execution + rebalance-coordinator-atomic-transitions: 295/295.
- FULL test/partition/: 1766 pass / 2 skip (pre-existing skips), EXIT=0. FULL test/raft/: 717/717 EXIT=0.
- dt:prove artifact (solve/changes/dt-prove/dt6-zombie-...-2026-07-05T10-54-23-231Z.json): verdict red-on-revert-proven across all 8 src files (fix=0, revert=1, restore=0). Claim verified.

### G: constraints
- npm run test:complexity: "Complexity ratchet OK: 1857/1857" EXIT=0.
- eslint on all 8 touched src files + new test: EXIT=0, no output.
- Accounting: NEW src files = 0. EXTENDED existing methods (sweep, catch path, upsertParticipant, executeParticipantStage, recover, fitness consequence, recovery caller); NEW private helpers on existing classes (collectExpiredPreparedSessions/collectExpiredActiveSessions split, isStuckTransactionHealPermitted, isSoloReplicaGroup, refreshCommittedIndexCacheFromStore, restoreRecoveredWorkflowRow); REMOVED two adoption arms. refreshCommittedIndexCacheFromStore manages the EXISTING CL-018 cache (no new cache) — avoid-secondary-caches respected. FRONTIER.generated.md + active-gate report json = incidental generated churn.
- Z1 mechanics verified in source: refresh sets _committedIndexCache=undefined → Number.isFinite gate forces re-read of _raft_state durable row (sqlite-log-adapter.js:566-582); the durable committedIndex row itself was inside the rolled-back tx, so the re-read returns the pre-zombie durable value and the CL-018 clamp no longer strands catch-up. DT asserts the cleared set + re-anchored cache; it does NOT assert the vet's "re-delivered committed command actually re-executes" end-to-end — minor gap vs the vet's DT shape (mechanism is direct: empty set cannot dedup-skip). MINOR.
- dt6-fitness test fixture widened to 3 replicaIds — legitimate consequence of the vet-mandated G4 solo gating (solo groups now deliberately skip deferCandidacy), not goalpost-moving.

## Verdict summary
- A: PASS with LOW notes (role set synchronously before vote packets leave; two LOW residuals: learner-mid-candidacy divergence, isSoloReplicaGroup lacks the peerCount conjunct the vet named — recommend belt fix post-land).
- B: PASS (single-session invariant makes prepared+active coexistence impossible; shared single ROLLBACK = G3; G2 race lands on the typed PREPARE_LOST path; one LOW Z4-consistency nit in the sweep's exec-failure fallthrough).
- C: PASS (all pinned suites green).
- D: PASS (blast radius = write-metrics routing [pinned green] + sessionless prepare [typed failure, no prod caller]; commit/rollback provably unchanged).
- E: PASS — NO FALSE ABORT. The empty-producer-output → full-registry fallback (:410-413) shields every idempotent replay; the guard fires only on a genuinely emptied registry with recorded enlistment. Count not needed post-restart (rows restore the registry; count inert at 0).
- F: PASS (all real exit codes 0).
- G: PASS.

OVERALL: SHIP. Recommended (non-blocking) follow-ups: peerCount===0 conjunct in isSoloReplicaGroup; optional raft.state belt in isStuckTransactionHealPermitted; keep-registered-on-exec-failure in the sweep for Z4 symmetry; explicit session ids in dt6-fitness cleanups (cosmetic).

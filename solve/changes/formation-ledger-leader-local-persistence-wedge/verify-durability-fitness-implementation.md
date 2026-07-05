# Adversarial verify: durability-fitness implementation (quest formation-ledger-leader-local-persistence-wedge)

Status: COMPLETE 2026-07-05. Verdict: FIX-FIRST (one CRITICAL defect, surface B).

## Evidence base
- Read: vet-leadership-fitness-design.md (binding), all 4 new/8 modified files, adapter commit/setCommittedIndex/commandAck, raft-init-base 380-540, handler tests 1215-1410, DT test (full).
- Ran: new DT test (17/17 green), replica-handler.test.js (238/238), dt6-candidacy-reluctance-drain-stepdown (green), eslint changed files (clean), npm run test:complexity (1857/1857 OK).
- Experiments (scratchpad exp-*.mjs):
  - exp-signal-b-false-positive.mjs: single-replica fixture — adapter.commit() NEVER called (declared stays 0, no committedIndex row ever written). Signal (b) totally dormant in the DT fixture.
  - exp-signal-b-multireplica-sim.mjs: simulated the multi-replica leader moment (liferaft calls log.commit(idx) on quorum ack while a LEGAL <60s session tx is open): ticks show stuck=true reason=commit_durability_divergence with NO heldMs gating → 3 strikes → unfit → hook fired at ~3s into a legal session. FALSE POSITIVE CONFIRMED.
  - exp-demotion-noop.mjs: performTrackedLeaderDemotion returns true on the fixture but role stays LEADER — explained by shouldIgnoreDemotionEvent (raft-init-base.js:400-403): single-replica leaders IGNORE demotion events (pre-existing, intentional).

## A. Handler extraction equivalence — PASS
- Both old/new derive raft/raftProvider from the same `service.raft`/`service.raftProvider` (handler 64-65); helper re-derives identically.
- Guard order preserved: NOT_APPLICABLE → role branch (REPLACE_TARGET_LEADER_ELECTION follower path intact) → raft/raftProvider NOT_SUPPORTED guard (78-86) BEFORE demotion. Helper's internal guard redundant-harmless.
- LifeRaft.FOLLOWER same import source; EMPTY_LEADER_ID '' identical; cancelLeaderOwnedActivation typeof-guard identical.
- Existing handler tests assert the exact payload {state: FOLLOWER, leader: ''}, cancelCount=1, electionTimerStartCount=1 THROUGH the delegating path — 238/238 green. No test references the removed literal.

## B. Detector correctness — DEFECT (CRITICAL): signal (b) missing the 60s sustain bound
- Journal mode: WAL + synchronous=NORMAL (raft-init-base ~282; vet-verified). Readonly better-sqlite3 connection on a WAL db opens fine while the writer holds locks (WAL readers never block; -shm exists while writer open; witness opened lazily only after declared>0 so the file exists) and sees committed frames IMMEDIATELY (fresh snapshot per read). commit() → setCommittedIndex() is one synchronous call in autocommit → no healthy-autocommit divergence window observable by the sweep. So the readonly-visibility physics themselves are SOUND.
- BUT: on a leader with an OPEN participant session (single connection), every in-session quorum commit's setCommittedIndex JOINS the open tx (non-durable until session COMMIT) while lastDeclaredCommitIndex advances in memory → declared > durable for the WHOLE session duration. This is the vet's F3 LEGAL window ("thresholds must exceed max legal session hold") and amendment 3/4 mandated ONE 60s bound over BOTH signals ("declared − durable > 0 BEYOND BOUND").
- Implementation (partition-service-durability-fitness.js:212-224): signal (b) returns stuck immediately on ANY divergence — no divergenceSinceMs, no bound. Only the shared 3-strike counter (~3s) stands between a LEGAL session and demotion.
- Scenario: multi-replica ledger leader; client holds a legal participant session 5s; one absorbed/sessionless write (or the session's own replicated op) reaches quorum inside it → adapter.commit inside open tx → divergence → 3 sweep ticks → unfit → ERROR + deferCandidacy + performTrackedLeaderDemotion. Healthy leader demoted ~3s into every ≥3s session with an interior commit. On the busy operation-ledger this fires constantly. Empirically confirmed at mechanism level (exp-signal-b-multireplica-sim.mjs).
- Why 17/17 green doesn't catch it: single-replica fixture never calls adapter.commit (proven: declared stays 0, _raft_log empty, no committedIndex row) → signal (b) never armed in ANY subtest. Green-on-fix proves nothing about signal (b); red-on-revert covers signal (a) only.
- FIX SHAPE: mirror inTransactionSinceMs — stamp divergenceSinceMs on first observed declared>durable, clear when equal, require sustained ≥ LEADER_DURABILITY_LEGAL_HOLD_MS before stuck. Run-23 (divergence for minutes) still caught. Add a signal-b subtest (stamp adapter.lastDeclaredCommitIndex above durable, tick past bound+strikes, assert reason=COMMIT_DURABILITY_DIVERGENCE; and a control inside the bound).
- Signal (a) false-positive check: explicit BEGIN holders = participant path (transaction-base:404, 60s-budgeted), partition-transaction-handler.js:81 (same budget regime), split-accessor BEGIN is on the SEPARATE snapshot connection (timer-invisible). db.transaction() helpers are synchronous → timer-invisible. Signal (a) bound 60s+3 strikes ≥ every legal hold. PASS.

## C. State lifecycle — PASS with two recorded residuals
- Flap loop: demotion re-fire requires (re-)LEADER + handoffRequestedWhileLeader false; while continuously unfit, deferCandidacy re-asserted per 1s tick (<10s window) blocks re-win; a flapping signal resets strikes and demotion cycles are paced ≥3s + re-election; bounded churn, CL-033/034 shape avoided. OK.
- Residual 1: readonlyWatermarkUnavailable latch is PERMANENT — one transient open/prepare error = signal-b blindness for the process lifetime (signal (a) survives). Acceptable-but-record (a retry-with-backoff or re-open-on-next-commit would be better).
- Residual 2: no witness connection leak (first failure latches before reopen; close() in lifecycle shutdown after db.close, guarded).

## D. Demotion safety from the sweep tick — PASS
- Sequence byte-equivalent with the shipped drain step-down (extraction); raft.change synchronous; in-flight proposals reject via existing RAFT_COMMIT_TIMEOUT (30s) — same risks as drain, nothing NEW. cancelLeaderOwnedActivation = leaderActivationGate.cancel (core-base:510) — same call the drain path makes. Call-site novelty (unref'd setInterval macrotask vs message-handler macrotask) introduces no new reentrancy: the sequence touches raft/timers only, never the db/session state.

## E. Environmental honesty — ACCEPTABLE RESIDUAL (record as gap note)
- Pure disk hang without an open tx: sync better-sqlite3 call blocks the EVENT LOOP → sweep never ticks → detector blind. BUT a blocked event loop also stops raft heartbeats → followers elect a new leader via normal raft timeout — the environmental case has an existing recovery path the run-23 zombie specifically did NOT trigger (zombie kept the loop healthy). Detector scope honest for the software-wedge class; event-loop watchdog territory otherwise. Record, don't block.
- Disk error that THROWS with process alive: declared stamps before the failed persist → signal (b) catches it (when witness available). Partial credit.

## F. Test honesty — PASS with gaps to record
- 17/17 verified by run. Assertions real for: signal (a) detection timing, hook evidence, unfit flag, consecutive-strike reset, deferCandidacy re-assertion count, surface-only no-hook.
- GAP 1 (biggest): signal (b) completely untested (fixture CAN'T arm it — adapter.commit never called single-replica). Cheap subtest addable as above. Must be added WITH the B fix.
- GAP 2: no role-flip assertion after demotion — structurally impossible on the single-replica fixture (shouldIgnoreDemotionEvent ignores it); the surface-only subtest's "role stays LEADER" assertion is VACUOUS for the same reason (role would stay LEADER regardless). The demotion consequence is covered indirectly: handler mock tests assert the exact raft.change payload through the shared helper. Acceptable via composition; note the vacuous assertion.
- dt:prove artifact: verdict red-on-revert-proven, all 8 src files reverted as a UNION (standard; doesn't prove per-file necessity).

## G. Constraints — PASS
- No timeout/budget raised (reuses PREPARED_HOLD_TIMEOUT_MS 60s + 1s sweep + 3 strikes per soft-warning directive).
- avoid-secondary-caches RULING: compliant. Readonly witness = second READ PATH to the same durable file (no stored duplicate; re-read per tick), justified because the primary connection lies inside its own tx — this is the vet-sanctioned exception. lastDeclaredCommitIndex = local event stamp at declaration site (vet F-fact: "honest local event record, not a cache of another owner's truth"). lastFollowerAckAtByAddress = event actuals for CL-039 viability, not projected state.
- Complexity ratchet: 1857/1857 OK. Lint clean on all changed files.
- Accounting: REUSED = 60s budget, 1s sweep timer, deferCandidacy, drain demotion sequence, split-accessor readonly precedent, nowMs-override test pattern. EXTENDED = sqlite-log-adapter (declared stamp + ack actuals), transaction-base sweep tick, lifecycle shutdown, constants, assembly. NEW = fitness mixin (~294 lines), tracked-leader-demotion.js (extraction, net-neutral), DT test.
- Cosmetic: sqlite-log-adapter.js — commandAck's original JSDoc block now orphaned above getLastDeclaredCommitIndex's new block (two stacked docblocks); lint doesn't flag it.

## FINAL: FIX-FIRST
Sole blocker = B (signal (b) unbounded → healthy-leader demotion within ~3s of any legal ≥3s session containing a quorum commit; violates vet amendments 3/4). Everything else PASS or record-as-residual.

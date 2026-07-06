# DT premise FALSIFIED — real mechanism confirmed at code + log level

Goal of this step: build the confirm-or-falsify DT for the phantom-index→§5.4-veto
election-wedge hypothesis. Outcome: the hypothesis is **falsified by cheaper
evidence than a synthetic DT** (in-repo test comments + the vote code + the run-6
logs), and the TRUE binding mechanism is now pinned in code. Building the phantom-veto
DT would have tested a refuted mechanism — this is the "confirm before betting" win.

## Falsified: there is no phantom-HIGH §5.4 veto

- **Vote code:** base liferaft's up-to-date veto (`node_modules/@markwylde/liferaft/index.js:229-237`)
  compares the voter's `getLastInfo()` to the candidate's `packet.last` (stamped from
  the candidate's own `getLastInfo()`, `:757`). The sqlite adapter's `getLastInfo()`
  (`sqlite-log-adapter.js:157-185`) reads the **durable `_raft_log` table**
  (`ORDER BY log_index DESC LIMIT 1`), so a wedged leader advertises a durable
  (low/stuck), never a phantom-HIGH, index — it would veto *nobody*.
- **In-repo test already says so:** `dt6-ledger-leader-durability-fitness.test.js:34-37,232-233`
  states the run-23 zombie's "in-memory log matches the followers', so vote rules do
  NOT disfavor it" — which is precisely *why* candidacy-DEFERRAL (not vote-correction)
  was the sibling quest's fix. The divergence it models is declared-commit(149) vs
  durable-watermark, with log entries minted correctly.
- **run-6 logs, gap window 07:04:29→07:05:35:** ZERO election activity logged — no
  votes, no candidate transitions, no term changes — and the node that finally wins at
  term 21 is the ORIGINAL leader 82b7bf0d, not the target. No veto is occurring.

⇒ Both the veto-recusal lever AND the redirected "advertise honest durable index"
value-correction are moot: there is no veto to relax or to correct.

## Confirmed: the binding gap is successor-starvation during the durability-unfit window

Run-6 chain (logs):
1. 07:04:17 leader 82b7bf0d is durability-unfit → loses leadership + defers its own
   candidacy (re-asserted every tick while unfit).
2. No successor takes over. The REPLACE target 4e1551aa is "Starting as learner
   (non-voting)" at 07:04:24, reaches voter-ready only at 07:04:29; the other voters
   are quorum-concentrated / retry-stalled on the same wedged partition. Nothing wins.
3. Group stays leaderless ~66s until 82b7bf0d self-heals (07:05:35 "Prepared
   transaction state reconstructed"), stops deferring candidacy, and re-elects itself
   (term 21). Leadership then reaches the target at 07:05:52 and the frozen op completes.

The companion zombie-heal quest (`ledger-participant-transaction-zombie-lifecycle`)
and the fitness quest (`formation-ledger-leader-local-persistence-wedge`) are BOTH
SOLVED; run-6 is their **interaction gap**.

### The code-level gap (partition-service-durability-fitness.js:274-323)

`resolveLeaderDurabilityUnfitConsequence`:
- **One-shot handoff.** Fires the directed handoff only when `isLeader &&
  !handoffRequestedWhileLeader` (`:316`), then `performTrackedLeaderDemotion` sheds
  leadership → role becomes follower → `isLeader` false → the handoff is **never
  re-attempted** when a successor becomes viable LATER (the 07:04:29 target). It only
  re-fires if the node re-wins leadership while still unfit.
- **Blind step-down.** `performTrackedLeaderDemotion` (`tracked-leader-demotion.js:18-41`,
  per lever-B research) sheds to FOLLOWER + empty leader with a randomized election
  timer — it does NOT direct the election to the successor it just verified.
- **Weak viability signal.** `hasViableLeaderDurabilitySuccessor` (`:89-103`) defaults
  to "any follower acked within 10s" — a recent ack does NOT mean that node can win
  (durable, caught-up, not quorum-blocked). So the leader can shed into a **leaderless
  void** on a false-positive, which is worse than the "surface-only, keep serving"
  control (`:311-315` / test `:324-367`).

## The fix forks (owner-spanning) — needs a decision before the DT

| Option | What | Owner | Reuse | Risk |
| --- | --- | --- | --- | --- |
| **(i) Directed + re-probed handoff** | On unfitness, DIRECT the election to a verified successor (`requestElectionNow`/TimeoutNow), and RE-attempt when a successor becomes viable mid-window (not one-shot). | raft demotion + fitness mixin | EXTENDED (`STEP_DOWN_REPLICA`/`requestElectionNow`, Ongaro §3.10 / SwarmKit #1939) | Medium — re-touches the SOLVED fitness quest's demotion path |
| **(ii) Strengthen viability, don't shed into a void** | Make the probe report viable only for a durable, caught-up, electable successor; else stay surface-only (keep serving) instead of shedding. | fitness mixin | EXTENDED (probe) | Low-med — "keep serving unfit" is itself imperfect |
| **(iii) Prevent the trigger** | Stop the self-move's progress write from becoming an orphaned participant transaction on its own partition (break the self-reference at the source). | rebalancer/2PC | NEW-ish | Highest blast radius |

(i)+(ii) compose: direct the handoff to a *genuinely* viable successor, re-probe
mid-window, and keep serving if none is genuinely ready. (iii) is the deep root but
highest cost; (i)+(ii) bound the ~66s window cheaply and idiomatically.

## Recommended next step
DT-first for **(i)+(ii)**, but at TWO fidelities:
- **Decision-level (cheap, reuses `dt6-ledger-leader-durability-fitness` harness):**
  assert the directed handoff is RE-attempted when a successor becomes viable AFTER
  first detection (currently latched one-shot → RED), and that a false-positive-viable
  shed is avoided. No multi-node lift.
- **Outcome-level (multi-node, follow-on):** assert a leader is actually re-elected in
  bounded ticks under a wedged leader + catching-up target (the run-6 shape).

Do NOT build the phantom-veto DT (refuted). Confirm the fix fork (recommend i+ii)
before writing the decision-level DT's exact assertions.

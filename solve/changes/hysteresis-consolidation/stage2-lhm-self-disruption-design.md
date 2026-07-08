# Stage 2 (C2 BONUS) design: wire self-disruption signals into the Lifeguard LHM

Disk-grounded, adversarially-vetted DESIGN. No code edits. Epic:
`solve/epics/hysteresis-consolidation.md` roadmap item 4. Goal: let a locally
degraded observer inflate its OWN suspicion tolerance (Local Health Multiplier,
LHM) by feeding existing self-disruption signals into the existing
`MembershipSwimDetector._applyHealthDelta` — the systemic form of the shipped
MODE-A point-fix (`a79b3728`).

**Bottom line up front:** the epic's "~90% already built / wire 3 signals"
framing is optimistic. On disk, the LHM machinery is 100% built and *already
self-aware* via two of its three intended local-degradation inputs
(`recordProbeResult(ok=false)` + `recordMissedNack`). Of the three *new*
"self-disruption" signals named, only ONE is a live, wireable emitter; the other
two are a dead constant and a comment. That one signal is a weakly-correlated
LEVEL counter that, if wired naively (delta-per-tick), reproduces exactly the
double-count/amplification pathology this codebase has repeatedly refuted.
Recommendation trends **NARROW** (one signal, pull-model, edge-triggered) with a
serious DON'T-SHIP case laid out in §7.

---

## 1. Signal inventory (disk-cited)

| Candidate | Emit site | Driver | Counter vs edge | Deterministic substrate? |
|---|---|---|---|---|
| **#1 Heartbeat consecutive failures** | `heartbeat-service-publication-methods.js:505-529` (`recordFailure`), warn log `:519-520` `HEARTBEAT_LOG_MSG.HEARTBEAT_CONSECUTIVE_FAILURES` ('Heartbeat failing repeatedly', `heartbeat-service-constants.js:50`) | `this.heartbeatConsecutiveFailures++` on each heartbeat write failure; reset to `0` on recovery (`heartbeat-service-lifecycle-methods.js:276-283`) | **LEVEL** (persistent counter, climbs on failure, resets to 0 on recovery) | **Wall clock.** `HeartbeatService` uses default `setInterval`/`setTimeout` (`heartbeat-service.js:50-55`); construction at `control-plane-setup.js:419-427` passes NO `setIntervalFn`/`setTimeoutFn` → real timers in prod. NOT the injected `timeSource` the detector/prober run on. |
| **#2 Control-plane heartbeat failures** | constant only: `control-plane-constants.js:167` `LOCAL_HEARTBEAT_CONSECUTIVE_FAILURES: 'Control plane heartbeat failing repeatedly'` | — | — | **NO EMITTER.** `grep -rn` across `src/` finds the constant defined and never logged/emitted (only sibling `LOCAL_HEARTBEAT_FAILED`/`_RECOVERED` are equally unused). Dead constant. |
| **#3 Reconciler event-loop starvation** | `authoritative-node-evidence-reconciler.js:27` | — | — | **NO EMITTER.** Line 27 is a *comment* justifying `DEFAULT_REPAIR_BYPASS_FLOOR_MS` (the repair-burst rate-limit floor, `:29`). It is a P4 rate-limiter, not a self-disruption *detector*. There is no "starvation detected" event to wire. |

**Already-wired local-degradation inputs to the LHM (for contrast):**
- `recordProbeResult(nodeId, ok=false)` → `_applyHealthDelta(+1)` (`membership-swim-detector.js:257`), driven every prober cycle (`membership-swim-prober.js:342`).
- `recordMissedNack()` → `_applyHealthDelta(+1)` (`:340`), driven when no indirect helper responds — "our own indirect links are bad" (`membership-swim-prober.js:304-306`). This is the canonical Lifeguard §IV-A "I am degraded" signal and it is already live.
- `recordSelfSuspected(inc)` → `_applyHealthDelta(+1)` (`:320`).
- Decay: `recordProbeResult(ok=true)` → `_applyHealthDelta(-1)` (`:243`), every successful cycle.

**Recommended FINAL set to wire: just signal #1** (heartbeat consecutive
failures). #2 and #3 do not exist as emitters — wiring them would first require
*building* the emitter, which is out of scope for a "wire the existing signals"
increment and would be dishonest to bundle here. Note #1 is a level counter on a
wall-clock timer, forcing the bridge-design constraints in §2–§3.

---

## 2. Bridge design (no new cache, no new read path)

Three options weighed:

**(a) Push — emitter calls `detector.recordLocalDisruption()`.** Requires
threading the swim runtime/detector ref into `HeartbeatService`. Blocking
problems: (i) **construction order** — `membershipSwimRuntime` is built at
`control-plane-setup.js:357`, `heartbeatService` at `:419` (62 lines later), so
the heartbeat service cannot receive the runtime as a constructor param without
reordering; the runtime could receive a heartbeat getter but heartbeat doesn't
exist yet either. (ii) **Determinism break** — the heartbeat timer is wall-clock
(`heartbeat-service.js:50-55`), so a push mutates the LHM at points that do NOT
exist in the detector's documented replay sequence ("replays exactly … given an
ordered message/outcome sequence", `membership-swim-detector.js:12-17`). A DT
harness that feeds only probe outcomes would never see these mutations →
replay/parity broken. **Reject.**

**(b) Pull — the prober reads an already-available local-health snapshot each
deterministic tick and applies a delta.** The prober already reads injected
getters every cycle (`getMembers` at `prober.js:159`, `scaledProbeIntervalMs()`
at `:206`). Add a `getLocalDisruptionLevel` getter (same shape as `getMembers`,
defaulting to `() => 0`). Inside `_runProbeCycle` (deterministic tick,
`prober.js:320-344`), read the level and apply an **edge-triggered** delta via a
new detector method. All LHM mutation stays on the prober's deterministic
schedule; the value read is a plain integer snapshot (0 when heartbeat isn't
running in a unit harness → exact parity). **This is the determinism-safe
choice.**

**(c) Host the fold in `ControlPlaneReadinessService`.** Over-scoped for one
signal; the prober is the natural driver.

**Recommend (b), pull.** Concrete threading path with ZERO new cache and ZERO new
read path:

1. The getter closure reads the **already-existing** accessor
   `controlPlaneReadinessService.getHeartbeatPublicationDiagnostics()`
   (`control-plane-readiness-diagnostics-eligibility.js:139-150`, which reads
   `this.heartbeatService` — populated at `control-plane-setup.js:430`) and
   returns its `.consecutiveFailures` field (set at
   `heartbeat-service-publication-methods.js:512`, exposed frozen at `:546-548`).
   No new state is introduced; we reuse the diagnostics accessor already consumed
   by admin snapshot and write-health owner (`grep` shows 3 existing consumers).
2. At `control-plane-setup.js:357`, `controlPlaneReadinessService` is **already
   in scope** (created `:233-236`). Pass to `MembershipSwimRuntime`:
   ```
   getLocalDisruptionLevel: () =>
     controlPlaneReadinessService
       .getHeartbeatPublicationDiagnostics?.()?.consecutiveFailures ?? 0
   ```
   The closure is lazy — evaluated only at prober tick, long after
   `heartbeatService` is assigned to the readiness service (`:430`), so the
   construction-order gap is a non-issue for a pull getter (it IS fatal for a
   push param — another reason to reject (a)).
3. `MembershipSwimRuntime` forwards `getLocalDisruptionLevel` into
   `MembershipSwimProber` (mirror the existing `getMembers` forwarding,
   `runtime.js:43-44`). Default `() => 0` when absent (preserves every existing
   test + the FD unit harnesses, which never set it).
4. New detector method `recordLocalDisruptionEdge(level)` (or the prober tracks
   the last level and calls `_applyHealthDelta(+1)` once on a rising edge). Keep
   the edge logic in the detector so it is pure + unit-testable; the prober just
   forwards the current level each cycle.

Blast radius: 2 forwarding params (setup→runtime→prober), 1 pure detector
method, no change to `HeartbeatService`, no new cache, no new DB/RPC read.

---

## 3. Correctness + safety of feeding this into the LHM

**Direction — correct.** degraded local observer → `_applyHealthDelta(+1)` →
higher LHM → `scaledProbeIntervalMs`/`scaledProbeTimeoutMs = base*(LHM+1)`
(`:160-167`) → longer `_suspicionMinMs`/`_suspicionMaxMs` (`:180-188`, both
scale off `scaledProbeIntervalMs`) → later `suspicionDeadlineMs` → more tolerant
of peers, deferring to healthier observers. This is exactly Lifeguard §IV-A
("a node whose own health is suspect should be slower to accuse others").

**Double-count — the crux, and the real hazard.** `consecutiveFailures` is a
LEVEL, not an edge. If the prober applies `+1` **every tick while level > 0**,
then across a multi-second heartbeat outage the LHM is driven `+1` per prober
cycle and pegs at the saturating bound within a few ticks and STAYS there — the
classic "delta-per-tick on a persistent counter" amplification the memory
frontier repeatedly refutes (e.g. escalate-per-participant-failure `692c9dbb`,
per-transient-error `1ce80391`). **Mandatory: edge-trigger.** Apply `+1` exactly
once on the RISING edge (level crosses the warn threshold `HEARTBEAT_FAILURE_WARN_THRESHOLD=3`, `control-plane-constants.js:174`, i.e. transitions from
`<3` to `≥3`). Do NOT apply a delta on the falling edge — let the existing
probe-success decay path handle recovery (see below). The prober must remember
the previous observed level between cycles to detect the edge (a single integer
field on the prober, not a cache).

**Stuck-high — bounded, decay verified.** LHM decays ONLY via
`recordProbeResult(ok=true)` → `-1` (`:243`), driven every successful prober
cycle (`:342`). This path is untouched by the wiring, so as soon as any probe
succeeds the LHM decays — a node cannot get permanently stuck from a one-shot
edge bump. The saturating upper bound is `awarenessMax-1 = 7`
(`:154`, `SWIM_DETECTOR_DEFAULTS.awarenessMax=8` `:44`), so even pathological
input cannot run away. The existing detector test already proves both the
saturation ceiling (`membership-swim-detector.test.js:60`) and decay-to-0
(`:70`); a one-shot edge bump lives comfortably inside both invariants.

**Net:** with edge-trigger semantics the wiring is a bounded, self-decaying,
one-per-episode nudge. With level-delta it is unsafe. The design MUST be
edge-triggered or not shipped.

---

## 4. Does it actually help the MODE-A class? (honest)

**It does NOT fix MODE-A's root.** MODE-A (`a79b3728`) was
`isClusterMemberHealthy` (`control-plane-readiness-node-service-rows.js:462-515`)
failing a peer on a STALE INGESTED heartbeat despite live transport — a
**readiness/provisioning-eligibility** path. The LHM touches only **SWIM
suspicion timing** (probe cadence + suspicion timeout). The two live in different
layers; nothing in this wiring changes `isClusterMemberHealthy`.

**What it DOES buy:** during a local load/event-loop spike — the same class of
condition that triggered MODE-A ("node-0 saw peers 195s stale under load-peak
ingest lag") — a locally degraded observer slows its own probe cadence and
lengthens its suspicion timeouts, making it structurally LESS likely to raise
false `suspect`/`dead` SWIM verdicts against healthy peers while it is itself the
degraded party. It is the *systemic prophylactic form* of MODE-A's point-fix
(trust the peer when the observer is the impaired one).

**But scope it honestly, twice over:** (i) even within SWIM, a `suspect`/`dead`
verdict NEVER triggers a trim — consumption is asymmetric, `alive` only PROTECTS
(`membership-swim-detector.js:26-32`). So the LHM's practical reach is limited to
the SWIM-derived active set's confirmed-`dead` trims + the coordinator's
divergence emission, not to routing/provisioning eligibility. (ii) The specific
new signal (heartbeat WRITE failing ≥3× consecutively) is only weakly correlated
with "I am lagging on peer-heartbeat INGEST" — see §7. **Do not claim this fixes
or even measurably moves MODE-A.**

---

## 5. REUSED vs EXTENDED vs NEW

| Disposition | Item |
|---|---|
| **REUSED** | LHM counter + `_applyHealthDelta` saturating math (`detector.js:153-157`); probe-success decay path (`:243`); `scaledProbeInterval/Timeout` + suspicion-timeout scaling (`:160-199`); `getHeartbeatPublicationDiagnostics().consecutiveFailures` accessor (`readiness-diagnostics-eligibility.js:139`, `heartbeat...methods.js:546`); the prober's injected-getter pattern (`getMembers`, `prober.js:159`); `controlPlaneReadinessService` ref already in scope at `control-plane-setup.js:357`. |
| **EXTENDED** | `MembershipSwimProber` reads a new `getLocalDisruptionLevel` getter each `_runProbeCycle` (mirror of `getMembers`); `MembershipSwimRuntime` forwards it (mirror of `runtime.js:43-44`); `control-plane-setup.js:357` passes the closure. |
| **NEW** | One pure detector method (`recordLocalDisruptionEdge`) + one integer "last observed level" field on the prober for rising-edge detection; the getter closure. **No new cache, no new read path, no `HeartbeatService` change.** |

---

## 6. Red-on-revert test plan (`npm run dt:prove`)

Add to **`test/control-plane/membership-swim-detector.test.js`** (the pure-unit
home already asserting LHM behavior at `:51-70`, `:128-131`).

Test 1 (detector method, purest red-on-revert):
- Construct a detector at LHM 0 (`localHealthMultiplier() === 0`).
- Simulate a rising edge: `d.recordLocalDisruptionEdge(3)` (crossed threshold).
- **Assert `d.localHealthMultiplier() === 1`** — flips RED (stays 0) when the
  new method / its `_applyHealthDelta(+1)` call is reverted.
- Idempotency/no-double-count: call `recordLocalDisruptionEdge(4)` then `(5)`
  with no intervening drop-below-threshold and **assert LHM stays 1** (level
  climbing without re-crossing the edge adds nothing) — this assertion flips RED
  if someone reverts edge-semantics to level-delta.
- Decay still fires: `d.recordProbeResult('peer', true)` → **assert LHM back to
  0**.

Test 2 (prober integration, proves the wiring is load-bearing end-to-end):
- Build a `MembershipSwimProber` with `getLocalDisruptionLevel` returning a
  value that steps `0 → 4` between cycles and a transport whose direct+indirect
  probes SUCCEED (so `recordProbeResult(ok=true)` would otherwise pull LHM to 0).
- Run `probeOnce()` across the step; **assert `detector.localHealthMultiplier()`
  rose on the edge cycle** where, with the getter reverted to `() => 0`, it would
  have stayed flat at 0. This is the assertion that proves the *wiring* (not just
  the detector method) is load-bearing.

`npm run dt:prove -- --test test/control-plane/membership-swim-detector.test.js
--src src/control-plane/membership-swim-detector.js
src/control-plane/membership-swim-prober.js`.

---

## 7. Adversarial self-check (strongest case against shipping)

1. **The signal barely fires in the MODE-A window (strongest).** MODE-A's trigger
   is *ingest lag* — node-0 falling behind on INGESTING peers' heartbeats under
   load — not local heartbeat WRITE failure. Signal #1 only rises when *this
   node's own heartbeat write* fails ≥3 consecutive times
   (`recordFailure`, `heartbeat...methods.js:505`). Under event-loop starvation
   the local write is typically *delayed*, not *failing*; ≥3 consecutive hard
   failures is a stronger, rarer condition and is weakly correlated with "I'm
   lagging on ingest." So the one wireable signal targets a different failure
   mode than the one it is being sold to harden.

2. **The LHM is already self-aware via the RIGHT signals.** `recordMissedNack`
   (`prober.js:304-306`) and `recordProbeResult(ok=false)` (`:342`) are the
   canonical Lifeguard "my links/probes are degrading" inputs and are already
   live and already drive `_applyHealthDelta(+1)`. These capture local network
   degradation *more directly* than a heartbeat-write counter. The marginal
   information added by signal #1 over what's already wired is small.

3. **Two of three named signals don't exist as emitters** (§1): #2 is a dead
   constant, #3 is a comment on a rate-limiter. So the "wire 3 self-disruption
   signals, ~90% built" premise overstates what's available; the real increment
   is "wire 1 weakly-correlated signal."

4. **The payoff is capped by SWIM's asymmetric consumption** — `suspect`/`dead`
   never trims (`detector.js:26-32`), so even a correct LHM bump changes little
   in the consumers that mattered for MODE-A.

None of these make the wiring *unsafe* (edge-triggered, it's a bounded
self-decaying nudge), but together they make it **low-value** and at risk of
being mistaken for a MODE-A mitigation it is not.

---

## SHIP / NARROW / DON'T-SHIP recommendation

**NARROW, bordering on DON'T-SHIP.** If shipped, ship the minimum: wire ONLY
signal #1 (heartbeat consecutive failures) via the pull model (§2b) — a
`getLocalDisruptionLevel` getter read on the prober's deterministic tick, applied
**edge-triggered** (one `+1` on crossing `HEARTBEAT_FAILURE_WARN_THRESHOLD`,
never level-delta), reusing the existing
`controlPlaneReadinessService.getHeartbeatPublicationDiagnostics()` accessor —
with the red-on-revert unit tests in §6. Do NOT wire #2/#3 (they have no
emitter). Do NOT claim any MODE-A mitigation. Honestly, the adversarial case
(§7) is strong enough that the *defensible* call is **DON'T-SHIP now**: the LHM
is already fed by the two signals (`recordMissedNack`, failed-probe) that best
represent local degradation, the one net-new signal is weakly correlated with
the MODE-A trigger and reaches only SWIM's non-trimming verdict layer, and the
naive implementation reintroduces a known double-count pathology. Recommend
parking this bonus and directing the stage-2 effort at the higher-value P2
unification (roadmap items 1–2) and the P5 formation-blip grace, which
independently and directly touch the MODE-A provisioning half.

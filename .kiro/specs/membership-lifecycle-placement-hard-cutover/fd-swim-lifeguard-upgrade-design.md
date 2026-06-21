# Failure-detector protocol upgrade — SWIM + Lifeguard (cutover plan §5 step 3)

Status: **design + increment 1 landing** (2026-06-21). Decision made autonomously
per operator direction ("continue forward, go back to the papers + existing
implementations, rubberduck with subagents, gate when necessary"). Supersedes the
"naming/doc only" sub-option in `failure-detector-consolidation-scope.md` §2.

## Decision: adopt SWIM + Lifeguard semantics, in-tree

- **Protocol:** SWIM (Das–Gupta–Motivala, DSN 2002) failure detector +
  dissemination, hardened with **Lifeguard** (Dadgar–Phillips–Currey, arXiv
  1707.00788) local-health awareness. Adopt the *semantics* of
  `hashicorp/memberlist` (the canonical impl), implemented in-tree against this
  transport + deterministic substrate. Rejected: φ-accrual (does not address the
  dominant failure class — see below) and pure-naming (no convergence gain).
- **Agreement stays strong (Raft).** Plan §6 decision: the membership *agreement*
  layer remains consensus-installed (`control_plane_publications` + epoch). SWIM is
  the **failure-detector layer only**; it supplies per-node liveness verdicts that
  feed the existing view computation. A DB control plane needs strong, monotone
  views — gossip is for suspicion evidence, not for installing membership.

### Why Lifeguard is the right fit for OUR failure data

The rolling-restart blocker is dominated by a **rejoiner-under-load** issuing
false-positive removals: a just-restarted node, with event-loop starvation /
clock drift, suspects and trims healthy peers. Lifeguard's **Local Health
Multiplier (LHM)** is the precise countermeasure: a node that misses acks on its
*own* probes (or must refute suspicions about itself) drives its LHM up and scales
its own `probeInterval`/`probeTimeout` by `(LHM+1)` — so a degraded node probes
less aggressively and waits far longer before declaring anyone SUSPECT. It is
self-correcting (every successful probe is −1) and recovers automatically. The
complementary direction (healthy peers not killing the slow rejoiner) is covered
by LHA-Suspicion (start each suspicion at `Max`, collapse to `Min` only after K=3
*independent* confirmations) + the Buddy System (tell the suspected node first so
its refutation lands in time). Lifeguard Table IV: >50× fewer false positives;
both-parties-healthy FP class (our worst) ~1.9% of SWIM baseline.

## Mechanics (memberlist defaults; full spec in the session research log)

- **State machine** per remote member: `ALIVE → SUSPECT → DEAD`, keyed on global
  per-member **incarnation** numbers. Precedence: `Alive(i)` beats
  `Suspect(j)/Alive(j)` iff `i>j`; `Suspect(i)` beats `Suspect(j)/Alive(j)` iff
  `i≥j`; `Dead(i)` overrides any. Only the named member increments its own
  incarnation (refutation: gossip `Alive(inc+1)`).
- **LHM**: saturating counter `0..S-1`, `S=8`. Δ: successful probe −1; failed
  probe +1; refuting self +1; missed indirect nack +1. `scaled = base·(LHM+1)`.
- **LHA-Suspicion timeout**: `Min = SuspicionMult·log10(max(1,n))·probeInterval`
  (`SuspicionMult=4`), `Max = SuspicionMaxTimeoutMult·Min`
  (`SuspicionMaxTimeoutMult=6`); decay `Max → Min` via `log(C+1)/log(K+1)`,
  `K=3`, `C` = independent confirmations.
- **Probe loop** (deferred to a later increment): round-robin over a shuffled
  member list, direct `ping`→`ack`; on timeout, `ping-req` to `k=3` helpers;
  SUSPECT iff no direct/indirect ack within the period; nack at 80% of timeout.

## Integration surface (code-grounded; file:line in the session research log)

| Concern | Today | Plan |
|---|---|---|
| Evidence inputs | heartbeat rows (`last_heartbeat`/`ready_lease_expires_at`, 60s grace), readiness lanes, `connectedNodeIds` | SWIM consumes the same as evidence; its novel signal is the active probe verdict |
| Probe transport | direct `pingNode` PING/PONG + correlated SERVICE_MESSAGE/RESPONSE exist; **indirect ping-req missing** | build ping-req as a `${nodeId}/service/swim-relay` handler — no transport change |
| Determinism | `VirtualTimeSource` + `SeededRandomSource` + `resolveTimeSource/resolveRandomSource` (established ctor seam) | detector takes `{timeSource, randomSource}` — drop-in to the virtual network + PCT harness |
| Output seam | binary `isCanonicallyActiveNode` / readiness-eligibility inside `resolveProjectedActiveNodeSelection` (`active-node-projection.js:385/491`) | SWIM verdict supplies/overrides the liveness conjunct, behind a flag; candidate-derivation + agreement layer untouched |
| Divergence harness | `membership-owner-shadow.js` probe + `membership-owner-equivalence.test.js` (14 real converged fixtures) | reuse verbatim: emit SWIM verdict via existing divergence path; equivalence-test the new rule |
| Flag pattern | env const + `isXEnabled(env=process.env)`, default-off, `LAGRANGE_*` auto-forwarded to harness | add `LAGRANGE_MEMBERSHIP_SWIM_DETECTOR` |
| Suspicion-quorum safety | membership **freeze** clamp (`active-node-projection.js:675`) — refuse to trim a quorum under mass suspicion | this IS Lifeguard's suspicion-quorum property; re-home, keep |
| Legacy detector | **dormant** `src/node/failure-detector.js` (timeout suspect→fail, writes node status; exported+tested but NEVER instantiated in prod) | SWIM **supersedes** it (reuse config keys + test corpus); do not run both |

## Sequenced increments (each deterministic-first, flag-gated, gated at N≥8 when it changes behavior)

1. **Pure detector module (THIS increment, zero production rewiring).**
   `src/control-plane/membership-swim-detector.js`: the LHM + incarnation
   suspect→confirm state machine. Constructor `{timeSource, randomSource, config}`.
   Methods: `recordProbeResult(nodeId, ok)`, `recordSuspect(nodeId, from,
   incarnation)`, `recordAlive(nodeId, incarnation)`, `recordSelfSuspected(inc)`
   (→ bump + return new incarnation), `recordMissedNack()`, `tick(nowMs)`,
   `verdictByNodeId()`, `localHealthMultiplier()`, `scaledProbeIntervalMs()`,
   `scaledProbeTimeoutMs()`. No transport, no DB writes — fed outcomes by the
   caller. Default-off flag `LAGRANGE_MEMBERSHIP_SWIM_DETECTOR`. Unit-tested on
   `VirtualTimeSource` + `SeededRandomSource`.
2. **SWIM active-set rule + equivalence (DONE).** `computeSwimActiveMemberSet`
   (the FD-layer output contract: freeze→retain baseline; else trim only on a
   CONFIRMED `dead` verdict — `suspect` is not a trim; minus draining/retired) +
   `test/control-plane/membership-swim-equivalence.test.js` driving the REAL
   detector on the virtual clock over the 14 converged fixtures (incl.
   freeze+unreachable: the freeze clamp overrides even a CONFIRMED-dead verdict).
   The *production* divergence EMISSION (compute the SWIM set next to
   `computeShadowActiveMemberSet` in `membership-publication-candidate-derivation.js`
   and emit via `buildMembershipOwnerDivergence`) folds into increment 3 — it only
   carries signal once the probe loop feeds real outcomes; emitting an unprobed
   verdict now would be a meaningless diff.
3. **Probe loop + indirect ping-req transport.**
   - **3a (DONE).** `membership-swim-prober.js` — `MembershipSwimProber` (round-robin
     over a seeded shuffle, direct→indirect fallback, Lifeguard-dynamic interval,
     missed-nack signalling) + `buildSwimRelayHandler` (the indirect ping-req
     responder). Transport is an INJECTED interface ({directProbe, indirectProbe})
     so the orchestration is fully deterministic/unit-tested (26 tests) independent
     of the messageRouter envelope; adversarially reviewed, two real bugs fixed
     (throwing-transport no longer erases a probe via allSettled + safe direct
     probe; stop→start no longer leaks a timer via a generation token).
   - **3c-i (DONE).** Production transport ADAPTER `buildSwimMessageRouterTransport`
     binding the prober interface to `messageRouter.pingNode` /
     `deliver(${nodeId}/service/swim-relay)`. `deliver` resolves (never throws) on
     transport faults, so the mapping is explicit: acked+boolean `reachable`→that
     bool; no_handler/timeout/closed/throw→null. Validated against REAL in-process
     MessageRouters (`membership-swim-transport-adapter.test.js`, 7/7): direct
     reachable/partitioned, indirect via relay, and the no-relay-helper→null case —
     pinning the load-bearing envelope mapping (the biggest 3c risk) before any
     lifecycle wiring.
   - **3c-ii (DONE).** `MembershipSwimRuntime` (`membership-swim-runtime.js`) composes
     detector+prober+transport+relay into one lifecycle object, end-to-end validated
     on a 3-node in-process harness (`membership-swim-runtime.test.js`: partition →
     suspect → dead → trim; freeze retains). Coordinator-side divergence emission
     (3c-ii-C): the pure derivation exposes `membershipSwimInputs`; the coordinator
     emits a sibling `MEMBERSHIP_SWIM_DIVERGENCE` after the shadow one (unit-tested
     with a fake runtime). Lifecycle wiring (3c-ii-B): `control-plane-setup` builds
     the runtime flag-gated (getMembers = `resolvePublishedActiveNodeIds` over the
     published rows), passes it to the coordinator, starts it after
     `startOwnerMembershipDriver`; `stopOwnerMembershipDriver` stops it; prober timer
     unref'd. Default path byte-identical (null-guarded); bootstrap smoke 129/129,
     SWIM suite 294/294.
4. **Consume the verdict (behavior change, operator-gated, N≥8).** Inside
   `isCanonicallyActiveNode`, let the SWIM verdict supply the liveness conjunct;
   re-home the freeze gate as the named suspicion-quorum rule. Divergence-probed,
   N≥8 gate validated.
5. **Retire the dormant `failure-detector.js`** once SWIM owns suspicion.

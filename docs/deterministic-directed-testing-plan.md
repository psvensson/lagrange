# Deterministic & Directed Testing Strategy (DT1–DT8)

Status: PARTIALLY IMPLEMENTED + VERIFIED (2026-06-16). The cheap, verifiable tier is
built and tested; DT4 steps 1–3 (the TimeSource seam, the partial-seam collapses, the
opt-in Raft election seam, and the in-process freeze→leadership scenario) and DT5 steps 1–2
(the seeded RandomSource seam + jitter-site coverage, and the PCT depth-bounded schedule
search over the virtual clock) and the in-process L1→TT
freeze→leadership→publication-stall scenario are landed; DT6 STEP 1 (the multi-node
lift — per-node virtual clocks + a virtual network with a PCT-reorderable cross-node
delivery seam), DT6 STEP 2 (the first REAL state machine — a `@markwylde/liferaft` node
hosted on the network via a per-node TimeSource adapter, its real election timer PCT-raced
against cross-node heartbeats), DT6 STEP 3 (REAL multi-node vote/append RPCs over the
network — a real 3-node election + a PCT-raced contested election that flips which real
candidate wins), DT6 STEP 4 (a real LEADERSHIP MIGRATION + fail-back end-to-end — partition
the elected leader, a follower wins a higher term, the old leader steps down on heal), and DT6
STEP 5 (the first REAL CONTROL-PLANE subsystem — the real owner-membership publication driver
hosted per node, gated on live raft leadership, so a real migration drives a real owner handoff),
DT6 STEP 6 (the CL-039 publication FAIL-BACK with the REAL deficit decision + REAL published row),
and DT6 STEP 7 (the publication commit made a REAL QUORUM-GATED raft-log commit via `raft.command`
— a partitioned minority owner genuinely cannot commit; step 6's modelled commit removed) are
landed; DT6 (full multi-node DST) proceeds as a gated program (see below).
Author: analysis of the convergence loop + harness, 2026-06-16.

> **MOTIVE (reframed 2026-07-01) — this program exists to FIND BUGS, not to
> reproduce a scenario's pass-rate.** The purpose of the deterministic tier is to
> make *message-ordering / interleaving safety bugs* deterministically
> reproducible and minimizable (a failing seed → the smallest interleaving that
> breaks an invariant), so a fix is causally tied to a real defect. It is **NOT**
> a tool for reproducing the rolling-restart Docker PASS/FAIL rate. That rate is
> an irreducibly-statistical **CPU-latency tail** (quest
> `rolling-restart-run4-passfail-discriminator-census`, SOLVED `no-separator`):
> the virtual clock/network determinizes message and timer ordering, **not CPU
> contention**, so virtualizing the scenario would *delete* the very race and any
> "make the seeded sweep bracket the ~41% Docker rate" fidelity goal is
> curve-fitting a modeled CPU cost to the answer. Do not scope a DT quest around
> scenario-rate fidelity. Legitimate DT `doneWhen`s are of the form "this seed
> deterministically reproduces safety-invariant breach X, and red-on-revert
> proves the fix" — never "the sweep pass-rate equals the Docker gate." Rolling-
> restart convergence is closed on the statistical Wilson-95 bar
> (`docs/convergence-donewhen-metric.md` §5/§7), which is the correct primary
> posture for a latency-tail race — not a fallback after determinization.

> **Implementation status (2026-06-16).**
> - **DT7 (model-check the design class) — DONE.** `models/leadership-failback/LeadershipFailback.tla`
>   (+ `_bug.cfg`/`_fixed.cfg`) models CL-039: TLC shows the lost-failback as a
>   counterexample under the bug config and proves convergence under the fix. Wired into
>   `scripts/model-tlc.js` (all 11 configs `met=true`), `model:check` added to `test:ci`,
>   mapped in `models/CL-INDEX.md`.
> - **DT1 primitive — DONE.** `test/distributed/harness/wait-for-state.js` (`pollUntil` +
>   `waitForState`) + cluster method + unit tests. (The leadership-location snapshot field
>   and the full CL-039 biasing repro are deferred — they touch the convergence-critical
>   `src/` control-snapshot path and need the gate loop.)
> - **DT2 — module DONE, live-wiring deferred.** `test/distributed/harness/in-run-invariant-monitor.js`
>   (samples `evaluateInvariants` + the gap-watchdog into a one-run verdict) + unit tests.
>   Wiring it into the live convergence run loop is left to a gate-validated change (the
>   memories warn against editing the live run path mid-convergence).
> - **DT3 — DONE.** `test/rebalancer/operation-lifecycle-fold.property.test.js` — a
>   fast-check interleaving property over the pure `advanceOperationLifecycle` kernel
>   (monotonic sequence, terminal-absorbing, crash-free), seeded from the real
>   `OPERATION_LIFECYCLE_STATE.PLANNED` and guarded by a non-vacuity check (the fold
>   provably reaches terminal states — ~93% of random folds — so the absorbing property
>   is actually exercised; an earlier draft seeded a non-existent state and was vacuous).
> - **DT8 — DONE.** Gate-demotion rule added to `closure-grammar.md`.
> - **DT4 — STEPS 1–3 LANDED (2026-06-16). The virtual-clock seam is in and reaches the
>   timing-race mechanism in-process.**
>   - **Step 1 — the `TimeSource` seam.** `src/time/time-source.js`: `RealTimeSource` (the
>     default — byte-for-byte the platform globals `Date.now`/`setTimeout`/`clearTimeout`/
>     `setInterval`/`clearInterval`), `VirtualTimeSource` (deterministic fake clock advanced
>     with `advance(ms)`; timers fire in `(dueAt, scheduling-order)` order, intervals
>     reschedule, zero-interval clamps, runaway re-arm fails loud), `resolveTimeSource(options)`.
>   - **Step 1b — collapse the partial seams.** `control-plane-readiness-participation-base.js`
>     (`now`/`setTimeoutFn`/`clearTimeoutFn`), `membership-publication-coordinator-reconcile.js`
>     (owner-driver `setInterval` + matching clear in stop), `lease-service.js`
>     (`now`/`setIntervalFn`/`clearIntervalFn`), and `hlc-clock-service.js` (physical clock)
>     all thread onto a resolved TimeSource. Byte-identical by default; explicit per-fn options
>     keep precedence (readiness 834 / membership-publication 401 / lease+hlc 163 green).
>   - **Step 2 — the hard Raft election-timer seam.** Base `@markwylde/liferaft` schedules its
>     heartbeat + randomized election timeout through `raft.timers = new Tick(raft)` (tick-tock,
>     native setTimeout). `src/raft/virtual-tick.js` is a tick-tock-faithful `VirtualTick`
>     scheduling on a TimeSource; `src/raft/liferaft.js` swaps it in OPT-IN (only when
>     `options.timeSource` is given — clears the natively-armed timer, swaps, re-arms on the
>     virtual clock). Production passes no timeSource → dead branch → byte-identical (liferaft +
>     election + message-group raft 140 green). Subagent-verified TRUSTED (empirically: no native
>     timer leak/fire on wall time). **Because the seam is opt-in and dead in production, no
>     docker equivalence check is needed for production SAFETY**; an equivalence gate would only
>     be needed to certify virtual-path FIDELITY before trusting a DT5 verdict at scale.
>   - **Step 3 — the in-process freeze→leadership scenario.**
>     `test/convergence/dt4-freeze-leadership-scenario.test.js` drives a single VirtualTimeSource
>     against a real LifeRaft node and reproduces CL-039's L1→L2 deterministically: heartbeats
>     within the window HOLD leadership; a freeze past the election timeout SHEDS it at the exact
>     instant; identical across runs. Sub-second, no docker.
> - **DT5 — STEPS 1–2 LANDED (2026-06-16).**
>   - **Step 1 — the seeded `RandomSource` seam + jitter-site coverage.**
>     `src/random/random-source.js`: `RealRandomSource` (the default — `Math.random`, byte-for-byte
>     unchanged), `SeededRandomSource` (mulberry32, same seed -> same stream), `resolveRandomSource`.
>     Threaded OPT-IN (no production path passes a `randomSource`, so all sites stay `Math.random`):
>     the raft election `timeout()` jitter (`src/raft/liferaft.js` override — same formula, only the
>     source differs; removes the freeze scenario's `min==max` workaround), the message-retry backoff
>     jitter, and the unified-rebalancer scheduler / planning-gate staggering jitter. Tests:
>     `test/random/random-source.test.js`, `test/raft/election-jitter-seed.test.js`,
>     `test/random/dt5-jitter-seam.test.js` (same seed -> identical streams; defaults unchanged).
>   - **Step 2 — the PCT depth-bounded schedule search.** `src/time/pct-scheduler.js`: a `PctScheduler`
>     (Burckhardt et al. PLDI'10, the Coyote/P# formulation) that controls the one degree of freedom
>     the time+random seams leave open — the ORDER in which timers due at the SAME virtual instant
>     fire (cross-instant order is real causality, governed by the seeded delays, and is never
>     reordered). Each task (a `keyOf`-grouped chain of timers) gets a random initial priority; for
>     bug depth d it inserts d-1 priority-change points at seeded steps; a change point demotes the
>     scheduled task into a low band so the search can delay one task ACROSS another (the move pure
>     random priorities cannot force). `src/time/time-source.js` gains an OPT-IN `options.scheduler`
>     seam (`_pickDueTimer` reorders only the co-due set; absent it is byte-identical to the old
>     `(dueAt, seq)` order — the unchanged 12-subtest `time-source.test.js` still passes).
>     `test/distributed/harness/pct-search.js` iterates seeds (`exploreWithPct`) and replays a failing
>     seed (`runPctSeed`); the whole run is a pure function of the seed. **GUARD MET:** a known
>     depth-2 race (`test/convergence/dt5-pct-search.test.js`) — two producer/consumer chains where
>     corruption needs x2 delayed past y2 — is UNREACHABLE at depth 1 (independently verified: 0
>     corruptions / 5000 seeds) and is FOUND at depth 2 within a 100-seed budget, then replays the
>     identical schedule. The PCT lower bound 1/(n·stepBudget^(d-1)) = 1/8 (n=2, budget=4, d=2) is
>     empirically tight (hit rate 0.1264 / 5000 seeds). Subagent-verified TRUSTED (determinism,
>     default byte-identity, causality, depth-2 claim, the bound, and edge cases all confirmed).
>     Unit contract: `test/time/pct-scheduler.test.js`.
>   - **Step 2b — the PCT witness minimizer (`minimizePctDepth`).** The unfulfilled half of the
>     plan's DT5 step-3 clause ("record the seed for exact replay + minimize"):
>     `minimizeDeterministicTrace` delta-debugs a node-command log and does NOT fit the PCT search,
>     whose witness is `(seed, depth, change-points)`. The PCT-native analog is DEPTH minimization —
>     because a depth-d schedule carries exactly d-1 change points, the smallest depth that still
>     reproduces is the smallest witness, and it is PCT's headline diagnostic: the bug's TRUE
>     ordering depth (how many independent ordering constraints the race needs), exactly what
>     Coyote/P# report. `minimizePctDepth` (in `pct-search.js`) searches depth ascending and returns
>     the first reproducing depth + its minimal-seed witness, plus a `notReproducedBelow` list —
>     named to keep the "absence proves nothing" line: a non-finding depth is BOUNDED negative
>     evidence within the seed budget, NOT a proof of impossibility (structural unreachability, like
>     the guard's serialized chains, is a separate argument). The guard asserts the synthetic race's
>     true depth is exactly 2 (`notReproducedBelow` = [1]) and exercises the not-found path.
>     Subagent-verified TRUSTED (first-found-return correctness, witness minimality, honest wording,
>     determinism, edge cases, and reuse of `exploreWithPct` all confirmed; "minimal" correctly
>     scoped to `[minDepth, maxDepth]`).
>   **REMAINING toward DT6 — STEP 1 LANDED (2026-06-16).** The per-instant scheduler is
>   lifted to multi-node: `test/distributed/harness/virtual-network.js` (`createVirtualNetwork`)
>   is N nodes on one global virtual clock + a virtual network, each node with its own logical
>   clock (`nodeNow` — an active node tracks global time, a stopped node's clock freezes at its
>   last activity, the CL-039 freeze substrate). One global event queue holds both in-flight
>   MESSAGES (from→to, due at send-time + delay) and per-node TIMERS; `dueAt` is causality and is
>   never reordered across instants, while the co-due set (events at the same earliest instant —
>   the genuine cross-node delivery race) is handed to the SAME injected PctScheduler.pick the
>   single-node VirtualTimeSource uses. With no scheduler the order is byte-identical (dueAt, seq);
>   nothing in src/ constructs a VirtualNetwork (inert, a harness substrate like
>   deterministic-simulator.js). Partition/heal + kill/start drop messages at delivery. **GUARD MET:**
>   `test/convergence/dt6-network-pct-search.test.js` — a coordinator-window race across 3 nodes
>   (sender A "open"→C self-"close" chain, sender B "probe") is UNREACHABLE at depth 1
>   (independently brute-verified: 0 corruptions / 5000 seeds) and FOUND at depth 2 within a
>   100-seed budget (floor 1/(2·4)=1/8), replays the identical cross-node interleaving, and
>   `minimizePctDepth` reports the true depth = 2. The DT5 search layer (exploreWithPct /
>   runPctSeed / minimizePctDepth) is REUSED UNCHANGED — the scenario builds a VirtualNetwork
>   wired to the scheduler the search injects. Subagent-verified TRUSTED (determinism, default
>   byte-identity, cross-instant causality, the depth-1-unreachable/depth-2-reachable claim, and
>   edge cases — self-send, mid-run co-due append, partition-after-send, frozen-clock, handler-throw
>   — all confirmed; a foreign-event membership guard was added to harden `pickNext`).
>   Unit contract: `test/distributed/harness/__tests__/virtual-network.test.js`.
> - **DT6 — STEP 2 LANDED (2026-06-16). The first REAL state machine runs on the network.**
>   Step 1's guard drove SYNTHETIC chains; step 2 hosts a REAL `@markwylde/liferaft` node ON the
>   VirtualNetwork. The bridge is `net.networkTimeSource(nodeId)` — a per-node DT4 `TimeSource`
>   (now/setTimeout/clearTimeout/setInterval/clearInterval) whose timers are scheduled as
>   node-owned events on the SAME global queue as cross-node messages (interval re-arm + the 0ms
>   clamp + cancel-from-callback all mirror VirtualTimeSource; delays floor to whole ms, the
>   network's own convention — byte-identical for the integer-ms durations liferaft routes through
>   `ms(...)`). So the node's REAL randomized election timer (the DT4 raft seam, a `VirtualTick`)
>   and message delivery share ONE event timeline and ONE drain loop, and the SAME injected
>   PctScheduler can reorder a co-due election timer against a co-due heartbeat message. A new
>   `run({untilMs})` BOUNDED drain (advance to untilMs, fire only events due by then) is required
>   to host a machine that arms repeating timers — draining to idle would never terminate; it also
>   stops the post-promotion candidate/leader machinery so the guard observes the L1->L2 shed
>   instant exactly as the single-clock DT4 scenario does. **GUARD MET:**
>   `test/convergence/dt6-real-raft-network.test.js` — heartbeat MESSAGES delivered within the
>   election window HOLD the real node's leadership; a partition drops them so the REAL election
>   timer fires through the network drain and the node promotes FOLLOWER->CANDIDATE (CL-039 L1->L2,
>   deterministic across runs); and `exploreWithPct`/`runPctSeed`/`minimizePctDepth` (REUSED
>   UNCHANGED) over a co-due heartbeat-vs-election instant FLIP the real node's leadership — a
>   genuine depth-1 cross-node delivery race (census: 51 shed / 49 hold over 100 seeds, both
>   orders reachable), replayed identically from its seed. Fidelity scope (honest): the election
>   timer, its firing, and the promotion are real liferaft; "leader contact" is a bare heartbeat
>   MESSAGE that calls the real `node.heartbeat(window)` to re-arm (the same faithful abstraction
>   the DT4 freeze scenario used), NOT a full AppendEntries packet with term/quorum bookkeeping —
>   wiring two real raft nodes' vote/append RPCs over the network is step 3. Subagent-verified
>   TRUSTED-WITH-CAVEATS (default byte-identity, src isolation, adapter<->VirtualTimeSource
>   semantics, the real-timer/real-promotion faithfulness, the ~50/50 reorderability, determinism,
>   and no native-timer leak / no unhandled rejection across the 100-seed search all confirmed; the
>   two caveats — the fractional-ms floor and a post-shed `end()` teardown race — were fixed before
>   landing). Unit contract: the adapter + bounded-drain cases added to
>   `test/distributed/harness/__tests__/virtual-network.test.js`.
> - **DT6 — STEP 3 LANDED (2026-06-16). Two+ REAL raft nodes' vote/append RPCs over the network.**
>   Step 2 hosted ONE real liferaft node and modelled "leader contact" as a bare heartbeat
>   message; step 3 wires the ACTUAL liferaft transport so a real MULTI-NODE election runs
>   end-to-end over the seeded network. `test/distributed/harness/raft-network-host.js`
>   (`connectRaftCluster`) hosts a cluster of real `@markwylde/liferaft` nodes on a VirtualNetwork:
>   each node's outbound packet travels as a network message and its real `on('data')` handler
>   processes the inbound ones, with request/reply correlation matching liferaft's
>   `write(packet, written)` contract (a `raftReq` carries the packet + a `reqId`; the receiver
>   feeds it to the real handler and routes the handler's reply back as a correlated `raftReply`
>   that fires the original `written` callback — an empty liferaft reply carries `null` and
>   re-emits nothing, exactly as a real transport). Real liferaft handlers are async, so an
>   election completes across MICROTASKS: `driveNetwork` (bounded `run({untilMs})` +
>   `flushMicrotasks`) is the async analog of draining to idle (the synchronous `exploreWithPct`
>   search layer is therefore NOT reused here — the same `PctScheduler` + `SeededRandomSource` are
>   driven directly). Clusters are ODD-sized (canonical raft — liferaft `majority()` =
>   `floor(N/2)+1`, so N=3 needs 2 votes; an even cluster is legal but tolerates no more failures
>   than the next-lower odd). **GUARD MET:** `test/convergence/dt6-raft-election-network.test.js` —
>   a real 3-node election completes over the network (a candidate reaches a real majority and
>   becomes LEADER; followers learn the leader via real append RPCs; real `raftReq`/`raftReply`
>   packets are delivered over the wire); and a PCT-RACED CONTESTED election where two real
>   candidates stand at the same term and the decisive follower F grants its single real vote to
>   whichever vote packet the seeded `PctScheduler` delivers FIRST — so which REAL node wins is a
>   function of the seed (census 29/21 over 50 seeds, both candidates winnable; delivery-order ⇒
>   winner in 30/30; no scheduler ⇒ fixed lowest-seq winner), replayed identically per seed.
>   Subagent-verified TRUSTED (real-logic-decided not staged — the no-op `write` sink is never
>   invoked on the election path; correct majority/quorum + no split-brain; genuine both-ways race;
>   determinism — `Math.random` neutralized by `election min==max`, `+new Date()` feeds only the
>   diagnostic `raft.latency`; no leak/hang/unhandled-rejection across the 50-election census).
> - **DT6 — STEP 4 LANDED (2026-06-16). A real LEADERSHIP MIGRATION + fail-back, end-to-end.**
>   The CL-039 mechanism class — leadership migrating off a leader that stops being reachable, then
>   re-stabilizing — reproduced deterministically over the network at the consensus layer.
>   `test/convergence/dt6-leadership-migration-network.test.js`, three real liferaft nodes
>   (`connectRaftCluster`, step 3's transport) with uniform real election windows (100–200ms),
>   a 30ms heartbeat, and a per-node `SeededRandomSource` (DT5 jitter seam) for election-timeout
>   symmetry-breaking: **Phase A** they elect a leader NATURALLY (the shortest seeded timeout wins,
>   real vote RPCs); **Phase B** PARTITION the elected leader from the other two — they stop hearing
>   its heartbeats, a remaining node's real election timer fires `promote()` and it wins a STRICTLY
>   HIGHER term (real migration: leadership leaves the unreachable node, CL-039 L1→L2); **Phase C**
>   HEAL — the old leader hears the new leader's higher-term append and steps down to FOLLOWER (raft
>   §5.1), leaving exactly one stable leader (the fail-back). Every transition is real liferaft over
>   real network messages; the run is a pure function of the seed, replays identically, and the
>   winner varies with the seed. Subagent-verified TRUSTED — **61/61 seeds migrate cleanly to a
>   higher term AND fail back to exactly one stable leader**; the no-op `write` sink is invoked 0
>   times (RPCs really traverse the network — 56 partition-dropped packets observed); the transient
>   two-leader window during heal is correct raft, and the final single-leader state is stable to
>   4000ms; determinism 20×-identical per seed (the seeded `randomSource` override drives all three
>   nodes' timeouts; the base constructor's 3 unseeded `Math.random` calls land on the native Tick
>   that is immediately cleared + re-armed seeded — provably inert; `+new Date()` feeds only
>   `raft.latency`); no leak/hang/unhandled-rejection. HONEST SCOPE: this is the RAFT-LAYER mechanism
>   CL-039 is an instance of; CL-039's actual bug lived in the repo's control-plane leadership layer
>   ABOVE raft — hosting that layer on the network is the remaining whole-system DST.
> - **DT6 — STEP 5 LANDED (2026-06-16). The first REAL CONTROL-PLANE subsystem on the cluster —
>   a real migration drives a real owner handoff.** Steps 2–4 built the consensus layer; step 5
>   closes the loop to the layer where CL-039 actually lived. `test/convergence/
>   dt6-control-plane-migration-network.test.js` hosts the REAL owner-membership publication driver
>   (`MembershipPublicationCoordinatorReconcile`) on EVERY node of the real raft cluster, each gated
>   on THAT node's live raft leadership through the PRODUCTION Tier-0 path
>   (`resolveControlPlanePublicationsLeadership` → `cdcIntegrationService.canWriteSystemTableLocally`,
>   with the `systemTableCache` tiers forced to miss), its driver interval running on the node's
>   `networkTimeSource`. It is the multi-node, REAL-migration-driven generalisation of the DT4
>   full-chain scenario (which composed the same real driver with ONE raft node on ONE clock and
>   FAKED the leadership loss with `change({state})`). A per-node `gatePasses` counts driver ticks
>   that pass the leadership gate and reach the publish path — the "this node is acting as the
>   publication owner" signal. **GUARD MET:** Phase A — after a real election the owner gate settles
>   on exactly the elected leader (followers defer, gatePasses 0); Phase B — partition the leader →
>   real migration → the new leader becomes the owner AND the isolated old leader keeps acting as
>   owner on its side (the genuine dual-owner hazard a partition creates — real raft does not
>   self-demote); Phase C — heal → the old leader hears the higher term, steps down, its gate closes
>   (gatePasses frozen), and exactly the migrated leader remains the sole stable owner (the
>   control-plane fail-back). Subagent-verified TRUSTED — over a 41-seed census EVERY seed: only the
>   elected leader owns after election, the migrated leader owns + old-leader-grows after partition,
>   and exactly the migrated leader still owns after heal; `gatePasses` incremented while
>   `raft.state !== LEADER` exactly 0 times (the gate is genuinely on raft); 25×-identical per seed;
>   no native-timer leak / no unhandled rejection. HONEST SCOPE (unchanged from DT4 full-chain): it
>   observes the owner LEADERSHIP GATE (which node acts as owner over time), not a materialised
>   published epoch; the publish internals downstream of the gate are out of scope (their own tests).
> - **DT6 — STEP 6 LANDED (2026-06-16). The CL-039 publication FAIL-BACK, with the REAL decision +
>   REAL published row.** Step 5 observed only the owner GATE; step 6 drives the REAL publication
>   body and materialises a REAL published epoch. `test/convergence/
>   dt6-publication-failback-network.test.js`: each node's real owner driver is fed a real planning
>   snapshot backed by a SHARED published-row store; the DRIVE-vs-SKIP outcome is the REAL deficit
>   computation (`driveOwnerMembershipReconcile` → `buildPublicationActiveGateHandoffContract`, real
>   `missingPublishedCount`), and a deficit materialises a REAL published row
>   (`buildMembershipPublicationRow`). **GUARD MET:** Phase A — the elected leader runs the real
>   deficit decision and publishes the full membership at its term (epoch = its raft term;
>   followers defer); Phase B — partition the leader → migration → the NEW leader sees the store as
>   stale-for-its-term, runs the real deficit computation, and RE-PUBLISHES at its higher term (the
>   CL-039 fail-back the real bug missed), while the partitioned old leader keeps driving but its
>   stale-term writes are rejected (the stuck isolated owner that cannot commit); Phase C — heal →
>   the old leader steps down, the migrated epoch stays stable, no split-brain publisher.
>   Subagent-verified TRUSTED-WITH-CAVEATS — over a 41-seed census EVERY seed: phase A commits at
>   `termA` with the full set, `termB > termA` with the new leader re-publishing, the old leader has
>   rejected stale writes, and heal leaves `epoch == termB`; the deficit DECISION and published ROW
>   are confirmed REAL (a converged snapshot yields a real NO_DEFICIT skip; `store.lastRow` is real
>   kernel output); deterministic, no leak/unhandled-rejection. CAVEAT (item 4): the term-gated
>   store is LOAD-BEARING for raft commit safety (term-monotonic single-writer), not mere transport,
>   so the new leader's re-publish is modelled as GUARANTEED to commit — the test proves the new
>   owner RE-DETECTS the deficit and re-drives (the exact CL-039 gap) but NOT that the re-publish
>   reaches a real quorum.
> - **DT6 — STEP 7 LANDED (2026-06-16). The publication commit is now a REAL QUORUM-GATED raft
>   commit — step 6's modelled commit removed.** `test/convergence/
>   dt6-publication-quorum-failback-network.test.js`: each node is a real LifeRaft on the REAL log
>   (`InMemoryLogAdapter` as the `Log` option), and the real owner driver's real deficit decision
>   publishes by committing a REAL row through the REAL raft log via `raft.command()` — which
>   replicates over the network and commits ONLY on a real majority. So a partitioned (minority)
>   owner genuinely cannot commit (its append never reaches a quorum), not because a term comparison
>   says so. **GUARD MET:** Phase A — the elected leader commits membership v1 cluster-wide via real
>   replication; Phase B — a required-version bump (a membership change) + partition the leader → the
>   NEW leader re-publishes v2 and it COMMITS via real quorum (the fail-back), while the partitioned
>   old leader issues its v2 `raft.command` but its committed index stays frozen at v1 (no majority —
>   proven by instrumentation: a leader cut off from both peers appends but never advances
>   `committedIndex`); Phase C — heal → the old leader steps down and the published VERSION converges
>   to v2 cluster-wide. Subagent-verified TRUSTED-WITH-CAVEATS — over a 41-seed census EVERY seed:
>   v1 commits cluster-wide, the new leader commits v2 while the partitioned old leader stays at v1,
>   and all converge to v2; the quorum gate is confirmed REAL raft replication; the deficit DECISION
>   + ROW remain real; deterministic, no leak. FINDING (documented, not asserted-away): at the raft
>   LOG-ENTRY level the heal does NOT cleanly reconcile — the healed old leader stale-commits its OWN
>   v2 entry (its publisher/term) at the same index where the cluster committed the new leader's
>   entry; the published VERSION converges but the committed ROW PROVENANCE diverges. That is a
>   PRE-EXISTING `@markwylde/liferaft` + `InMemoryLogAdapter` log-safety gap (append catch-up commits
>   a follower's own same-index entry without a term/command match check), NOT introduced by this
>   step — the guard asserts version convergence, not committed-command equality, and the gap is
>   flagged for a separate closure-ledger entry.
>   **REMAINING toward full DT6:** host the OTHER real control-plane subsystems (readiness /
>   rebalancer / the membership-lifecycle + placement controllers) alongside raft on the
>   VirtualNetwork and drive the REAL persistence/CDC/ack (not the required-version stand-in), so a
>   seed reproduces the control-plane CL-039 fail-back end-to-end with the real publication pipeline —
>   the north-star whole-system DST.
> - **Full freeze→leadership→publication-stall scenario (L1→TT) — LANDED (2026-06-16).**
>   `test/convergence/dt4-full-chain-scenario.test.js` composes the REAL owner-membership driver
>   with a real LifeRaft node on one VirtualTimeSource: the leadership signal is the seed's live
>   raft state read through the production Tier-0 path
>   (`resolveControlPlanePublicationsLeadership` → `cdcIntegrationService.canWriteSystemTableLocally`),
>   and the real `driveOwnerMembershipReconcile` runs on the same clock via its seamed interval.
>   While the seed holds publications leadership the driver passes the gate and proceeds to publish;
>   once leadership leaves the seed the driver defers at the gate every tick and never reaches
>   publish — the stuck-OPEN stall (TT). Honest scope: the L1→L2 freeze→shed is proven by the
>   companion election-timer scenario and modeled here via `change({state})`; the test observes the
>   leadership GATE (real code), not a materialized published epoch. Subagent-reviewed
>   FAITHFUL-WITH-CAVEATS. Remaining toward a higher-fidelity end-to-end: a real 2-node election
>   across two virtual clocks + driving the actual publish/upsert (L4) internals.
> - **DT6 — STEPS 1–7 LANDED, full DST DEFERRED (north star).** The multi-node-isolation harness
>   (per-node virtual clocks + a virtual network with a PCT-reorderable cross-node delivery seam)
>   is built and guarded (step 1); the first REAL state machine — a `@markwylde/liferaft` node —
>   runs ON it via a per-node TimeSource adapter (`networkTimeSource`) + a bounded drain
>   (`run({untilMs})`), its real election timer PCT-raced against cross-node heartbeats (step 2);
>   REAL multi-node vote/append RPCs flow over the network (`connectRaftCluster`), so a real 3-node
>   election completes and a PCT-raced contested election flips which real candidate wins (step 3);
>   a real LEADERSHIP MIGRATION + raft §5.1 fail-back runs end-to-end from a seed — partition the
>   elected leader, a follower wins a higher term, the old leader steps down on heal (step 4); and the
>   first REAL CONTROL-PLANE subsystem — the real owner-membership publication driver — is hosted per
>   node, gated on live raft leadership through the production Tier-0 path, so a real migration drives
>   a real owner handoff (single owner → dual-owner-while-partitioned → single stable owner on heal)
>   (step 5); and the CL-039 publication FAIL-BACK runs end-to-end with the REAL deficit decision +
>   REAL published-row materialisation — the migrated leader re-detects the stale epoch and
>   re-publishes for its term while the partitioned old owner's stale-term writes are rejected
>   (step 6); and the publication commit was made a REAL QUORUM-GATED raft-log commit — the real
>   owner driver publishes via `raft.command()` on a real liferaft log, so the migrated leader's
>   re-publish COMMITS only on a real majority while the partitioned old owner genuinely cannot
>   (step 7, removing step 6's modelled commit) — see "DT6 — STEP 1…7 LANDED" under DT5 above.
>   Seed-iterated WHOLE-SYSTEM DST — instantiating the OTHER real subsystems
>   (readiness/rebalancer/the membership-lifecycle + placement controllers) alongside the real raft
>   nodes on the VirtualNetwork and driving the REAL publication persistence/CDC/ack pipeline (not the
>   required-version stand-in), seed-iterated via the DT5 PCT scheduler, to reproduce the control-plane
>   CL-039 fail-back end-to-end with the real pipeline — remains the gated program. The seams
>   (TimeSource on all four subsystems + raft, RandomSource on the jitter sites), the VirtualNetwork
>   substrate, the adapter that hosts a real TimeSource-seamed machine, the real raft RPC transport, a
>   real raft leadership migration, the first real control-plane subsystem, the real publication-deficit
>   fail-back decision, AND a real quorum-gated published commit are now in place; what remains is the
>   OTHER real subsystems + the real publication pipeline. (A pre-existing liferaft/InMemoryLogAdapter
>   log-entry divergence on heal — same-index stale-commit without a term/command match — was surfaced
>   by step 7's verification and is flagged for a separate closure-ledger entry.)

> Corrections from the verification pass are marked **[V]** inline. The load-bearing
> one reworked DT1: **"force the precondition" is deterministic only for bugs with a
> STRUCTURAL (observable-state) precondition; for TIMING-race bugs like CL-039 it only
> *biases* the hit rate — true determinism needs DT4's virtual clock.** The repo's own
> N=8 CL-039 verdict proves the leadership-shed is probabilistic regardless of gap
> magnitude (a 19.5s seed gap held leadership) and the terminal self-heals (0/8), so a
> seed pause cannot deterministically reproduce CL-039 in one pass. DT1 is reframed
> accordingly; secondary fixes: the Raft election seam lives in LiferRaft's `Tick`
> object (not `raft-replica-base.js:412`), `model:check` is in no test aggregate today
> (DT7 is net-new CI wiring, not a promotion), and `pauseNode` is docker-pause
> (cgroup freezer), not literal SIGSTOP.

## What the DT substrate cannot prove (limits table)

The fidelity limits are otherwise scattered across the MOTIVE block, per-step [V]
notes, and test headers; this table consolidates them so a DT quest is scoped
against them up front. A DT "not found" or "green" verdict is only as strong as
the row that bounds it.

| # | Limit | What it means for a verdict | Instrument instead | Anchor |
| --- | --- | --- | --- | --- |
| a | CPU-contention / latency-tail races | Out of scope BY DESIGN: the virtual clock/network determinizes message and timer ordering, not CPU contention — virtualizing a latency-tail scenario deletes the race. Never scope a DT quest around scenario-rate fidelity. | The statistical Docker gate (Wilson-95 bar, `docs/convergence-donewhen-metric.md` §5/§7) | This doc's MOTIVE block (~lines 24-41) |
| b | Real network transport / Docker-only behaviors | TCP resets, dial-to-dead-IP behavior, and cgroup-freezer pauses (`docker pause`) are not modeled in-process; a DT pass says nothing about them. | Docker harness / targeted transport tests | [V] note on `pauseNode` (~line 372) |
| c | Real persistence / CDC / ack pipeline + not-yet-hosted control-plane subsystems | Steps 5-7 host the publication driver with a required-version stand-in and `InMemoryLogAdapter`; readiness / rebalancer / membership-lifecycle + placement controllers are not on the network yet. | Deferred whole-system DST (the gated north-star program) | "REMAINING toward full DT6" (~lines 313-317, 350-361) |
| d | Mid-churn invariant sampling under coarse `driveNetwork` | Coarse batching drains a co-due batch before flushing microtasks, so a mid-batch observation is a drive-granularity artifact, not a protocol state; most raw sweep "violations" were this. Coarse and fine are NOT equivalent under a PctScheduler — they can elect different leaders on some seeds. | `driveNetworkFine` (deliver one event, flush to quiescence, observe) | `test/convergence/dt6-fine-drive-midchurn-safety.test.js:9-30` |
| e | Negative-evidence PCT results | "Not found" is bounded by the seed budget, the depth searched, AND the drive granularity: a coarse-batched search explores a different schedule space than fine (batching changes which events are co-due when the scheduler picks). "Not found" ≠ impossible. | Raise the bound (more seeds / higher depth / fine drive) or make a structural-unreachability argument | `test/convergence/dt6-publication-failback-pct-search.test.js:28-40`; `minimizePctDepth`'s `notReproducedBelow` (~lines 128-133) |
| f | Unseamed `src/` code (wall-clock leaks) | Only ~15 of ~330 `Date.now()`-using src files thread a TimeSource; everywhere else raw `Date.now`/`setTimeout` runs on the wall clock under virtual time, so a virtual-time run silently exercises real-time logic (e.g. the raw `Date.now()` catch-up inflight-TTL class at `src/raft/liferaft.js:184`). | Thread the DT4 TimeSource seam through the subsystem before trusting a DT verdict that crosses it | `src/time/time-source.js`; `src/raft/liferaft.js:184` |

## Why this plan

The convergence verdict today is a Monte-Carlo docker gate: N≥8 runs × ~400s ≈ 50
min, and it "runs a lot and hopes the race shows up." That is the wrong tool for the
bugs this repo actually has. Per the closure ledger and the convergence memories, the
recurring class is **deterministic design / liveness bugs with a non-deterministically
*triggered* precondition** (circular dependencies in formation/recovery; leadership
stranding; lost-wakeup). For that class, sampling can confirm "rare" but can never
prove "fixed" — the precondition just stops appearing (CL-039 is stuck at "open,
not-reproduced-at-N=4").

The fix is not "sample more cheaply." It is: **force the precondition, check the
design directly, and demote the gate to a final integration check.** This plan turns
that into eight workstreams, grounded in what already exists.

The decisive grounding corrections (they shrink the work):

- **[G] 3 of the 4 critical-path clock seams already exist.** The owner driver takes
  `options.setIntervalFn` (`membership-publication-coordinator-reconcile.js:669`),
  the readiness build takes `options.now`
  (`control-plane-readiness-participation-base.js:225`), and the lease service takes
  `now`/`setIntervalFn`/`clearIntervalFn` (`lease-service.js:73-81`). Only **Raft
  election timing** and the **HLC physical clock** (`hlc-clock-service.js:27,53,80`)
  lack a seam — and Raft election timing is exactly CL-039's L1 cause. [V] The Raft
  election seam is NOT `raft-replica-base.js:412` (that is the learner-promotion timer):
  the election timer is armed inside LiferRaft via `raft.timers.setTimeout('election', …)`
  (`node_modules/@markwylde/liferaft/index.js:729`), routed through a swappable `Tick`
  object — but `tick-tock` hardcodes native timers, so virtualizing it means substituting
  the whole `Tick` (or patching globals). `applyRuntimeRaftTiming`
  (`raft-timing-utils.js:61`) changes the election *duration*, not the *clock*.
- **[G] `chaos.js` already has `pauseNode` and `restartNode`.** [V] `pauseNode` is
  docker pause (cgroup freezer, `docker-provider.js:549`), **not** literal SIGSTOP —
  it freezes the whole container, a *different* fault than a running-but-stalled seed.
  [V] And pausing the seed past `ELECTION_MAX_DEFAULT_MS` does **not** deterministically
  shed leadership: the CL-039 ledger's own N=8 data shows the L1→L2 shed is probabilistic
  (a 19.5s seed gap held leadership) and the terminal self-heals (0/8). So this is a
  *biasing* lever, not a deterministic reproducer — see the DT1 rework.
- **[G] invariant-engine, gap-watchdog, the fast-check real-function pattern, and the
  TLA+ specs already exist** — `evaluateInvariants(state)`
  (`src/control-plane/invariant-engine.js:555`, 13 invariants, currently post-hoc
  only), `EventLoopGapWatchdog` (`src/diagnostics/event-loop-gap-watchdog.js`, running
  at boot), `task27-membership-publication-interleavings.property.test.js` (drives the
  real `deriveMembershipPublicationCandidate`/`acknowledgeMembershipPublication`), and
  `models/**/*.tla` (`PublicationConvergence.tla` already models a lost-wakeup with a
  `ScheduledReconcile` fix). Most of Tier-1 and the complementary work is *wiring*.
- **[G] The wait-for methods are fixed-condition pollers, not generic.**
  `waitForControlPlaneQuiescence`/`waitForConvergence`/`waitForAllActive`/
  `waitForLoadReadinessStability` each poll a built-in predicate; **none takes an
  arbitrary caller predicate.** Directed chaos needs a new generic `waitForState`.
- **[G] Observability risk:** publication status is in
  `node.getControlPlaneLedgerSnapshot().controlPlaneDiagnostics.publicationConvergence`
  (`cluster-node-handle-layer.js:970`), but the publications-p1 **leadership location**
  (`tier1PartitionsLeaderNodeId`) appears to live in rebalancer DIAG logs, not the
  snapshot. DT1 must confirm/add it as a first-class snapshot field.

| Order | WS | What it buys | Tier | Size |
|------|-----|--------------|------|------|
| 1 | DT1 directed (state-triggered) chaos | forces structural preconditions deterministically; biases timing races | 1 | M |
| 2 | DT2 single-run invariant + gap monitor | one run yields the violated invariant, not a coin flip | 1 | S |
| 3 | DT7 TLA+ model-check the design class | proves a circular-dep fix the gate can't | comp | M |
| 4 | DT3 property-based kernel interleaving | shrink races in pure decision logic | 1 | S-M |
| 5 | DT4 virtual-clock seam on the critical path | drive the real freeze→leadership chain in-process | 2 | L |
| 6 | DT5 seeded scheduler / PCT fuzzing | principled depth-bounded race search vs sampling | 2 | L |
| 7 | DT8 demote the docker gate | re-rank the loop: falsify cheap, integrate rarely | meta | S |
| 8 | DT6 full DST | seed-iterated whole-system simulation | 3 | XL |

DT8 is policy that lands as soon as DT1–DT2 give a cheaper falsifier. DT6 is the north
star; DT4 is the load-bearing investment that makes DT5/DT6 possible.

---

## DT1 — Directed (state-triggered) chaos (flagship)

**Tier 1 #1.** Converts the coin-flip into a forced precondition — **deterministically
for bugs with a STRUCTURAL precondition, and as a *biasing* lever for timing races.**

> **[V] Scope correction (load-bearing).** "Force the precondition" is fully
> deterministic only when the precondition is an *observable structural state* (an OPEN
> epoch, a missing handler, a specific topology) you can detect and then act on. For a
> *timing race* — like CL-039, where a seed event-loop gap must coincide with the raft
> election-timer window — directed chaos can only *raise the hit rate and make the run
> observable*; the repo's own N=8 CL-039 data shows the gap→shed step is probabilistic
> (a 19.5s gap held leadership) and the OPEN-stuck terminal self-heals (0/8). True
> determinism for that class needs DT4's virtual raft clock. So: **lead the flagship
> with a structural-precondition CL; treat CL-039 as a biasing + observability case,
> honestly labeled, and finish it deterministically under DT4.**

### Problem statement (grounded)
`rolling-restart.js` waits for quiescence, then restarts nodes on a **wall-clock
timer**: `preRestartSettleMs` (`:599`), a `restartNode` loop with `interRestartDelayMs`
(`:612-621`), and `postRestartLoadSoakMs` (`:626`) — defaults 1000/250/1000 in
`config/local.json`. Whether the bad interleaving happens depends on where that timer
lands vs the system's internal micro-state. That is the "run a lot and hope." The
harness already exposes the state to do better: `node.getControlPlaneLedgerSnapshot()`
(`cluster-node-handle-layer.js:970`) returns `publicationConvergence` (status
OPEN/PUBLISHED) and `readinessByNodeId`, and `chaos.js` already has `pauseNode`
(SIGSTOP, `:199-211`) and `restartNode` (`:217`).

### Concrete steps
1. **Add a generic `waitForState(predicate, opts)` to the cluster class** (alongside
   the fixed-condition waiters in `cluster-class-quiescence.js` /
   `cluster-class-lifecycle-base.js:1344`). It polls a caller-supplied
   `async (cluster) => boolean` on a bounded interval with a timeout and a
   no-progress cut — the one primitive the existing waiters specialize but never
   expose generically.
2. **Surface leadership location in the snapshot** ([G] observability gap). Confirm
   whether `getControlPlaneLedgerSnapshot()` carries `tier1PartitionsLeaderNodeId`; if
   not, add it (publications-p1 write-leader + `helperSaysWriteLeader`) to
   `controlPlaneDiagnostics` so a predicate can read "leadership stranded on a
   restarting node" without scraping logs.
3. **Pick a STRUCTURAL-precondition CL as the first flagship** — one whose precondition
   is an observable state (e.g. an OPEN epoch with a specific topology, a quorum on the
   edge), where `waitForState(predicate) → restart/partition/kill` forces the failure
   *deterministically*. State-triggered chaos (act exactly when the system is in state
   X) is strictly better than timed chaos and is the durable, reusable pattern. (Survey
   the active frontier for the best candidate; CL-039 is NOT it — see below.)
4. **Treat CL-039 as a biasing + observability case, honestly labeled.** Build
   `test/closure/CL-039.repro.test.js` that:
   - drives to the post-restart recovery window,
   - **biases** toward L1 by pausing/stalling the seed near the election window
     (`pauseNode`, [V] docker-pause = whole-container freeze, a *different* fault than a
     running-but-stalled seed — note this in the test), and `restartNode(lastNode)`,
   - **observes** with `waitForState` whether leadership strands on a restarting node and
     the epoch stays OPEN, recording the L1→L4 link rates into the report.
   This raises the CL-039 hit rate and makes a single run *diagnostic* (which link
   fired), but it is **not** a deterministic one-pass reproducer — the gap→shed step is
   probabilistic (CL-039.md N=8) and the terminal self-heals. The deterministic CL-039
   force lands under **DT4** (virtual raft clock: make the seed miss the election timeout
   while running). Label the test as biasing-until-DT4 in its header.
5. **Register** in `test/closure/registry.json` / `npm run repro -- CL-###`.

### Guard / verification
- For the structural-precondition flagship: the directed repro reproduces the failure in
  a single run, deterministically, far under the 400s gate wall, and goes green under
  the fix (red-on-revert).
- For CL-039: the biasing run measurably raises the L1→L2 link rate vs timed restart and
  reports which causal link fired per run (an honest improvement, not a silver bullet).
- `waitForState` has a harness unit test (predicate true immediately → returns; never
  true → times out with a clear message).

### Effort / risk
Medium. Risk: low-moderate — harness-only (no `src/` behavior change) except the
leadership-location snapshot field (step 2). [V] The flagship value depends on choosing
a *structural* precondition; CL-039 alone would leave DT1 as a biasing tool, which is
why DT4 (not DT1) is the true deterministic unlock for the timing-race class.

---

## DT2 — Single-run invariant + gap monitoring (make one run informative)

**Tier 1 #2.** Stops needing N samples to learn *what* broke.

### Problem statement (grounded)
`evaluateInvariants(state)` (`src/control-plane/invariant-engine.js:555`) already
encodes 13 safety invariants (leader uniqueness, publication-drain determinism, …) but
is only called **post-hoc** (deterministic-convergence-harness + root-cause-invariants
on the failure bundle). `EventLoopGapWatchdog`
(`src/diagnostics/event-loop-gap-watchdog.js`) already measures `maxGapMs` at boot and
warns over `LAGRANGE_LOOP_GAP_THRESHOLD_MS`, but its signal lands only as console WARN
in the gz logs. So a single run produces a binary pass/fail and you sample N times to
see the violated invariant.

### Concrete steps
1. **Sample invariants continuously during a run.** In the scenario/quiescence poll
   loop, periodically build the state snapshot the failure bundle already builds and
   call `evaluateInvariants` live; record the first failing safety invariant + the
   timestamp + a bounded trace into the run report. A run then *reports the violated
   invariant*, not just FAIL.
2. **Promote the gap-watchdog max-gap into the run verdict.** Read
   `EventLoopGapWatchdog.maxGapMs` (or parse its WARN) per node and stamp
   `maxEventLoopGapMs` into the report next to `srcFingerprint`; add a gate assertion
   that the seed max gap stays below the raft election timeout (the WS4 gap-watchdog
   idea, now first-class). A single run shows whether a freeze blew the election ceiling.
3. **Wire both into `analyze:precondition-recurrence`** so the precondition is read off
   one run's invariant timeline instead of mined from logs.

### Guard / verification
- A known-failing directed run (DT1) reports the exact violated invariant + the seed
  max gap in its report JSON, with no debug-logs perturbation.
- The gap assertion fires on an induced seed pause and passes on a healthy run.

### Effort / risk
Small. Risk: low — read-only monitoring; must stay O(cheap) per poll so it does not
itself perturb convergence (sample on the existing poll cadence, not a hot loop).

---

## DT7 — TLA+ model-check the design-bug class (complementary, high-leverage)

**Complementary.** The right proof for the recurring circular-dependency / lost-wakeup
class — which the docker gate can never prove fixed.

### Problem statement (grounded)
The recurring bug class is design-level (`[[circular-dependency-class-formation-vs-steady-state]]`,
`[[recovery-as-second-bootstrap-impossibility]]`). Five TLA+ specs already exist —
`models/active-gate/ActiveGate.tla`, `models/readiness-starvation/{ReadinessStarvation,
PublicationConvergence,CoupledAdmission}.tla`, `models/readiness-handoff/ReadinessHandoff.tla`
— and `PublicationConvergence.tla` already models a **lost-wakeup** with a candidate
`ScheduledReconcile` fix. `npm run model:tlc` (`scripts/model-tlc.js`) runs TLC; it is
in `test:quality` via `model:contracts`/`model:check` but **not in `test:ci`**, and
there is **no documented CL↔spec mapping**. [V] Correction: `model:check`/`model:tlc`
are **standalone manual scripts in NO test aggregate** — `test:quality` is
`test:static + test:mutation`, neither of which references them. So DT7 step 3 is
*net-new CI wiring*, not a "promotion."

### Concrete steps
1. **Map each design-class CL to a TLA+ property.** Add a `model:` field to the CL STATE
   block (or a `models/CL-INDEX.md`) linking e.g. CL-001/CL-036 (circular spread↔readiness)
   to the spec + property that should hold. **[V] For CL-039, author a NEW
   `LeadershipFailback.tla` rather than extending `PublicationConvergence.tla`:** that
   spec models `published/converged/probeBounded/phase` with **no leadership variable,
   no node identity, no Raft** — CL-039's mechanism (leadership migrating off the seed
   onto a restarting replica with no fail-back) is a different state dimension, so the
   fit is only the abstract "a needed action never fires." A dedicated spec with a
   leader-location variable + a fail-back action is the honest model.
2. **Make a design-class fix gate on a green model-check.** When a CL's first violated
   invariant is circular/liveness, require `npm run model:tlc` (the relevant config)
   green before `fix_in_progress` → guarded, recorded in `reproducedBy` alongside the
   directed repro. This is the deterministic *proof* the gate can't give.
3. **Wire `model:check` into CI** ([V] it is in no aggregate today — this is net-new,
   not a promotion; it is fast and offline) so a spec regression is caught, and document
   the spec↔CL map in `docs/deterministic-repro-tier.md`.

### Guard / verification
- The extended `PublicationConvergence.tla` (or a new `LeadershipFailback.tla`)
  exhibits the CL-039 lost-wakeup as a TLC counterexample on the unfixed action and
  holds under the fail-back fix.
- `npm run model:tlc` green and wired into CI.

### Effort / risk
Medium (TLA+ authoring is specialist work, but the specs exist). Risk: low — models are
offline; the danger is a spec that abstracts away the real failure mode
(`[[publication-convergence-model-vs-reality]]`), so each extended action must be
justified against the CL evidence.

---

## DT3 — Property-based interleaving of decision kernels

**Tier 1 #3.** Shrink races in pure logic instead of sampling them in docker.

### Problem statement (grounded)
`test/control-plane/task27-membership-publication-interleavings.property.test.js`
already drives the **real** `deriveMembershipPublicationCandidate`
(`membership-publication-planning-evidence.js`), `buildMembershipPublicationRow`, and
`acknowledgeMembershipPublication` under fast-check (v3.23.2) with injected `nowMs` and
shrinking. The stateful `driveOwnerMembershipReconcile`
(`coordinator-reconcile.js:453`) is NOT pure and is not a fast-check target — but the
pure `derive*`/planning kernels it calls are.

### Concrete steps
1. **Extend the interleaving model** to the pure decision kernels on the convergence
   critical path that lack property coverage: the owner ack-completion/close predicate
   (extract a pure `decideOwnerReconcileOutcome(snapshot)` if needed) and the
   rebalancer remove-safety decision. **[V] Caveat:** the existing
   `evaluateRemoveSafety(context, operation)`
   (`operation-workflow-remove-safety-evaluator.js:266`) is **async and deeply
   I/O-bound** (`await getOperationsByEntity`, `router.pingNode`,
   `getCriticalReplicaRowsForSafety`), so factoring a pure `evaluate(snapshot)` from it
   is a substantial decoupling refactor, not a light extraction — size this item at the
   upper end of the range, or scope DT3 to the already-pure `derive*`/planning kernels
   first and defer remove-safety until DT4 makes its inputs injectable.
2. **Encode the CL invariants as fast-check properties** over those kernels (e.g.
   CL-038 surplus-drain terminalization, CL-035 voter-ready visibility) so a regression
   shrinks to a minimal failing interleaving in seconds.
3. Route these under `test/closure/` where they correspond to a CL, reusing
   `npm run repro -- CL-###`.

### Guard / verification
- Each new property fails (shrinks to a minimal counterexample) when its fix is
  reverted, green on HEAD.

### Effort / risk
Small–Medium. Risk: low; the value is bounded by how much logic is pure — pairs with
DT4 (a clock seam lets more of the stateful path be driven deterministically).

---

## DT4 — Virtual-clock seam on the critical path (the load-bearing unlock)

**Tier 2 #4.** Drive the *real* freeze→leadership-loss→stall chain in-process.

### Problem statement (grounded)
The emergent bug is the freeze→leadership chain. Three of its four subsystems already
take an injectable clock: owner driver `setIntervalFn`
(`coordinator-reconcile.js:669`), readiness `now`
(`control-plane-readiness-participation-base.js:225`), lease all-three
(`lease-service.js:73-81`). The two gaps are **Raft election timing** — opaque LifeRaft,
native `setTimeout` at `raft-replica-base.js:412`, configured via
`raft/constants.js RAFT_ELECTION_TIMING` — and the **HLC physical clock**
(`hlc-clock-service.js:27,53,80`, no injection). There is no shared clock module today.

### Concrete steps
1. **Introduce one `TimeSource` abstraction** (`now()` + `setTimer`/`clearTimer`) with a
   real-time default and a virtual implementation that the convergence harness advances.
   Thread it through the three subsystems that already have partial seams (collapse
   their ad-hoc `now`/`setIntervalFn` options onto it) and the HLC clock.
2. **Tackle Raft election timing** — the hard part. Either (a) wrap LifeRaft's timer
   creation behind an injectable scheduler, or (b) drive election timing through
   `applyRaftTimingConfig` (`message-group-service-raft-timing.js`) plus a virtual
   timer shim. This is the seam that lets the harness force "seed misses the election
   timeout" deterministically (CL-039 L1) without SIGSTOP.
3. **Stand up a critical-path in-process scenario** in `deterministic-convergence-harness`
   that instantiates the real owner driver + readiness + lease + a raft stub on the
   virtual clock and reproduces the freeze→leadership chain by advancing time — the
   emergent bug, deterministic, in milliseconds.

### Guard / verification
- The in-process scenario reproduces a known freeze→leadership-loss (CL-034/CL-001-B
  lineage) by advancing the virtual clock past the election timeout, and goes green
  under the landed fix — no docker.
- Equivalence: with the real-time `TimeSource`, behavior is unchanged (a differential
  run vs a small docker gate matches).

### Effort / risk
Large. Risk: high — touches the hottest timing paths; the Raft seam is the riskiest.
Land the `TimeSource` behind a default that is byte-for-byte the current behavior;
adversarial subagent verification + a small equivalence gate before relying on it.

---

## DT5 — Seeded scheduler / PCT-style fuzzing

**Tier 2 #5.** Principled depth-bounded race search instead of sampling.

### Problem statement (grounded)
`Math.random()` is called directly in jitter/backoff hot paths
(`unified-rebalancer-policy-scheduler-methods.js:113,120`, `message-retry-handler.js:130`,
`rebalancer-planning-gate-methods.js:54`); a few components already accept an injectable
`random` (`replica-operation-repository.js:519`, `latency-group-manager.js:70`,
`node-joining-owner-construction.js:104`). No PCT or schedule-exploration framework
exists.

### Concrete steps
1. **Thread a seeded RNG** (via the DT4 `TimeSource`/`RandomSource` pair) through the
   jitter/backoff sites so a seed fully determines scheduling decisions.
2. **Add a PCT-style scheduler** over the DT4 virtual clock: bound the bug depth k, and
   for each seed insert k priority-change points — giving a provable lower bound on the
   probability of catching a depth-k race per seed, replacing "hope."
3. **Iterate seeds** (each a sub-second in-process run) to a budget; on failure, record
   the seed for exact replay (`deterministic-simulator.js` already has replay +
   `minimizeDeterministicTrace`).

### Guard / verification
- A known depth-2 race (a reverted fix) is found within a bounded seed budget and
  replays deterministically from its seed.

### Effort / risk
Large; depends on DT4. Risk: moderate — only as sound as the seam coverage; uncovered
`Math.random`/`Date.now` sites silently break determinism (add a lint/audit that flags
direct `Date.now`/`Math.random`/`setTimeout` on the critical-path modules).

---

## DT8 — Demote the docker gate (re-rank the loop)

**Meta / policy.** Lands as soon as DT1–DT2 provide a cheaper falsifier.

### Problem statement
The docker stat-gate is currently the *falsifier* (run N, hope). It should be the
*final emergent-integration check*, run rarely.

### Concrete steps
1. **Re-rank the loop in the closure grammar:** falsify at DT1 (directed repro) / DT3
   (property) / DT7 (model-check) FIRST; the docker gate runs only to confirm a
   green-deterministic fix at the emergent level, **N=2–3**, not N≥8.
2. **Record the rung** in `reproducedBy`: a fix needs (a) a deterministic repro or
   model-check AND (b) one small confirming gate — not a large statistical gate as the
   primary evidence.
3. **Keep the large gate** only for genuinely statistical questions (convergence-rate
   promotion verdicts), per `[[stat-gate-run-count-guidance]]`.

### Guard / verification
- The grammar + `docs/deterministic-repro-tier.md` state the re-ranked loop; a
  spot-audit of the next few CLs shows the directed/property/model evidence landing
  before any large gate.

### Effort / risk
Small (doc/policy). Risk: low — but [V] it only sticks once the cheap tier actually
*reaches* the emergent bug for the CL in hand: deterministically via DT1 for
structural-precondition bugs, but only via **DT4** for timing-race bugs like CL-039
(DT1 alone biases, it does not falsify them). Demote the docker gate per-CL only when a
deterministic falsifier exists for that CL — not as a blanket policy.

---

## DT6 — Full DST (the north star)

**Tier 3.** Seed-iterated whole-system deterministic simulation (FoundationDB /
TigerBeetle / Antithesis).

### Problem statement (grounded)
`deterministic-simulator.js` already has the *shell* — fake clock, partition/heal,
message drop/delay, replay, `minimizeDeterministicTrace` — but drives test-provided
callbacks, not the real state machines, because `src/` lacks systematic clock/RNG/
scheduler injection.

### Concrete steps (program, not a sprint — gated on DT4/DT5)
1. Complete clock + RNG + scheduler injection across the system (DT4/DT5 generalized).
2. Instantiate the real owner/readiness/rebalancer/raft instances inside the
   deterministic simulator's event loop on the virtual clock + virtual network.
3. Drive runs by **seed**; iterate thousands/min; every failure reproducible and
   shrinkable to a minimal trace.

### Guard / verification
- A seed reproduces a real historical CL failure end-to-end in-process and shrinks to a
  minimal trace; a differential run against a small docker gate agrees.

### Effort / risk
Very large; multi-month. Risk: high; the prize is "every race is reproducible." Pursue
only after DT4 proves the seam approach on the critical path.

---

## Sequencing & dependencies
- **DT2 first** (best-grounded, cheap, makes every run informative). **DT1** alongside,
  led by a *structural-precondition* CL (deterministic), with CL-039 as a biasing case.
  **DT7** in parallel (specialist, but specs exist).
- **DT3** rides on the existing fast-check pattern over the already-pure kernels;
  remove-safety waits on **DT4**.
- **[V] DT4 is the true deterministic unlock for the timing-race class** (CL-039), not
  just a "Tier 2" nicety — it is what lets DT1/DT8 actually falsify those bugs. It is
  also the load-bearing investment **DT5** and **DT6** depend on.
- **DT8** is per-CL policy that becomes safe only once a deterministic falsifier exists
  for that CL (DT1 for structural, DT4 for timing-race).

## Open questions (for the verifier)
1. DT1: is `tier1PartitionsLeaderNodeId` already in `getControlPlaneLedgerSnapshot`, or
   must it be added? (Determines whether DT1 is pure-harness or touches the snapshot.)
2. DT1: does `pauseNode` (SIGSTOP) reliably reproduce the election-timeout shed, or does
   docker pause interact with the heartbeat detector differently than a real event-loop
   gap? (Validate the induction lever before building the full repro.)
3. DT4: wrap LifeRaft's timer vs drive timing through `applyRaftTimingConfig` — which is
   the lower-risk Raft election seam?
4. DT7: extend `PublicationConvergence.tla` vs author a dedicated `LeadershipFailback.tla`
   for CL-039?

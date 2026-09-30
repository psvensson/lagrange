# Round 8: ReplicaStateMachine timing-owner census (owner guidance 2026-09-29, item 5)

1. Who owns RSM time today? The RSM itself: `now` came from `options.now` or `REPLICA_STATE_MACHINE_NOW` (Date.now);
   the timeout checker called the global `setInterval`/`clearInterval` (src/node/replica-state-machine-timeouts.js:21).
2. Canonical injected clock/scheduler? YES: `src/time/time-source.js` (`RealTimeSource` delegates to host timers,
   `VirtualTimeSource`, `resolveTimeSource`, `resolveOwnedTimeSource`), exposed per node by `NodeService.getTimeSource()`
   (node-service.js:556). Already used by the seed bootstrap for timers (bootstrap-service-runtime-methods.js:369), the
   system-table cache, tombstone store, message-group services and the node runtime authorities.
3. Production constructors: seed `initializeReplicaStateMachine` (bootstrap-service-replica-registration-methods.js:93) now
   passes `this.nodeService.getTimeSource()` (RealTimeSource in production). Joiner (`ReplicaHandlerSetup.create` from
   node-joining-publication-activation.js:207) and `ReplicaHandler` fallback / failure-detector RSMs pass none -> default
   RealTimeSource (unchanged). The joiner has no nodeService handle; threading it is a follow-up, not needed for any
   current witness.
4. Integration/simulator constructors: the simulator gives each node `NodeService({timeSource: network.networkTimeSource})`
   (formation-sim-production-node-environment.js:150-153); integration helpers use the default real source.
5. Did the checker use globals directly? YES (setInterval/clearInterval). Now: `stateMachine.timeSource.setInterval/
   clearInterval`, `unref` only when the handle has it.
6. Is simulated time authoritative elsewhere in formation-sim? YES: the strict seam guard (test/simulation/
   formation-sim-guard.js) throws `nondeterministic_owner_seam` on any ambient timer/clock read inside a node dispatch.
7. Production behaviour change? NO: with no timeSource the RSM resolves RealTimeSource (host setInterval/clearInterval,
   same interval, same unref) and keeps `now = Date.now` (an explicit `now` still wins). The seed now passes its
   RealTimeSource, whose now() is Date.now(). No simulator-only conditional in src; no timeout changed.

Verdict: an existing canonical owner exists -> owner-wiring correction, kept in this quest.
Witness: test/node/replica-state-machine-time-source.test.js (default is RealTimeSource; a VirtualTimeSource alone fires
the checker and stop clears it; explicit now wins). Red-on-revert: host setInterval restored -> 2 assertions red.
Simulator after wiring + compatibility corrections: production-partitions 3/3, production-handoff 5/5 (charged-seed-host: see progress.md).

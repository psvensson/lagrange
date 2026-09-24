# Finding: a restart during an in-flight background wave revives the pre-stop wave (round-5 N3)

Recorded 2026-09-24 in the round-5 corrective of cutover seed parity. Not changed in this unit (record only).

- **Property:** once `CDCGroupPropagationService.stop()` returns, no work begun before it may continue: no pre-stop wave, delivery or retry may arm, deliver or record. This must hold even if the service is started again.
- **Scenario:**
  1. A background retry wave's router attempt is in flight (`runBackgroundRetryEntry` is awaiting `deliverToTargets`).
  2. `stop()` runs, then `start()` runs, before the router answers.
  3. The wave's post-attempt check (`isPropagationStopped()`) sees RUNNING again.
  4. The pre-stop wave records its events and re-arms its retry timer in the restarted service.
  Verifier probe lane `restart-during-bg-wave` (`verify-seed-parity/r5/probes/p-property.mjs`) shows `bgEntriesAfterRestart: 1, bgTimersAfterRestart: 1`, the same as on 6e432286d. The same shape applies to any await in the owner: a post-await state check cannot tell "still running" from "running again".
- **Why it is not reachable today** (corrected in round 6, N-c):
  - **`start()` call sites.** `CDCGroupPropagationService.start()` is called only from the static `LatencyTopologySetup.start` (`src/bootstrap/shared/latency-topology-setup.js:135`). That is reached through the startup lifecycle entry points `startLatencyTopologyLifecycle`, each of which restarts the existing topology instance:
    - the seed: `src/bootstrap/owners/seed-runtime-bridge-owner.js:143-155`, called by the deferred seed start in `bootstrap-service-seed-workflow.js:163`, which returns early when `isShuttingDown`, and by `seed-cache-hydration-phase.js:716`;
    - the joiner: `src/bootstrap/node-joining-owner-construction.js:311-316`, called through `node-joining-publication-activation.js:715`;
    - the runtime handoff: `src/bootstrap/shared/startup-sql-runtime-handoff.js:220`.
    All of these run during startup, before the node's teardown.
  - **The teardown window.** Teardown does not null the topology atomically with stopping it. The seed cleanup (`seed-cleanup-handler.js:562-563`) and the join cleanup (`join-cleanup-handler.js:614-615`) `await LatencyTopologySetup.stop(topology)`, which itself awaits `latencyGroupManager.stop()` before it stops this service, and only then call `setLatencyTopology(null)`. Between this service's `stop()` and the null there is at least a microtask window in which the topology is still reachable, and a `startLatencyTopologyLifecycle` there would restart this stopped instance.
  - **Conclusion (unchanged): not reached today.** No startup entry point runs concurrently with teardown:
    - the deferred seed start checks `isShuttingDown`, which the cleanup sets first;
    - the joiner's and the handoff's starts complete within their startup step, before the cleanup that follows a failed or finished run.
    A concurrent or late start path would open the scenario, and the remedy below closes it independently of call order.
- **Remedy when a restart path is added:**
  - `stop()` advances a stop generation token.
  - Every lane captures the token when it begins: a propagate call, a delivery, a batch entry and a background wave.
  - After each await, and in the arm primitive, the lane compares its captured token with the current one; a mismatch answers PROPAGATION_STOPPED and arms nothing.
  - This replaces "is the service stopped now?" with "was this work begun under the current run?", which is exact across restarts.
  - Witness: the property witness in `test/topology/cdc-group-propagation-stop-arms-nothing.test.js` extended with a `stop(); start();` lane for the background wave in flight, the batch flush and the retry delay. It requires zero owner timer creations and zero router deliveries for the pre-stop work.

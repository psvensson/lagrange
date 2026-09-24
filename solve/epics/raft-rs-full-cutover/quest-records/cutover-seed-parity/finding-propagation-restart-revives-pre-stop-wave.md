# Finding: a restart during an in-flight background wave revives the pre-stop wave (round-5 N3)

Recorded 2026-09-24 in the round-5 corrective of cutover seed parity. Not changed in this unit (record only).

- **Property:** once `CDCGroupPropagationService.stop()` returns, no work begun before it may continue: no pre-stop wave, delivery or retry may arm, deliver or record. This must hold even if the service is started again.
- **Scenario:**
  1. A background retry wave's router attempt is in flight (`runBackgroundRetryEntry` is awaiting `deliverToTargets`).
  2. `stop()` runs, then `start()` runs, before the router answers.
  3. The wave's post-attempt check (`isPropagationStopped()`) sees RUNNING again.
  4. The pre-stop wave records its events and re-arms its retry timer in the restarted service.
  Verifier probe lane `restart-during-bg-wave` (`verify-seed-parity/r5/probes/p-property.mjs`) shows `bgEntriesAfterRestart: 1, bgTimersAfterRestart: 1`, the same as on 6e432286d. The same shape applies to any await in the owner: a post-await state check cannot tell "still running" from "running again".
- **Why it is not reachable today:** `start()` is called only at setup:
  - `src/bootstrap/shared/latency-topology-setup.js:135`
  - `src/bootstrap/owners/seed-runtime-bridge-owner.js:133`
  - `src/bootstrap/node-joining-publication-activation.js:702`
  Teardown stops the service and drops the topology (`LatencyTopologySetup.stop`, then `setLatencyTopology(null)`); nothing restarts a stopped instance.
- **Remedy when a restart path is added:**
  - `stop()` advances a stop generation token.
  - Every lane captures the token when it begins: a propagate call, a delivery, a batch entry and a background wave.
  - After each await, and in the arm primitive, the lane compares its captured token with the current one; a mismatch answers PROPAGATION_STOPPED and arms nothing.
  - This replaces "is the service stopped now?" with "was this work begun under the current run?", which is exact across restarts.
  - Witness: the property witness in `test/topology/cdc-group-propagation-stop-arms-nothing.test.js` extended with a `stop(); start();` lane for the background wave in flight, the batch flush and the retry delay. It requires zero owner timer creations and zero router deliveries for the pre-stop work.

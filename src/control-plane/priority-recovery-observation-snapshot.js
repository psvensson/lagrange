/**
 * Owner contract:
 * Owner: PriorityRecoveryObservation owns observed priority-recovery diagnostics.
 * Inputs: decision snapshots, publication evidence, active gates, partition witnesses.
 * Canonical output: observation snapshots and partition witness summaries.
 * Prohibited fallbacks: do not invent semantic state when canonical evidence is absent.
 * Primary tests: test/control-plane/priority-recovery-snapshot.test.js.
 */
export {buildPriorityRecoveryObservationSnapshot} from './priority-recovery-observation-snapshot-stage-4.js';
export {buildPriorityRecoveryPartitionWitnesses} from './priority-recovery-observation-snapshot-stage-2.js';

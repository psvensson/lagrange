// Follower-side snapshot install orchestration (quest
// raft-snapshot-compacted-follower-catchup S4; the install episode: quest
// partition-checkpoint-epoch-generation). One offered generation is driven
// through the closed-handle boundary: receive, shutdown, atomic install, and
// the replica's return.
//
// The replica is under its owner's install EPISODE from the offer's
// admission (production: the node's replica handler,
// node/replica-snapshot-install-owner.js). The shutdown is the irreversible
// step: a PartitionService that was shut down is never re-initialized. This
// module therefore
//   - receives under the episode's abort signal (an episode another owner
//     claims abandons its receive, typed);
//   - asks the episode for admission BEFORE the shutdown (after the receive,
//     whose duration the lifecycle may have moved in): a refusal, an
//     unobservable lifecycle or a claimed episode is RECREATE_NOT_ADMITTED
//     with the replica untouched and running;
//   - runs the shutdown and the install as the episode's steps, each only
//     while the episode's custody is still held, and presents that custody
//     to the installer, which requires it at the swap;
//   - on EVERY path after the shutdown step hands the stopped replica back
//     to the episode exactly once. That never throws: it answers the replica
//     running, still pending under the owner's own retry, or released to the
//     owner that claimed it. The database it reopens is the one the install
//     left: the installed image when the swap completed, the old state when
//     it did not (the S2 marker is resolved at open).
// This module never mutates a replica registry and never opens a service.

import {
  RAFT_SNAPSHOT_CATCHUP_INSTALL_OUTCOME as OUTCOME,
  RAFT_SNAPSHOT_RECREATION_STATE as RECREATION,
} from './snapshot-catchup-constants.js';
import {requestSnapshotInstall} from './snapshot-install.js';
import {RAFT_SNAPSHOT_INSTALL_OUTCOME} from './snapshot-install-constants.js';
import {
  RAFT_SNAPSHOT_TRANSFER_OUTCOME,
} from './snapshot-transfer-constants.js';
import {receiveSnapshotTransfer} from './snapshot-transfer.js';

// The steps between the shutdown and the recreation, as the result names the
// one that did not complete.
const STEP_COMPLETED = 'completed';
const STEP_THREW = 'threw';
// The install step of a replica whose shutdown threw, or whose episode was
// claimed during the shutdown: never asked.
const INSTALL_NOT_ATTEMPTED = Object.freeze({step: 'not_attempted'});
// The admission of an episode another owner claimed before the shutdown.
const EPISODE_CLAIMED_ADMISSION = Object.freeze({admitted: false,
  reason: 'episode_claimed'});

function orchestrationResult(outcome, extra = {}) {
  return Object.freeze({outcome, ...extra});
}

function stepCompleted(fields = {}) {
  return {step: STEP_COMPLETED, ...fields};
}

function stepThrew(error) {
  return {step: STEP_THREW, detail: error.message};
}

async function shutDownForInstall(service) {
  try {
    await service.shutdown();
  } catch (error) {
    return stepThrew(error);
  }
  return stepCompleted();
}

// The install of the received generation under the identity read now (the
// receive read it at accept and at completion; it may have moved since).
async function installReceivedGeneration(service, receiveOptions, transfer,
  custody) {
  try {
    return stepCompleted({install: await requestSnapshotInstall({
      replicaDbPath: service.dbPath,
      checkpointsRoot: receiveOptions.checkpointsRoot,
      generationIndex: transfer.descriptor.lastIncludedIndex,
      expectedIdentity: receiveOptions.expectedIdentity(),
      expectedReplicaIdentity: service.replicaId,
      custody,
    })});
  } catch (error) {
    return stepThrew(error);
  }
}

// What the stopped replica's episode was, once its recreation answered.
function settledOutcome(stopped, installed, recreation) {
  if (stopped.step === STEP_THREW) {
    return orchestrationResult(OUTCOME.SHUTDOWN_FAILED,
      {detail: stopped.detail, recreation});
  }
  if (installed.step === STEP_THREW) {
    return orchestrationResult(OUTCOME.INSTALL_FAULTED,
      {detail: installed.detail, recreation});
  }
  if (installed === INSTALL_NOT_ATTEMPTED) {
    return orchestrationResult(OUTCOME.RECREATE_RELEASED, {recreation});
  }
  if (installed.install.outcome !== RAFT_SNAPSHOT_INSTALL_OUTCOME.INSTALLED) {
    return orchestrationResult(OUTCOME.INSTALL_REJECTED,
      {install: installed.install, recreation});
  }
  if (recreation.state === RECREATION.RUNNING) {
    return orchestrationResult(OUTCOME.INSTALLED_AND_RECREATED,
      {install: installed.install, recreation, service: recreation.service});
  }
  return orchestrationResult(recreation.state === RECREATION.PENDING ?
    OUTCOME.RECREATE_PENDING : OUTCOME.RECREATE_RELEASED,
  {install: installed.install, recreation});
}

/**
 * Receive the offered generation, stop the running service, install, and
 * hand the stopped replica back to its install episode.
 * @param {Object} options orchestration request
 * @param {Object} options.service the running (compacted-behind) service
 * @param {Object} options.receiveOptions receiveSnapshotTransfer options
 *   ({socket, checkpointsRoot, expectedIdentity, ...}); expectedIdentity is
 *   the function form, read again for the install
 * @param {Object} options.recreation the install episode's seam for this
 *   service: signal (aborts the receive); custody ({isHeld()}, presented to
 *   the installer); async admit(descriptor) -> {admitted: boolean, ...}
 *   decided before the shutdown for the received image; receiveFailed();
 *   step(run) -> run()'s promise, registered as the episode's step in
 *   flight; async recreate(), which never throws and answers
 *   {state: RAFT_SNAPSHOT_RECREATION_STATE, service?}
 * @param {Function} [options.onTransferEnded] told the receive's result
 * @return {Promise<Object>} typed frozen orchestration result
 */
async function orchestrateSnapshotCatchupInstall(options) {
  const {service, receiveOptions, recreation} = options;
  const {custody} = recreation;
  const transfer = await receiveSnapshotTransfer(
    {...receiveOptions, signal: recreation.signal});
  options.onTransferEnded?.(transfer);
  if (transfer.outcome !== RAFT_SNAPSHOT_TRANSFER_OUTCOME.COMPLETED) {
    recreation.receiveFailed();
    return orchestrationResult(OUTCOME.RECEIVE_FAILED, {transfer});
  }
  const admission = await recreation.admit(transfer.descriptor);
  // Admitted, and still the episode's when this turn resumed: the shutdown
  // starts in the same synchronous step as that check.
  if (admission.admitted !== true || custody.isHeld() !== true) {
    return orchestrationResult(OUTCOME.RECREATE_NOT_ADMITTED, {transfer,
      admission: admission.admitted === true ?
        EPISODE_CLAIMED_ADMISSION : admission});
  }
  const stopped = await recreation.step(() => shutDownForInstall(service));
  const installed = stopped.step === STEP_COMPLETED && custody.isHeld() === true ?
    await recreation.step(() => installReceivedGeneration(
      service, receiveOptions, transfer, custody)) :
    INSTALL_NOT_ATTEMPTED;
  const result = settledOutcome(stopped, installed, await recreation.recreate());
  return Object.freeze({...result, transfer});
}

export {orchestrateSnapshotCatchupInstall};

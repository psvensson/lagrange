// Original seed startup is an interaction of the existing bootstrap,
// membership, directory-custody and allocation-preparation owners.
import {runtimeBuildProvenance, RUNTIME_BUILD_STATE} from
  '../diagnostics/runtime-build-provenance.js';
import {RaftRsOriginalAllocationPreparation} from
  '../raft/raft-rs-original-allocation-preparation.js';
import {ORIGINAL_ALLOCATION as STATE, ORIGINAL_ALLOCATION_REASON as REASON,
  originalAllocationError} from '../raft/raft-rs-original-allocation-constants.js';
import {isFreshSeedMembershipOutcome} from './rejoin-hints-constants.js';
import {createSeedOriginalAllocation, originalSeedAnchor} from
  './seed-original-allocation-declaration.js';

const ABORT_EVENT = 'abort';

function retainedClassificationHold(preparation, declaration) {
  let observations;
  try {
    observations = preparation.observeRetainedEffects(declaration);
  } catch (cause) {
    // Preserve the exact inspection error, including its primary/cleanup
    // aggregate. Preparation retains any handle whose close failed.
    return originalAllocationError(REASON.CLASSIFICATION_UNAVAILABLE, null, cause);
  }
  // Observations are not replay/opening authority. R1/R2 exclusions and
  // recipient/source correspondence still require their composed proof.
  return originalAllocationError(REASON.CLASSIFICATION_UNAVAILABLE, observations);
}

function assertStartupStillOwnsAttempt(service) {
  if (service.isShuttingDown === true || service.startupAbortSignal?.aborted === true) {
    throw originalAllocationError(REASON.CLOSED);
  }
}

function assertOriginalSeedAttempt(service) {
  assertStartupStillOwnsAttempt(service);
  if (!service.originalAllocationPreparation) throw originalAllocationError(REASON.AUTHORITY);
  service.originalAllocationPreparation.assertCurrent();
}

async function initializeOriginalSeedAttempt(service) {
  // Build measurement acquires no original member. After this await, all
  // allocation inspection/issuance is synchronous in the preparation owner.
  const build = await runtimeBuildProvenance();
  assertStartupStillOwnsAttempt(service);
  if (build.state !== RUNTIME_BUILD_STATE.MEASURED) {
    throw originalAllocationError(REASON.OBSERVATION, build.reason);
  }
  const dataDir = service.dataDirectoryManager.getDataDir();
  const preparation = new RaftRsOriginalAllocationPreparation({
    directoryOwner: service.dataDirectoryProcessOwner,
    dataDir, nodeId: service.nodeId, buildDigest: build.digest,
  });
  // Publish custody before the first inspection/preparation acquisition.
  service.originalAllocationPreparation = preparation;
  const signal = service.startupAbortSignal;
  const revoke = () => preparation.revoke();
  signal?.addEventListener(ABORT_EVENT, revoke, {once: true});
  service.detachOriginalAllocationAbort = () =>
    signal?.removeEventListener(ABORT_EVENT, revoke);
  try {
    assertStartupStillOwnsAttempt(service);
    const retained = preparation.readDeclaration(originalSeedAnchor(dataDir));
    if (retained.state === STATE.PRESENT) {
      throw retainedClassificationHold(preparation, retained.declaration);
    }
    if (!isFreshSeedMembershipOutcome(service.membershipOwnerOutcome)) {
      throw originalAllocationError(REASON.AUTHORITY);
    }
    preparation.prepare(createSeedOriginalAllocation({dataDir,
      nodeId: service.nodeId, buildDigest: build.digest,
      now: service.nodeService.getTimeSource().now()}));
  } catch (error) {
    preparation.revoke();
    throw error;
  }
}

function prepareOriginalSeedAttempt(service) {
  assertStartupStillOwnsAttempt(service);
  service.originalAllocationPreparation?.assertCurrent();
  if (service.originalAllocationInitialization) return service.originalAllocationInitialization;
  const {promise, resolve, reject} = Promise.withResolvers();
  service.originalAllocationInitialization = promise;
  initializeOriginalSeedAttempt(service).then(resolve, reject);
  return promise;
}

function admitOriginalSeedReplica(service, options) {
  assertOriginalSeedAttempt(service);
  return service.originalAllocationPreparation.admitReplica(options);
}

function revokeOriginalSeedAttempt(service) {
  service.originalAllocationPreparation?.revoke();
}

function closeOriginalSeedAttempt(service) {
  revokeOriginalSeedAttempt(service);
  service.detachOriginalAllocationAbort?.();
  // A failed exact close stays reachable in preparation custody, and rejects
  // startup cleanup so the existing ledger retains the directory custodian.
  service.originalAllocationPreparation?.close();
}

function assertOriginalSeedContinuation(service, replicaId = undefined) {
  assertOriginalSeedAttempt(service);
  return service.originalAllocationPreparation.assertContinuation(replicaId);
}

function assertOriginalSeedPublicAdmission(service) {
  assertOriginalSeedAttempt(service);
  return service.originalAllocationPreparation.assertPublicAdmission();
}

export {prepareOriginalSeedAttempt, assertOriginalSeedAttempt, admitOriginalSeedReplica,
  revokeOriginalSeedAttempt, closeOriginalSeedAttempt, assertOriginalSeedContinuation,
  assertOriginalSeedPublicAdmission};

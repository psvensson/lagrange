import {
  FORMATION_RELEASE_HANDOFF_NO_CONTRACT,
  buildFormationReleaseHandoffPublicationRow,
  readDurableFormationReleaseHandoffPublicationRow,
  readFormationReleaseHandoffPublicationRow,
} from './formation-release-handoff-publication.js';
import {formationReleaseContractsEqual} from './formation-release-handoff-identity.js';
import {
  PUBLICATION_WRITE_OUTCOME,
  isPublicationWriteSettled,
} from './owners/control-plane-publication-change.js';

const promiseResolve = Promise.resolve.bind(Promise);
const stringConstructor = String;

const ERROR_STORAGE_OWNER_UNAVAILABLE =
  'formation release publication storage owner unavailable';
const ERROR_WRITE_NOT_SETTLED =
  'formation release publication write not settled';
const ERROR_READBACK_MISMATCH =
  'formation release publication readback did not match intent';
const LOG_PUBLICATION_DEFERRED =
  'Formation release handoff publication deferred';

function requireStorageOwner(storageOwner) {
  if (!storageOwner) {
    throw new Error(ERROR_STORAGE_OWNER_UNAVAILABLE);
  }
  return storageOwner;
}

// The handoff row is this authority's whole statement: admitted when the
// authority has no row yet, else replaced as a change of the durable row
// (a function of its stored revision). Landed means the publications owner
// confirmed it.
async function writeDesiredRow(storageOwner, desired) {
  const admission = await storageOwner.admitPublication(desired.row);
  if (admission.outcome !== PUBLICATION_WRITE_OUTCOME.ALREADY_APPLIED) {
    return admission;
  }
  return storageOwner.applyPublicationChange(
    desired.row.publication_id,
    () => desired.row,
  );
}

async function readBackDurableContract(storageOwner, desired) {
  // The acknowledgement readback is bound to the durable store (the single
  // source of truth); the read option lives in the publication module so this
  // owner's authority path never names the cache lexeme (system-guidelines §3).
  return readDurableFormationReleaseHandoffPublicationRow(
    storageOwner,
    desired.contract.authorityNodeId,
    desired.contract.authorityBootIncarnation,
  );
}

class FormationReleaseHandoffPublicationCoordinator {
  constructor(options = {}) {
    this.getStorageOwner =
      typeof options.getStorageOwner === 'function' ?
        options.getStorageOwner :
        () => null;
    this.onDurable =
      typeof options.onDurable === 'function' ?
        options.onDurable :
        () => {};
    this.onRearm =
      typeof options.onRearm === 'function' ?
        options.onRearm :
        () => {};
    this.logger = options.logger || null;
    this.pendingDesired = null;
    this.inFlightDesired = null;
    this.inFlightPromise = null;
    this.lastDurableContract = null;
    this.shutdownRequested = false;
    this.coalescedCount = 0;
    this.writeCount = 0;
    this.writeFailureCount = 0;
  }

  offer(contract, observedAt) {
    const row = buildFormationReleaseHandoffPublicationRow(
      contract,
      observedAt,
    );
    if (row === FORMATION_RELEASE_HANDOFF_NO_CONTRACT || this.shutdownRequested) {
      return false;
    }
    const authorizedContract = readFormationReleaseHandoffPublicationRow(
      row,
      contract.authorityNodeId,
      contract.authorityBootIncarnation,
    );
    if (authorizedContract === FORMATION_RELEASE_HANDOFF_NO_CONTRACT) {
      return false;
    }
    if (
      formationReleaseContractsEqual(
        authorizedContract,
        this.lastDurableContract,
      ) ||
      formationReleaseContractsEqual(
        authorizedContract,
        this.pendingDesired?.contract,
      ) ||
      formationReleaseContractsEqual(
        authorizedContract,
        this.inFlightDesired?.contract,
      )
    ) {
      return false;
    }
    if (this.pendingDesired) {
      this.coalescedCount += 1;
    }
    this.pendingDesired = {contract: authorizedContract, row};
    this.startNext();
    return true;
  }

  startNext() {
    if (
      this.shutdownRequested ||
      this.inFlightDesired ||
      !this.pendingDesired
    ) {
      return;
    }
    const desired = this.pendingDesired;
    this.pendingDesired = null;
    this.inFlightDesired = desired;
    this.inFlightPromise = this.persistAndAcknowledge(desired);
  }

  async persistAndAcknowledge(desired) {
    try {
      const storageOwner = requireStorageOwner(this.getStorageOwner());
      const written = await writeDesiredRow(storageOwner, desired);
      if (!isPublicationWriteSettled(written)) {
        throw new Error(`${ERROR_WRITE_NOT_SETTLED}: ${written.outcome}` +
          `/${written.reason}`);
      }
      this.writeCount += 1;
      const durableContract = await readBackDurableContract(
        storageOwner,
        desired,
      );
      if (
        durableContract === FORMATION_RELEASE_HANDOFF_NO_CONTRACT ||
        !formationReleaseContractsEqual(durableContract, desired.contract)
      ) {
        throw new Error(ERROR_READBACK_MISMATCH);
      }
      if (this.shutdownRequested) return;
      this.lastDurableContract = durableContract;
      this.onDurable(durableContract);
      this.onRearm(durableContract);
    } catch (error) {
      this.writeFailureCount += 1;
      this.logger?.warn?.(
        LOG_PUBLICATION_DEFERRED,
        {
          generation: desired.contract?.generation || null,
          error: error?.message || stringConstructor(error),
        },
      );
    } finally {
      this.inFlightDesired = null;
      this.inFlightPromise = null;
      this.startNext();
    }
  }

  async whenIdle() {
    while (this.inFlightPromise) {
      await this.inFlightPromise;
    }
    return promiseResolve();
  }

  shutdown() {
    this.shutdownRequested = true;
    this.pendingDesired = null;
  }

  getDiagnostics() {
    return {
      inFlight: this.inFlightDesired !== null,
      pending: this.pendingDesired !== null,
      retainedRequestCount:
        (this.inFlightDesired ? 1 : 0) + (this.pendingDesired ? 1 : 0),
      coalescedCount: this.coalescedCount,
      writeCount: this.writeCount,
      writeFailureCount: this.writeFailureCount,
      shutdownRequested: this.shutdownRequested,
    };
  }
}

export {
  FormationReleaseHandoffPublicationCoordinator,
};

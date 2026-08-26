import {
  buildFormationReleaseHandoffPublicationRow,
  formationReleaseHandoffPublicationId,
  readFormationReleaseHandoffPublicationRow,
} from './formation-release-handoff-publication.js';
import {formationReleaseContractsEqual} from './formation-release-handoff-identity.js';

const promiseResolve = Promise.resolve.bind(Promise);
const stringConstructor = String;

function requireStorageOwner(storageOwner) {
  if (typeof storageOwner?.upsertPublication !== 'function') {
    throw new Error('formation release publication storage owner unavailable');
  }
  if (typeof storageOwner.getPublication !== 'function') {
    throw new Error('formation release publication storage owner unavailable');
  }
  return storageOwner;
}

async function readBackDurableContract(storageOwner, desired) {
  const publicationId = formationReleaseHandoffPublicationId(
    desired.contract.authorityNodeId,
    desired.contract.authorityBootIncarnation,
  );
  const durableRow = await storageOwner.getPublication(
    publicationId,
    {skipCacheWait: true},
  );
  return readFormationReleaseHandoffPublicationRow(
    durableRow,
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
    if (!row || this.shutdownRequested) {
      return false;
    }
    const authorizedContract = readFormationReleaseHandoffPublicationRow(
      row,
      contract.authorityNodeId,
      contract.authorityBootIncarnation,
    );
    if (!authorizedContract) return false;
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
      await storageOwner.upsertPublication(desired.row, {
        skipCacheWait: true,
      });
      this.writeCount += 1;
      const durableContract = await readBackDurableContract(
        storageOwner,
        desired,
      );
      if (
        !durableContract ||
        !formationReleaseContractsEqual(durableContract, desired.contract)
      ) {
        throw new Error(
          'formation release publication readback did not match intent',
        );
      }
      if (this.shutdownRequested) return;
      this.lastDurableContract = durableContract;
      this.onDurable(durableContract);
      this.onRearm(durableContract);
    } catch (error) {
      this.writeFailureCount += 1;
      this.logger?.warn?.(
        'Formation release handoff publication deferred',
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

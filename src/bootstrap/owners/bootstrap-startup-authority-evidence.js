import {BOOTSTRAP_API_RESPONSE_FIELD} from '../bootstrap-api-constants.js';

function isStartupAuthoritySnapshot(value) {
  return Boolean(value && typeof value === 'object');
}

function isUsableStartupAuthoritySnapshot(value) {
  return isStartupAuthoritySnapshot(value) && value.authorityAvailable === true;
}

function selectStartupAuthoritySnapshot(localStartupAuthority, seedContact) {
  if (isUsableStartupAuthoritySnapshot(localStartupAuthority)) {
    return localStartupAuthority;
  }
  if (isStartupAuthoritySnapshot(seedContact)) {
    return seedContact;
  }
  return isStartupAuthoritySnapshot(localStartupAuthority) ?
    localStartupAuthority :
    null;
}

const BOOTSTRAP_STARTUP_AUTHORITY_EVIDENCE_METHODS = Object.freeze({
  getSeedContactStartupAuthoritySnapshot() {
    const bootstrapService = this.getBootstrapService();
    const bootstrapResponse = bootstrapService?.bootstrapResponse || null;
    const startupAuthority =
      bootstrapResponse?.[BOOTSTRAP_API_RESPONSE_FIELD.STARTUP_AUTHORITY] ||
      bootstrapService?.getSeedContactStartupAuthoritySnapshot?.() ||
      bootstrapService?.seedContactStartupAuthority ||
      null;
    return isStartupAuthoritySnapshot(startupAuthority) ?
      startupAuthority :
      null;
  },
  resolveLocalStartupAuthoritySnapshot(service, observedAt) {
    if (typeof service.getStartupAuthoritySnapshotSync === 'function') {
      return service.getStartupAuthoritySnapshotSync(
        this.getSeedNodeId(),
        observedAt,
      );
    }
    if (typeof service.getStartupAuthoritySnapshot !== 'function') {
      return null;
    }
    const localStartupAuthority = service.getStartupAuthoritySnapshot(
      this.getSeedNodeId(),
      observedAt,
    );
    return localStartupAuthority &&
      typeof localStartupAuthority.then === 'function' ?
      null :
      localStartupAuthority;
  },
  getStartupAuthoritySnapshot(observedAt = Date.now()) {
    const seedContactStartupAuthority =
      this.getSeedContactStartupAuthoritySnapshot();
    const service = this.getControlPlaneReadinessService();
    if (!service || typeof service !== 'object') {
      return seedContactStartupAuthority;
    }
    try {
      const localStartupAuthority = this.resolveLocalStartupAuthoritySnapshot(
        service,
        observedAt,
      );
      return selectStartupAuthoritySnapshot(
        localStartupAuthority,
        seedContactStartupAuthority,
      );
    } catch (_error) {
      return seedContactStartupAuthority;
    }
  },
});

function assignBootstrapStartupAuthorityEvidenceMethods(ownerClass) {
  Object.defineProperties(
    ownerClass.prototype,
    Object.fromEntries(
      Object.entries(BOOTSTRAP_STARTUP_AUTHORITY_EVIDENCE_METHODS).map(
        ([name, value]) => [
          name,
          {
            configurable: true,
            value,
            writable: true,
          },
        ],
      ),
    ),
  );
}

export {
  assignBootstrapStartupAuthorityEvidenceMethods,
  isStartupAuthoritySnapshot,
  isUsableStartupAuthoritySnapshot,
  selectStartupAuthoritySnapshot,
};

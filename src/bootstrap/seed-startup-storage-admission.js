import {readDurableServicesIdentitySnapshot} from
  './rejoin-hints-durable-evidence.js';
import {DURABLE_EVIDENCE_STATE} from './rejoin-hints-constants.js';

const SEED_SERVICES_IDENTITY_CONFLICT_MSG =
  'Seed startup services identity is unreadable or conflicting';

async function readSeedStartupStorageAdmission(
  dataDir,
  awaitStartupAcquisition,
  signal,
) {
  const admission = await awaitStartupAcquisition(
    readDurableServicesIdentitySnapshot(dataDir),
    signal,
  );
  if (admission.state === DURABLE_EVIDENCE_STATE.UNREADABLE ||
      admission.conflicting === true) {
    throw new Error(SEED_SERVICES_IDENTITY_CONFLICT_MSG);
  }
  return admission;
}

export {readSeedStartupStorageAdmission};

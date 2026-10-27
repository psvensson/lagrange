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

/**
 * Whether the seed's durable services rows prove that a founder replica
 * identity existed on this node before (the open-time rule, 2026-10-05).
 * The seed registers its founders' SERVICES rows only after each founder
 * opened its group (seed-registration-phase registerServices runs over the
 * services the partitions and message-groups phases created), so a row for
 * this replica on this node in the startup admission is an earlier
 * incarnation's: it opened its raft record. A first boot reads an empty
 * admission and proves nothing; an absent row proves nothing either.
 * @param {Object|null} admission - The startup services admission.
 * @param {string} replicaId - The founder's replica identity.
 * @param {string} nodeId - This node.
 * @return {boolean}
 */
function seedReplicaIdentityExisted(admission, replicaId, nodeId) {
  if (admission?.empty === true || !Array.isArray(admission?.rows)) {
    return false;
  }
  return admission.rows.some((row) => row?.service_id === replicaId &&
    row?.node_id === nodeId);
}

export {readSeedStartupStorageAdmission, seedReplicaIdentityExisted};

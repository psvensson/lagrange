import {readLog} from '../solve/store.js';
import {readMaterializedEvidence} from '../solve/evidence-store.js';
import {OBSERVATION_SCHEMA} from './evidence-contract.js';

const REFUSAL = Object.freeze({
  STORE_REFERENCE_INVALID: 'tooling_store_reference_invalid',
  VERIFIED_STORE_RECORD_MISSING_OR_AMBIGUOUS: 'tooling_verified_store_record_missing_or_ambiguous',
  OBSERVATION_IDENTITY_MISMATCH: 'tooling_observation_identity_mismatch',
});


function verifiedStoreRecord(root, reference) {
  if (!/^[a-z0-9][a-z0-9-]+$/u.test(reference.quest) ||
    !/^[0-9a-f]{64}$/u.test(reference.sha256)) throw new Error(REFUSAL.STORE_REFERENCE_INVALID);
  const records = readLog(root, reference.quest).filter((entry) =>
    entry.type === 'finding' && entry.kind === 'evidence' &&
    entry.evidence === `sha256:${reference.sha256}` && entry.asset === reference.asset &&
    entry.bytes === reference.bytes);
  if (records.length !== 1) throw new Error(REFUSAL.VERIFIED_STORE_RECORD_MISSING_OR_AMBIGUOUS);
  const entry = records[0];
  return {sha256: reference.sha256, bytes: entry.bytes, asset: entry.asset, url: entry.url};
}

function readObservation(root, reference) {
  const observation = JSON.parse(readRetainedObject(root, reference));
  if (observation.schema !== OBSERVATION_SCHEMA ||
    observation.id !== reference.id) throw new Error(REFUSAL.OBSERVATION_IDENTITY_MISMATCH);
  return observation;
}

function readRetainedObject(root, reference) {
  return readMaterializedEvidence(root, verifiedStoreRecord(root, reference));
}

export {readObservation, readRetainedObject, verifiedStoreRecord};

// Forensic reader for retained raw observation campaigns of the withdrawn v1
// schema (data/tidb-comparison/raw-observations.ndjson before 2026-11-01 and
// data/tidb-comparison/forensic/*.ndjson). It exists for the offline
// recomputation check only: it proves every retained line is a well-formed v1
// record whose stored digest matches its payload. Publication never imports it
// (asserted by the import-graph test in benchmark-claim-admission.test.js), and
// nothing it reads becomes a published value.
import {createHash} from 'node:crypto';

import {RAW_OBSERVATION_SCHEMA} from './raw-observation-record.js';

const arrayForEach = Function.call.bind(Array.prototype.forEach);
const arrayMap = Function.call.bind(Array.prototype.map);
const stringSplit = Function.call.bind(String.prototype.split);
const stringTrim = Function.call.bind(String.prototype.trim);
const jsonParse = JSON.parse;
const jsonStringify = JSON.stringify;

const FORENSIC_SCHEMA = Object.freeze({
  V1_RUN: 'lagrange-raw-observation-v1',
  V1_CAMPAIGN: 'lagrange-raw-observation-campaign-v1',
});

function computeV1PayloadDigest(payload) {
  const hex = createHash('sha256').update(jsonStringify(payload), 'utf8').digest('hex');
  return `sha256:${hex}`;
}

/**
 * Verify every retained (non-v2) line of a raw observation file.
 * @param {string} text
 * @param {string} file
 * @return {{headers: number, records: number}}
 */
function verifyRetainedRawObservationText(text, file) {
  const counts = {headers: 0, records: 0};
  arrayForEach(arrayMap(stringSplit(text, '\n'), (l) => stringTrim(l)), (line, idx) => {
    if (line === '') return;
    const parsed = jsonParse(line);
    const at = `${file}:${idx + 1}`;
    if (parsed.schemaVersion === RAW_OBSERVATION_SCHEMA.V2) return;
    if (parsed.schemaVersion === FORENSIC_SCHEMA.V1_CAMPAIGN) {
      counts.headers += 1;
    } else if (parsed.schemaVersion === FORENSIC_SCHEMA.V1_RUN) {
      if (computeV1PayloadDigest(parsed.rawObservationPayload) !== parsed.rawObservationsDigest) {
        throw new Error(`digest-mismatch: forensic record ${at} (${parsed.receiptId})`);
      }
      counts.records += 1;
    } else {
      throw new Error(`unknown-schema: ${at} has schema ${parsed.schemaVersion}`);
    }
  });
  return counts;
}

export {computeV1PayloadDigest, verifyRetainedRawObservationText};

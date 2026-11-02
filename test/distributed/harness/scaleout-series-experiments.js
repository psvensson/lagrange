// Writes the admitted measurements (one admission cell per advertised claim) to
// data/tidb-comparison/admitted-lab-measurements.json. The file is derived
// material: every reader recomputes it from the raw observation store, and the
// offline recomputation check fails when the file differs from the derivation.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  DEFAULT_ADMITTED_LAB_MEASUREMENTS_PATH,
  deriveAdmittedMeasurementsFromRawObservations,
  serializeAdmittedMeasurements,
} from './raw-observation-store.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export function writeAdmittedLabMeasurementsFromRawObservations(rootDir = REPO_ROOT) {
  const derived = deriveAdmittedMeasurementsFromRawObservations(rootDir);
  const filePath = path.resolve(rootDir, DEFAULT_ADMITTED_LAB_MEASUREMENTS_PATH);
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, serializeAdmittedMeasurements(derived), 'utf8');
  return {derived, filePath};
}

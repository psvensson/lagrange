// The simulator's cost coefficients: virtual microseconds per owner turn
// segment on the seed, read from the committed calibration file. The
// generic cost table charges zero for an unknown key, so the runner
// validates every required owner here and refuses to start otherwise
// (formation-sim quest, constraint calibrated-or-refused).

import fs from 'node:fs';
import path from 'node:path';

import {FORMATION_OWNER} from '../../src/diagnostics/formation-diagnostics-contract.js';
import {createCostTable} from '../distributed/harness/cost-table.js';

const CALIBRATION_FILE = 'test/simulation/calibration/formation-seed-2026-09-13.json';
const OWNER_KEY_PREFIX = 'owner:';
const MICROSECONDS_PER_MILLISECOND = 1000;
const TEXT_ENCODING = 'utf8';
const SHA256_HEX_LENGTH = 64;

const REFUSAL = Object.freeze({
  MISSING: 'calibration_missing',
  INVALID: 'calibration_invalid',
  SOURCE_UNBOUND: 'calibration_source_unbound',
  SUPERSEDED: 'calibration_superseded',
  UNCALIBRATED_OWNER: 'uncalibrated_owner',
});

const SUPERSEDED = 'superseded';

const REQUIRED_OWNERS = Object.freeze(Object.values(FORMATION_OWNER)
  .filter((owner) => owner !== FORMATION_OWNER.UNATTRIBUTED));

class CalibrationRefusal extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.code = code;
  }
}

function ownerKey(owner) {
  return `${OWNER_KEY_PREFIX}${owner}`;
}

// A calibration measured under different attribution semantics is not a
// calibration for these ones. The run itself stays valid historical evidence;
// what lapses is the QUANTITATIVE correspondence, because work it measured as
// unattributed is measured as its owner now. A caller may still read such a
// file, but only by saying in one sentence what it is using it for - so that
// consuming it is a visible decision rather than a default.
function validateSupersession(parsed, acknowledgement) {
  if (parsed?.supersession?.quantitativeCorrespondence !== SUPERSEDED) return;
  if (typeof acknowledgement === 'string' && acknowledgement.length > 0) return;
  throw new CalibrationRefusal(REFUSAL.SUPERSEDED,
    `${parsed.supersession.reason}; replacement: ` +
    `${parsed.supersession.replacement}`);
}

function validateProvenance(source) {
  const digest = source?.report?.sha256;
  if (typeof digest !== 'string' || digest.length !== SHA256_HEX_LENGTH ||
    typeof source?.head !== 'string' || typeof source?.evidence !== 'string') {
    throw new CalibrationRefusal(REFUSAL.SOURCE_UNBOUND,
      'source must name head, evidence path and the report sha256');
  }
}

// An owner the calibration never observed has no measured mean: the run
// divided no duration by no segments, and the 0 the file carries is that
// absence, not a cost (owner amendment 1, 2026-09-14). Such an owner is
// calibrated-active: false, its usPerSegment is null rather than 0, and
// charging a segment to it fails closed rather than costing nothing.
function validateOwner(owner, entry) {
  const cost = Number(entry?.usPerSegment);
  const rate = Number(entry?.segmentsPerSecond);
  const observedSegments = Number(entry?.segments);
  if (!Number.isFinite(cost) || cost < 0 || !Number.isFinite(rate) || rate < 0 ||
    !Number.isFinite(observedSegments) || observedSegments < 0) {
    throw new CalibrationRefusal(REFUSAL.INVALID,
      `${owner} needs non-negative usPerSegment, segmentsPerSecond and segments`);
  }
  if (observedSegments === 0) {
    return Object.freeze({owner, calibrated: false, usPerSegment: null,
      segmentsPerSecond: null, observedSegments});
  }
  if (cost === 0) {
    throw new CalibrationRefusal(REFUSAL.INVALID,
      `${owner} was observed ${observedSegments} times with a zero mean segment`);
  }
  return Object.freeze({owner, calibrated: true, usPerSegment: cost,
    segmentsPerSecond: rate, observedSegments});
}

/**
 * Load and validate the calibration file.
 * @param {string} root repository root
 * @param {string} [relativePath]
 * @param {string} [acknowledgeSuperseded] - what a superseded calibration is
 *   being used for, when it is being used at all.
 * @returns {{file: string, owners: Object, source: Object, costTable: Object}}
 */
function loadCalibration(root, relativePath = CALIBRATION_FILE,
  acknowledgeSuperseded = null) {
  const file = path.join(root, relativePath);
  if (!fs.existsSync(file)) {
    throw new CalibrationRefusal(REFUSAL.MISSING, `no calibration at ${relativePath}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, TEXT_ENCODING));
  } catch (error) {
    throw new CalibrationRefusal(REFUSAL.INVALID, `unreadable: ${error.message}`);
  }
  validateSupersession(parsed, acknowledgeSuperseded);
  validateProvenance(parsed.source);
  const owners = {};
  const spec = {};
  for (const owner of REQUIRED_OWNERS) {
    const validated = validateOwner(owner, parsed.owners?.[owner]);
    owners[owner] = validated;
    // An observed-inactive owner gets no cost-table entry at all. The generic
    // table charges an unknown key zero, which is why nothing may reach it:
    // the charger refuses the segment before the table is consulted.
    if (!validated.calibrated) continue;
    spec[ownerKey(owner)] = {
      fixedMs: 0,
      perUnitMs: validated.usPerSegment / MICROSECONDS_PER_MILLISECOND,
    };
  }
  return Object.freeze({
    file: relativePath,
    source: parsed.source,
    status: parsed.status ?? null,
    supersession: parsed.supersession ?? null,
    // The share of the calibration window no owner claimed. It is carried as
    // an uncertainty band and never given a cost (owner amendment 7).
    residualPercent: Number(parsed.window?.unattributedPercent),
    owners: Object.freeze(owners),
    costTable: createCostTable(spec),
  });
}

export {
  CalibrationRefusal,
  REFUSAL,
  REQUIRED_OWNERS,
  loadCalibration,
  ownerKey,
};

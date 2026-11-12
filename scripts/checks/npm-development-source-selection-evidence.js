#!/usr/bin/env node
// Pure retained-evidence probe. It never imports the producer or examines bulky artifacts.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const BASE = 'fa70987b2833031ffe6054a9b12ee86bbb71d52c';
const CEILING = Object.freeze({packageBudget: 'NOT_SOLVED', nativeCopyIntegration: 'NOT_MEASURED',
  installedRuntime: 'NOT_MEASURED', workers: 'NOT_MEASURED', identity: 'NOT_MEASURED',
  provenance: 'NOT_MEASURED', operationalAcceptance: 'NOT_MEASURED', release: 'NOT_MEASURED'});
const CANDIDATE_PATHS = Object.freeze(['package.json', 'scripts/release-npm-package.js',
  'scripts/npm-package-source-selection.js', 'scripts/checks/npm-development-source-selection-evidence.js',
  'test/scripts/release-npm-package.test.js',
  'solve/quests/npm-development-source-selection/quest.json'].sort());
const WITNESSES = Object.freeze(['W1', 'W2', 'W3', 'W4', 'W5', 'W6']);
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const isHash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
export function selectionMeasurementDigest(packet) {
  const {review: _review, ...measurement} = packet;
  return digest(measurement);
}
function checkCandidate(packet, check) {
  check(Array.isArray(packet.candidate) && packet.candidate.length === CANDIDATE_PATHS.length,
    'candidate-files');
  check(digest(packet.candidate.map((row) => row.path).sort()) === digest(CANDIDATE_PATHS),
    'exact-candidate-paths');
  check(digest(packet.candidate) === packet.candidateDigest, 'candidate-binding');
  check(packet.candidate.every((row) => typeof row.path === 'string' && isHash(row.sha256)),
    'candidate-bytes');
  check(Array.isArray(packet.artifacts) && packet.artifacts.length > 0, 'artifact-files');
  check(digest(packet.artifacts) === packet.artifactsDigest, 'artifact-binding');
  check(packet.artifacts.every((row) => typeof row.path === 'string' && isHash(row.sha256)),
    'artifact-bytes');
}
function checkWitnesses(packet, check) {
  for (const name of WITNESSES) {
    const witness = packet.witnesses[name];
    check(witness.passed === true && isHash(witness.evidenceDigest), `witness:${name}`);
  }
  check(packet.behaviorRed.observed === true &&
    packet.behaviorRed.assertion === 'production development-source pair must be excluded from actual tar',
  'behavioral-red');
  check(isHash(packet.behaviorRed.tarSha256) && isHash(packet.behaviorRed.evidenceDigest),
    'behavioral-red-binding');
}
function checkMeasuredPacks(packet, check) {
  for (const name of ['current', 'corrected']) {
    const pack = packet.packs[name];
    check(isHash(pack.tarSha256) && isHash(pack.sourceFingerprint), `pack-binding:${name}`);
    check(['entries', 'packed', 'unpacked'].every((key) =>
      Number.isSafeInteger(pack[key]) && pack[key] > 0), `pack-measurements:${name}`);
    check(pack.developmentSourcesAbsent === true && pack.retainedBodiesVerified === true,
      `pack-selection:${name}`);
  }
  check(packet.packs.current.sourceFingerprint === packet.packs.corrected.sourceFingerprint,
    'same-process-correction');
}
function checkReview(packet, check) {
  check(packet.review !== null, 'independent-review-absent');
  if (packet.review === null) return;
  const review = packet.review;
  check(review.verdict === 'approve' && review.verifier.startsWith('subagent:'),
    'independent-review');
  check(review.candidateDigest === packet.candidateDigest, 'review-candidate');
  check(review.measurementDigest === selectionMeasurementDigest(packet), 'review-measurement');
  check(isHash(review.sha256), 'review-bytes');
}
export function selectionPacketErrors(packet) {
  const errors = [];
  const check = (ok, reason) => {
    if (!ok) errors.push(reason);
  };
  check(packet.schema === 'npm-development-source-selection/1', 'schema');
  check(packet.base === BASE, 'base');
  check(digest(packet.ceiling) === digest(CEILING), 'ceiling');
  checkCandidate(packet, check);
  checkWitnesses(packet, check);
  checkMeasuredPacks(packet, check);
  checkReview(packet, check);
  return errors;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const packetPath = path.resolve(import.meta.dirname,
    '../../solve/quests/npm-development-source-selection/evidence/packet.json');
  try {
    const packet = JSON.parse(fs.readFileSync(packetPath, 'utf8'));
    const errors = selectionPacketErrors(packet);
    for (const row of packet.candidate) {
      const file = path.resolve(import.meta.dirname, '../..', row.path);
      const actual = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
      if (actual !== row.sha256) errors.push(`changed-candidate:${row.path}`);
    }
    console.log(errors.length);
  } catch (error) {
    console.error(`packet unavailable: ${error.message}`);
    console.log(1);
  }
}

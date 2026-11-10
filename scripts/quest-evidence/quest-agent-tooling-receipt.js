#!/usr/bin/env node
// Assemble a compact review dossier from verified store references. This records
// proposed coverage, not approval; the production probe still requires review.
import fs from 'node:fs';
import path from 'node:path';
import {headSha} from '../solve/guards.js';
import {requiredProofArtifacts} from '../solve/probes.js';
import {questState, readLog, readQuest} from '../solve/store.js';
import {ID_PATTERN} from '../solve/schema.js';
import {SCHEMA, sourceDigests} from '../agent-tooling/evidence.js';
import {readObservation} from '../agent-tooling/evidence-records.js';
import {ownedPath} from '../agent-tooling/paths.js';
import {loadProfile, projectRoot, sha256} from '../agent-tooling/profile.js';
import {refuseProbe} from '../agent-tooling/process.js';
import {MAX_RECEIPT_BYTES, VERIFIER_PREFIX} from '../agent-tooling/evidence-contract.js';

const USAGE = 'usage: quest-agent-tooling-receipt.js <quest> <coverage.json>';
const AWAITING_REVIEW = 'awaiting-independent-review';
const REFUSAL = Object.freeze({
  RECEIPT_QUEST_CLOSED: 'tooling_receipt_quest_closed',
  COVERAGE_REQUIRES_AUTHOR_AND_ACTUAL_OBSERVATIONS: 'tooling_coverage_requires_author_and_actual_observations',
  RECEIPT_DECLARATION_INVALID: 'tooling_receipt_declaration_invalid',
  RECEIPT_TOO_LARGE: 'tooling_receipt_too_large',
});


try {
  refuseProbe();
  const [id, coverageFile] = process.argv.slice(2);
  if (!ID_PATTERN.test(id) || !coverageFile) throw new Error(USAGE);
  const root = projectRoot(process.cwd());
  const quest = readQuest(root, id);
  const state = questState(readLog(root, id));
  if (state.terminal) throw new Error(REFUSAL.RECEIPT_QUEST_CLOSED);
  const coverage = JSON.parse(fs.readFileSync(ownedPath(root, coverageFile), 'utf8'));
  if (typeof coverage.author !== 'string' || !coverage.author.startsWith(VERIFIER_PREFIX) ||
    !Array.isArray(coverage.observations) || coverage.observations.length === 0) {
    throw new Error(REFUSAL.COVERAGE_REQUIRES_AUTHOR_AND_ACTUAL_OBSERVATIONS);
  }
  coverage.observations.forEach((reference) => readObservation(root, reference));
  const {digest} = loadProfile(root);
  const data = {...coverage, schema: SCHEMA, quest: id, profileDigest: digest,
    source: {root, commit: headSha(root), files: sourceDigests(root)}};
  const artifacts = requiredProofArtifacts(quest.doneWhen);
  if (artifacts.length !== 1) throw new Error(REFUSAL.RECEIPT_DECLARATION_INVALID);
  const bytes = JSON.stringify(data, null, 2) + '\n';
  if (Buffer.byteLength(bytes) > MAX_RECEIPT_BYTES) throw new Error(REFUSAL.RECEIPT_TOO_LARGE);
  const output = ownedPath(root, artifacts[0]);
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, bytes);
  console.log(JSON.stringify({quest: id, receipt: artifacts[0], sha256: sha256(bytes),
    status: AWAITING_REVIEW}));
} catch (error) {
  console.error(`tooling_receipt_unavailable: ${error.message}`);
  process.exitCode = 1;
}

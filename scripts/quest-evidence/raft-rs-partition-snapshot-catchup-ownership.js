#!/usr/bin/env node

// Draft receipt generator only. Mechanism harnesses run separately and write
// digest-bound result records. This reader performs no service, cluster,
// storage, or network action and never turns absent evidence into a red cell.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const QUEST_ID = 'raft-rs-partition-snapshot-catchup-ownership';
const RESULT_SCHEMA = 'snapshot-owner-mechanism-result/1';
const RECEIPT_SCHEMA = 'test-receipt/1';
const SOURCE_HEAD = '82b54ef9b7c8d6be9f2d6450cbc5e6713ade00af';
const TEXT_ENCODING = 'utf8';
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const REQUIRED_CELLS = Object.freeze([
  'registered-application-snapshot-preserves-boundary-without-source-hardstate',
  'publication-and-group-generation-are-independently-fenced',
  'intact-member-catchup-preserves-local-election-and-incarnation',
  'destructive-loss-holds-without-same-identity-resurrection',
  'fresh-learner-component-requires-exact-create-authority',
  'refusal-crash-and-lost-response-continuation-preserve-service',
  'real-intact-dispatch-transfer-install-restart-loses-zero-acknowledged-writes',
]);

function digest(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, TEXT_ENCODING));
}

function exactKeys(value, keys) {
  return value !== null && typeof value === 'object' &&
    Object.getPrototypeOf(value) === Object.prototype &&
    Object.keys(value).sort().join('\u0000') === [...keys].sort().join('\u0000');
}

function validateBoundFile(root, record) {
  if (!exactKeys(record, ['path', 'sha256']) ||
      typeof record.path !== 'string' ||
      !SHA256_PATTERN.test(record.sha256)) return false;
  const absolute = path.resolve(root, record.path);
  return absolute.startsWith(`${root}${path.sep}`) && fs.existsSync(absolute) &&
    digest(absolute) === record.sha256;
}

function validateResult(root, expectedId, result) {
  const keys = ['schema', 'quest', 'cell', 'sourceHead', 'command', 'exitCode',
    'mechanismEngaged', 'assertions', 'testFiles', 'rawLog'];
  if (!exactKeys(result, keys) || result.schema !== RESULT_SCHEMA ||
      result.quest !== QUEST_ID || result.cell !== expectedId ||
      result.sourceHead !== SOURCE_HEAD ||
      typeof result.command !== 'string' || result.command.length === 0 ||
      !Number.isInteger(result.exitCode) || result.mechanismEngaged !== true ||
      !Array.isArray(result.assertions) || result.assertions.length === 0 ||
      !Array.isArray(result.testFiles) || result.testFiles.length === 0 ||
      !result.testFiles.every((entry) => validateBoundFile(root, entry)) ||
      !validateBoundFile(root, result.rawLog)) return null;
  const assertionKeys = ['id', 'passed', 'observed'];
  if (!result.assertions.every((entry) => exactKeys(entry, assertionKeys) &&
    typeof entry.id === 'string' && entry.id.length > 0 &&
    typeof entry.passed === 'boolean' && typeof entry.observed === 'string')) {
    return null;
  }
  return {
    id: expectedId,
    passed: result.exitCode === 0 &&
      result.assertions.every((assertion) => assertion.passed),
    command: result.command,
    detail: result.assertions.map(({id, observed}) => `${id}: ${observed}`)
      .join('; '),
    sourceHead: result.sourceHead,
    evidenceDigest: digest(path.join(root, `${expectedId}.json`)),
    rawLogDigest: result.rawLog.sha256,
  };
}

function main() {
  const root = path.resolve(process.argv[2] || '');
  const output = path.resolve(process.argv[3] || '');
  if (!root || !output) throw new Error('usage: generator <results-dir> <receipt>');
  const receipts = [];
  for (const id of REQUIRED_CELLS) {
    const file = path.join(root, `${id}.json`);
    if (!fs.existsSync(file)) {
      throw new Error(`unmeasured mechanism cell: ${id}`);
    }
    const receipt = validateResult(root, id, readJson(file));
    if (receipt === null) throw new Error(`invalid mechanism evidence: ${id}`);
    receipts.push(receipt);
  }
  const complete = receipts.length === REQUIRED_CELLS.length;
  const data = {schema: RECEIPT_SCHEMA, quest: QUEST_ID,
    status: complete && receipts.every(({passed}) => passed) ? 'pass' : 'fail',
    sourceHead: SOURCE_HEAD, receipts};
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, `${JSON.stringify(data, null, 2)}\n`);
}

main();

#!/usr/bin/env node

// Bounded, source-pinned classification check. It verifies the *inventory*,
// not the correctness or public availability of the cited product behavior.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execGit} from './git-invocation.js';
import {gitProcessEnvironment} from './git-process-environment.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arrayFind = Function.call.bind(Array.prototype.find);
const arrayFlatMap = Function.call.bind(Array.prototype.flatMap);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const stringTrim = Function.call.bind(String.prototype.trim);
const INVENTORY_PATH = path.join(REPO_ROOT,
  'solve/quests/independent-portability-q0-specification-census/evidence/census.json');
const BASELINE_SHA = 'fc626cbf377a334c6960836afb92d837acd25ed9';
const SCHEMA = 'independent-portability-q0-census/1';
const CLAIM = 'classification-only-no-product-certification';
const TEXT_ENCODING = 'utf8';
const DIGEST_ALGORITHM = 'sha256';
const DIGEST_ENCODING = 'hex';
const MIN_EVIDENCE_LENGTH = 16;
const METRIC_FLAG = '--metric';
const NEWLINE = '\n';
const PASS_MESSAGE = 'Q0 classification census and negative controls pass\n';
const ERROR = Object.freeze({
  UNSAFE_PATH: 'unsafe source path',
  CENSUS: 'missing-or-malformed-census',
  SCHEMA: 'schema-mismatch',
  BASELINE: 'baseline-sha-mismatch',
  CLAIM: 'unbounded-proof-claim',
  ROWS: 'missing-rows',
  ROW: 'malformed-row',
});
const VERDICT_RESOLVED = 'resolved';
const Q1_IN_SCOPE = 'in-scope';
const DIGEST_PATTERN = /^[a-f0-9]{64}$/u;
const PATH_PATTERN = /^(?!\/)(?!.*(?:^|\/)\.\.?(?:\/|$))[a-zA-Z0-9_./-]+$/u;
const CLASSIFICATIONS = Object.freeze(new Set([
  'document-drift', 'version-target-difference', 'contract-ambiguity',
  'missing-definition', 'unverified', 'intentional-model-limit', 'historical',
]));
const VERDICTS = Object.freeze(new Set([
  'resolved', 'version-scoped', 'not-yet-defined', 'blocked',
]));
const Q1_DISPOSITIONS = Object.freeze(new Set(['in-scope', 'follow-up', 'held']));

// An explicit, immutable first-slice sample. Additional concerns require a
// separate owner decision, not a silent widening of this Quest's acceptance.
const REQUIRED_ANCHORS = Object.freeze({
  P01: 'src/service/service-entry-generator.js',
  P02: 'src/service/request-cell-call-bridge.js',
  P03: 'src/service/call-canonical-partial-codec.js',
  P04: 'src/runtime/request-cell-invocation-owner.js',
  P05: 'src/transport/message-router-server-lifecycle.js',
  P06: 'wit/world.wit',
  P07: 'architecture/contracts/core-system-logic.md',
  P08: 'architecture/rebalance.md',
  P09: 'solve/epics/core-architecture-convergence.md',
  W01: 'src/partition/partition-committed-statement-outcome.js',
  W02: 'architecture/contracts/message-group-committed-learner-origin.md',
  W03: 'src/partition/partition-descriptor-epoch-contract.js',
  W04: 'src/hlc/hlc-timestamp.js',
  W05: 'src/service/call-canonical-partial-codec.js',
  W06: 'architecture/contracts/authority-and-recovery.md',
  W07: 'src/partition/partition-service-raft-write-commit.js',
});
// These remain holds on this fixed baseline; changing evidence prose cannot
// silently convert unexecuted public/recovery behavior into certified facts.
const UNRESOLVED_BASELINE_HOLDS = Object.freeze({
  P04: 'blocked',
  P06: 'not-yet-defined',
  W04: 'blocked',
  W07: 'blocked',
});

function isNonempty(value) {
  return typeof value === 'string' && stringTrim(value).length >= MIN_EVIDENCE_LENGTH;
}

function digestAtBaseline(relPath) {
  if (!PATH_PATTERN.test(relPath)) throw new Error(ERROR.UNSAFE_PATH);
  const source = execGit(['show', `${BASELINE_SHA}:${relPath}`], {
    cwd: REPO_ROOT, encoding: 'buffer', env: gitProcessEnvironment(),
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return crypto.createHash(DIGEST_ALGORITHM).update(source).digest(DIGEST_ENCODING);
}

function collectCensusHeaderProblems(census) {
  const problems = [];
  if (census.schema !== SCHEMA) problems.push(ERROR.SCHEMA);
  if (census.baselineSha !== BASELINE_SHA) problems.push(ERROR.BASELINE);
  if (census.claim !== CLAIM) problems.push(ERROR.CLAIM);
  return problems;
}

function collectAnchorProblems(row, id, digestOf) {
  const problems = [];
  if (row.anchor !== REQUIRED_ANCHORS[id]) problems.push(`wrong-anchor:${id}`);
  if (!DIGEST_PATTERN.test(row.anchorSha256 || '')) {
    problems.push(`missing-digest:${id}`);
  } else if (row.anchor === REQUIRED_ANCHORS[id]) {
    try {
      if (row.anchorSha256 !== digestOf(row.anchor)) problems.push(`stale-source:${id}`);
    } catch (_error) {
      problems.push(`unavailable-source:${id}`);
    }
  }
  return problems;
}

function collectOwnerProblems(row, id, digestOf) {
  const problems = [];
  if (!isNonempty(row.owner)) problems.push(`missing-owner:${id}`);
  if (typeof row.ownerContract !== 'string' || !PATH_PATTERN.test(row.ownerContract) ||
      !/^(architecture\/|docs\/|wit\/|solve\/epics\/)/u.test(row.ownerContract)) {
    problems.push(`missing-owner-contract:${id}`);
  } else {
    try {
      digestOf(row.ownerContract);
    } catch (_error) {
      problems.push(`unavailable-owner-contract:${id}`);
    }
  }
  return problems;
}

function collectVerdictProblems(row, id) {
  const problems = [];
  if (!CLASSIFICATIONS.has(row.classification)) problems.push(`unclassified:${id}`);
  if (!VERDICTS.has(row.verdict)) problems.push(`unresolved-verdict:${id}`);
  if (Object.hasOwn(UNRESOLVED_BASELINE_HOLDS, id) &&
      row.verdict !== UNRESOLVED_BASELINE_HOLDS[id]) {
    problems.push(`unproven-status-promotion:${id}`);
  }
  if (!Q1_DISPOSITIONS.has(row.q1Disposition)) problems.push(`missing-q1-route:${id}`);
  if (row.verdict === VERDICT_RESOLVED && !isNonempty(row.resolution)) {
    problems.push(`unproved-resolution:${id}`);
  }
  if (row.q1Disposition === Q1_IN_SCOPE && row.verdict === VERDICT_RESOLVED) {
    problems.push(`unexpectedly-resolved-successor:${id}`);
  }
  return problems;
}

function collectEvidenceProblems(row, id) {
  const problems = [];
  if (!isNonempty(row.observation)) problems.push(`missing-observation:${id}`);
  if (!isNonempty(row.limitation)) problems.push(`missing-limit:${id}`);
  if (!isNonempty(row.nextProof)) problems.push(`missing-next-proof:${id}`);
  return problems;
}

function collectRowsProblems(rows, digestOf) {
  const problems = [];
  const seen = new Set();
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      problems.push(ERROR.ROW);
      continue;
    }
    const {id} = row;
    if (!Object.hasOwn(REQUIRED_ANCHORS, id)) {
      problems.push(`unexpected-id:${String(id)}`);
      continue;
    }
    if (seen.has(id)) problems.push(`duplicate-id:${id}`);
    seen.add(id);
    problems.push(...collectAnchorProblems(row, id, digestOf));
    problems.push(...collectOwnerProblems(row, id, digestOf));
    problems.push(...collectVerdictProblems(row, id));
    problems.push(...collectEvidenceProblems(row, id));
  }
  for (const id of Object.keys(REQUIRED_ANCHORS)) {
    if (!seen.has(id)) problems.push(`missing-id:${id}`);
  }
  return problems;
}

function collectCensusProblems(census, digestOf = digestAtBaseline) {
  if (!census || typeof census !== 'object' || Array.isArray(census)) {
    return [ERROR.CENSUS];
  }
  const problems = collectCensusHeaderProblems(census);
  if (!Array.isArray(census.rows)) return [...problems, ERROR.ROWS];
  return [...problems, ...collectRowsProblems(census.rows, digestOf)];
}

function runNegativeControls(census) {
  const controls = [
    (copy) => copy.rows.pop(),
    (copy) => {
      copy.rows[0].anchorSha256 = '0'.repeat(64);
    },
    (copy) => {
      copy.rows[0].verdict = 'verified-production';
    },
    (copy) => {
      arrayFind(copy.rows, (row) => row.id === 'W04').verdict = VERDICT_RESOLVED;
    },
    (copy) => {
      copy.rows[0].ownerContract = 'missing/owner.md';
    },
    (copy) => copy.rows.push({...copy.rows[0]}),
    (copy) => {
      copy.baselineSha = '0'.repeat(40);
    },
  ];
  return arrayFlatMap(controls, (mutate, index) => {
    const copy = structuredClone(census);
    mutate(copy);
    return collectCensusProblems(copy).length === 0 ? [`false-green-control:${index}`] : [];
  });
}

function main() {
  let census = null;
  try {
    census = JSON.parse(fs.readFileSync(INVENTORY_PATH, TEXT_ENCODING));
  } catch (_error) {
    // Missing evidence is a measured red count, not fabricated success.
  }
  const problems = collectCensusProblems(census);
  if (problems.length === 0) problems.push(...runNegativeControls(census));
  if (arrayIncludes(process.argv, METRIC_FLAG)) {
    process.stdout.write(`${problems.length}${NEWLINE}`);
    return;
  }
  if (problems.length > 0) {
    process.stderr.write(`${problems.join(NEWLINE)}${NEWLINE}`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(PASS_MESSAGE);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

export {collectCensusProblems, runNegativeControls};

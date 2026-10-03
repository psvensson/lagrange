#!/usr/bin/env node
import fs from 'node:fs';
import {types as nodeUtilTypes} from 'node:util';

import {
  replaySplitEntry,
  routeSplitSnapshotBatch,
} from '../../src/partition/partition-split-routing.js';

const MAX_EVALUATION_CONTEXT_VALUES = 1_024;
const WRITE_ACTIVITY = 'write_activity';
const SPLIT_PROXY_ERROR_PATTERN = /proxi(?:es|y)/iu;
const isProxy = nodeUtilTypes.isProxy.bind(nodeUtilTypes);
const CONTEXT_OWNER_URL = new URL(
  '../../src/partition/partition-split-merge-evaluation-context.js',
  import.meta.url,
);

async function loadContextOwner() {
  if (!fs.existsSync(CONTEXT_OWNER_URL)) {
    return null;
  }
  try {
    return await import(CONTEXT_OWNER_URL.href);
  } catch (_error) {
    return null;
  }
}

async function reasonPolicyProblemCount() {
  const owner = await loadContextOwner();
  const mergeEvaluationContextStringArrays =
    owner?.mergeEvaluationContextStringArrays;
  if (typeof mergeEvaluationContextStringArrays !== 'function') {
    return 1;
  }

  let problems = 0;
  const ordinaryLimit = MAX_EVALUATION_CONTEXT_VALUES - 1;
  const initial = Array.from(
    {length: MAX_EVALUATION_CONTEXT_VALUES},
    (_unused, index) => 'reason-' + String(index),
  );
  const admitted = mergeEvaluationContextStringArrays(
    [],
    initial,
    {priorityValue: WRITE_ACTIVITY},
  );
  if (admitted.length !== ordinaryLimit) problems += 1;
  for (let index = 0; index < ordinaryLimit; index += 1) {
    if (admitted[index] !== initial[index]) problems += 1;
  }

  const prioritized = mergeEvaluationContextStringArrays(
    admitted,
    [WRITE_ACTIVITY, 'later-reason'],
    {priorityValue: WRITE_ACTIVITY},
  );
  if (prioritized.length !== MAX_EVALUATION_CONTEXT_VALUES) problems += 1;
  for (let index = 0; index < ordinaryLimit; index += 1) {
    if (prioritized[index] !== initial[index]) problems += 1;
  }
  if (prioritized[ordinaryLimit] !== WRITE_ACTIVITY) problems += 1;

  const repeated = mergeEvaluationContextStringArrays(
    prioritized,
    ['later-again', WRITE_ACTIVITY],
    {priorityValue: WRITE_ACTIVITY},
  );
  if (repeated.length !== MAX_EVALUATION_CONTEXT_VALUES) problems += 1;
  for (let index = 0; index < MAX_EVALUATION_CONTEXT_VALUES; index += 1) {
    if (repeated[index] !== prioritized[index]) problems += 1;
  }
  return problems;
}

function proxyWithTrapCounter(counter) {
  return new Proxy({}, {
    get() {
      counter.count += 1;
      throw new Error('proxy get trap executed');
    },
    getOwnPropertyDescriptor() {
      counter.count += 1;
      throw new Error('proxy descriptor trap executed');
    },
  });
}

async function liveIngressProblemCount() {
  let problems = 0;
  for (const exercise of [
    async (metadata) => replaySplitEntry(
      {
        sql: 'INSERT INTO users (id) VALUES (?)',
        params: ['a'],
        data: {id: 'a'},
      },
      metadata,
      {
        tableName: 'users',
        queryExecutor: {
          async executeOnPartition() {
            problems += 1;
            return {success: true};
          },
        },
      },
    ),
    async (metadata) => routeSplitSnapshotBatch(
      [{id: 'a'}],
      ['id'],
      metadata,
      {
        tableName: 'users',
        queryExecutor: {
          async executeOnPartition() {
            problems += 1;
            return {success: true};
          },
        },
      },
    ),
  ]) {
    const counter = {count: 0};
    const metadata = proxyWithTrapCounter(counter);
    if (!isProxy(metadata)) problems += 1;
    try {
      await exercise(metadata);
      problems += 1;
    } catch (error) {
      if (!SPLIT_PROXY_ERROR_PATTERN.test(String(error?.message || error))) {
        problems += 1;
      }
    }
    if (counter.count !== 0) problems += 1;
  }
  return problems;
}

const metric =
  await reasonPolicyProblemCount() +
  await liveIngressProblemCount();
if (metric !== 0) {
  process.stderr.write(
    'partition-key-ordering-owner-completion-v9: outstanding problems=' +
    String(metric) + '\n',
  );
}
process.stdout.write(String(metric) + '\n');
process.exitCode = metric === 0 ? 0 : 1;

#!/usr/bin/env node
import {types as nodeUtilTypes} from 'node:util';

import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  KeyRange,
  KeyRangeManager,
} from '../../src/partition/key-range-manager.js';
import {PartitionSplitMergeManager} from
  '../../src/partition/partition-split-merge-manager.js';
import {
  compareRoutingKeys,
  resolveSplitTargetPartitionId,
} from '../../src/partition/split-key-comparator.js';

const CONTEXT_LIMIT = 1_024;
const WRITE_ACTIVITY = 'write_activity';
const isProxy = nodeUtilTypes.isProxy.bind(nodeUtilTypes);

function resetRuntime() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'a1-v8-probe'}});
  LoggingService.getInstance().initialize({level: 'error'});
}

function emptyManager(options = {}) {
  resetRuntime();
  return new PartitionSplitMergeManager({
    listPartitions: () => [],
    getPartitionMetrics: () => ({sizeBytes: 0, queriesPerMinute: 0}),
    executeMergeCandidate: null,
    ...options,
  });
}

async function keyRangeManagerIdPathProblems() {
  resetRuntime();
  const keyRangeManager = new KeyRangeManager('v8-table');
  keyRangeManager.addPartition('p1', KeyRange.fullRange());
  const manager = new PartitionSplitMergeManager({
    keyRangeManager,
    getPartitionMetrics: () => ({sizeBytes: 0, queriesPerMinute: 0}),
    tablePolicyService: {getPolicyForPartition: async () => ({})},
    executeMergeCandidate: null,
  });
  let problems = 0;
  try {
    const results = await manager.evaluateAllPartitions();
    if (results.evaluated !== true ||
        results.partitionsEvaluated !== 1 ||
        results.mergeCandidates.length !== 0) {
      problems += 1;
    }
  } catch (error) {
    process.stderr.write(
      'key-range-manager-id-path: ' + String(error?.message || error) + '\n',
    );
    problems += 1;
  } finally {
    manager.shutdown();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
  return problems;
}

function boundedContextProblems() {
  const manager = emptyManager();
  let problems = 0;
  try {
    const existingIds = Array.from(
      {length: CONTEXT_LIMIT},
      (_unused, index) => 'existing-' + String(index),
    );
    const nextIds = Array.from(
      {length: CONTEXT_LIMIT},
      (_unused, index) => 'next-' + String(index),
    );
    const existingReasons = Array.from(
      {length: CONTEXT_LIMIT},
      (_unused, index) => 'reason-' + String(index),
    );
    const merged = manager.mergeRequestedEvaluationContext(
      {partitionIds: existingIds, reasonCodes: existingReasons},
      {partitionIds: nextIds, reasonCodes: [WRITE_ACTIVITY]},
    );
    if (merged.partitionIds.length !== CONTEXT_LIMIT ||
        merged.partitionIds[0] !== 'existing-0' ||
        merged.partitionIds[CONTEXT_LIMIT - 1] !==
          'existing-' + String(CONTEXT_LIMIT - 1) ||
        merged.reasonCodes.length !== CONTEXT_LIMIT ||
        !merged.reasonCodes.includes(WRITE_ACTIVITY)) {
      problems += 1;
    }

    const repeated = manager.mergeRequestedEvaluationContext(
      merged,
      {partitionIds: ['later'], reasonCodes: ['later-reason']},
    );
    if (repeated.partitionIds.length !== CONTEXT_LIMIT ||
        repeated.partitionIds[0] !== 'existing-0' ||
        repeated.reasonCodes.length !== CONTEXT_LIMIT ||
        !repeated.reasonCodes.includes(WRITE_ACTIVITY)) {
      problems += 1;
    }
  } finally {
    manager.shutdown();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
  return problems;
}

function regexpExecCaptureProblems() {
  const original = Object.getOwnPropertyDescriptor(RegExp.prototype, 'exec');
  let problems = 0;
  try {
    Reflect.defineProperty(RegExp.prototype, 'exec', {
      configurable: true,
      writable: true,
      value: () => null,
    });
    if (compareRoutingKeys(1000, '500') !== 1) problems += 1;
  } catch (error) {
    process.stderr.write(
      'regexp-exec-capture: ' + String(error?.message || error) + '\n',
    );
    problems += 1;
  } finally {
    Reflect.defineProperty(RegExp.prototype, 'exec', original);
  }
  return problems;
}

function proxyMetadataProblems() {
  let problems = 0;
  let metadataTraps = 0;
  const metadataProxy = new Proxy({}, {
    getOwnPropertyDescriptor() {
      metadataTraps += 1;
      throw new Error('metadata descriptor trap executed');
    },
    get() {
      metadataTraps += 1;
      throw new Error('metadata get trap executed');
    },
  });
  if (!isProxy(metadataProxy)) problems += 1;
  try {
    resolveSplitTargetPartitionId(20, metadataProxy);
    problems += 1;
  } catch (_error) {
    // Fail-closed is required.
  }
  if (metadataTraps !== 0) problems += 1;

  let targetTraps = 0;
  const targetProxy = new Proxy(['left', 'right'], {
    getOwnPropertyDescriptor() {
      targetTraps += 1;
      throw new Error('target descriptor trap executed');
    },
    get() {
      targetTraps += 1;
      throw new Error('target get trap executed');
    },
  });
  if (!isProxy(targetProxy)) problems += 1;
  try {
    resolveSplitTargetPartitionId(20, {
      splitKey: 10,
      targetPartitionIds: targetProxy,
    });
    problems += 1;
  } catch (_error) {
    // Fail-closed is required.
  }
  if (targetTraps !== 0) problems += 1;

  return problems;
}

let metric = 0;
metric += await keyRangeManagerIdPathProblems();
metric += boundedContextProblems();
metric += regexpExecCaptureProblems();
metric += proxyMetadataProblems();

ConfigurationManager.resetInstance();
LoggingService.resetInstance();

if (metric !== 0) {
  process.stderr.write(
    'partition-key-ordering-owner-completion-v8: outstanding problems=' +
    String(metric) + '\n',
  );
}
process.stdout.write(String(metric) + '\n');
process.exitCode = metric === 0 ? 0 : 1;

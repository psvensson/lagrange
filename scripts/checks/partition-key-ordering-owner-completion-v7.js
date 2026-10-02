#!/usr/bin/env node
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {PartitionSplitMergeManager} from '../../src/partition/partition-split-merge-manager.js';

function managerForProbe() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'a1-v7-probe'}});
  LoggingService.getInstance().initialize({level: 'error'});
  return new PartitionSplitMergeManager({
    listPartitions: () => [],
    getPartitionMetrics: () => ({sizeBytes: 0, queriesPerMinute: 0}),
    executeMergeCandidate: null,
  });
}

async function tableIdValidationProblems() {
  let problems = 0;
  for (const invalidTableId of [false, 0, Object('boxed-table')]) {
    const invalid = {
      partition_id: 'invalid',
      table_id: invalidTableId,
      partition_key_start: null,
      partition_key_end: null,
    };
    const absent = {
      partition_id: 'absent',
      partition_key_start: null,
      partition_key_end: null,
    };
    for (const rows of [[absent, invalid], [invalid, absent]]) {
      const manager = managerForProbe();
      manager.listPartitions = () => rows;
      try {
        await manager.evaluateAllPartitions();
        problems += 1;
      } catch (error) {
        if (!(error instanceof TypeError)) problems += 1;
      } finally {
        manager.shutdown();
      }
    }
  }
  return problems;
}

async function arrayIntrinsicProblems() {
  const rows = [
    {
      partition_id: 'b',
      table_id: 'table-a',
      partition_key_start: 'm',
      partition_key_end: null,
    },
    {
      partition_id: 'a',
      table_id: 'table-a',
      partition_key_start: null,
      partition_key_end: 'm',
    },
  ];
  const priorIterator = Object.getOwnPropertyDescriptor(rows, Symbol.iterator);
  const priorSort = Array.prototype.sort;
  const priorIsArray = Array.isArray;
  const priorApply = Reflect.apply;
  let problems = 0;
  const manager = managerForProbe();
  manager.listPartitions = () => rows;
  try {
    Object.defineProperty(rows, Symbol.iterator, {
      configurable: true,
      value() {
        throw new Error('partition iterator executed');
      },
    });
    Array.prototype.sort = () => {
      throw new Error('live Array.prototype.sort executed');
    };
    Array.isArray = () => false;
    Reflect.apply = () => {
      throw new Error('live Reflect.apply executed');
    };
    const results = await manager.evaluateAllPartitions();
    if (results.mergeCandidates.length !== 1 ||
        results.mergeCandidates[0]?.leftId !== 'a' ||
        results.mergeCandidates[0]?.rightId !== 'b') {
      problems += 1;
    }
  } catch {
    problems += 1;
  } finally {
    Reflect.apply = priorApply;
    Array.isArray = priorIsArray;
    Array.prototype.sort = priorSort;
    if (priorIterator) {
      Object.defineProperty(rows, Symbol.iterator, priorIterator);
    } else {
      Reflect.deleteProperty(rows, Symbol.iterator);
    }
    manager.shutdown();
  }
  return problems;
}

let metric = 0;
metric += await tableIdValidationProblems();
metric += await arrayIntrinsicProblems();
ConfigurationManager.resetInstance();
LoggingService.resetInstance();

if (metric !== 0) {
  process.stderr.write(
    'partition-key-ordering-owner-completion-v7: outstanding problems=' +
    String(metric) + '\n',
  );
}
process.stdout.write(String(metric) + '\n');
process.exitCode = metric === 0 ? 0 : 1;

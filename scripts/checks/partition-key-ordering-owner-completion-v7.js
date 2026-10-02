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

function buildProbeRow(partitionId, startKey, endKey) {
  return {
    partition_id: partitionId,
    table_id: 'table-a',
    partition_key_start: startKey,
    partition_key_end: endKey,
  };
}

async function tableIdValidationProblems() {
  let problems = 0;
  for (const invalidTableId of [false, 0, Object('boxed-table')]) {
    for (const absentKind of ['missing', 'null', 'undefined']) {
      const invalid = {
        ...buildProbeRow('invalid', null, null),
        table_id: invalidTableId,
      };
      const absent = buildProbeRow('absent', null, null);
      if (absentKind === 'missing') {
        Reflect.deleteProperty(absent, 'table_id');
      } else {
        absent.table_id = absentKind === 'null' ? null : undefined;
      }
      for (const rows of [[absent, invalid], [invalid, absent]]) {
        const manager = managerForProbe();
        manager.listPartitions = () => rows;
        try {
          await manager.evaluateAllPartitions();
          process.stderr.write(
            'table-id-validation-before-' + absentKind +
            ': predecessor accepted invalid table ID\n',
          );
          problems += 1;
        } catch (error) {
          if (!(error instanceof TypeError)) problems += 1;
        } finally {
          manager.shutdown();
        }
      }
    }
  }
  return problems;
}

async function arrayIntrinsicProblems() {
  const rows = [
    buildProbeRow('b', 'm', null),
    buildProbeRow('a', null, 'm'),
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
  } catch (error) {
    process.stderr.write(
      'evaluation-array-intrinsic-isolation: ' +
      String(error?.message || error) + '\n',
    );
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

function copySetterProblems() {
  const rows = [
    buildProbeRow('a', null, 'm'),
    buildProbeRow('b', 'm', null),
  ];
  const manager = managerForProbe();
  const priorPrototypeIndex =
    Object.getOwnPropertyDescriptor(Array.prototype, '0');
  const priorDefineProperty = Reflect.defineProperty;
  let inheritedSetterCalls = 0;
  let problems = 0;
  try {
    Object.defineProperty(Array.prototype, '0', {
      configurable: true,
      set() {
        inheritedSetterCalls += 1;
      },
    });
    Reflect.defineProperty = () => {
      throw new Error('live Reflect.defineProperty executed');
    };
    const copied = manager.normalizeEvaluationPartitions(rows);
    if (inheritedSetterCalls !== 0 ||
        copied.length !== 2 ||
        copied[0] !== rows[0] ||
        copied[1] !== rows[1]) {
      problems += 1;
    }
  } catch (error) {
    process.stderr.write(
      'evaluation-array-own-slot-copy: ' +
      String(error?.message || error) + '\n',
    );
    problems += 1;
  } finally {
    Reflect.defineProperty = priorDefineProperty;
    if (priorPrototypeIndex) {
      Object.defineProperty(Array.prototype, '0', priorPrototypeIndex);
    } else {
      Reflect.deleteProperty(Array.prototype, '0');
    }
    manager.shutdown();
  }
  return problems;
}

async function rowFieldOwnDataProblems() {
  let accessorCalls = 0;
  let problems = 0;
  const left = {
    table_id: 'table-a',
    partitionId: 'a',
    partitionKeyStart: null,
    partitionKeyEnd: 'm',
  };
  Object.defineProperty(left, 'partition_id', {
    configurable: true,
    enumerable: true,
    get() {
      accessorCalls += 1;
      return 'wrong-accessor-id';
    },
  });
  Object.defineProperty(left, 'partition_key_end', {
    configurable: true,
    enumerable: true,
    get() {
      accessorCalls += 1;
      return 'wrong-accessor-end';
    },
  });

  const right = Object.assign(
    Object.create({
      partition_id: 'wrong-inherited-id',
      partition_key_start: 'wrong-inherited-start',
    }),
    {
      partitionId: 'b',
      table_id: 'table-a',
      partitionKeyStart: 'm',
      partitionKeyEnd: null,
    },
  );

  const manager = managerForProbe();
  manager.listPartitions = () => [right, left];
  try {
    const results = await manager.evaluateAllPartitions();
    if (accessorCalls !== 0 ||
        results.mergeCandidates.length !== 1 ||
        results.mergeCandidates[0]?.leftId !== 'a' ||
        results.mergeCandidates[0]?.rightId !== 'b') {
      problems += 1;
    }
  } catch (error) {
    process.stderr.write(
      'evaluation-row-own-data-fields: ' +
      String(error?.message || error) + '\n',
    );
    problems += 1;
  } finally {
    manager.shutdown();
  }
  return problems;
}

let metric = 0;
metric += await tableIdValidationProblems();
metric += await arrayIntrinsicProblems();
metric += copySetterProblems();
metric += await rowFieldOwnDataProblems();
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

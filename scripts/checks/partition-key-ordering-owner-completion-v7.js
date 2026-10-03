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

async function runEvaluationIntrinsicCase(label, mutate, restore) {
  const rows = [
    buildProbeRow('b', 'm', null),
    buildProbeRow('a', null, 'm'),
  ];
  const manager = managerForProbe();
  manager.listPartitions = () => rows;
  let problems = 0;
  try {
    mutate(rows);
    const results = await manager.evaluateAllPartitions();
    if (results.mergeCandidates.length !== 1 ||
        results.mergeCandidates[0]?.leftId !== 'a' ||
        results.mergeCandidates[0]?.rightId !== 'b') {
      process.stderr.write(label + ': wrong merge candidate result\n');
      problems += 1;
    }
  } catch (error) {
    process.stderr.write(
      label + ': ' + String(error?.message || error) + '\n',
    );
    problems += 1;
  } finally {
    restore(rows);
    manager.shutdown();
  }
  return problems;
}

async function arrayIntrinsicProblems() {
  let problems = 0;

  let priorIterator;
  problems += await runEvaluationIntrinsicCase(
    'evaluation-array-iterator-isolation',
    (rows) => {
      priorIterator = Object.getOwnPropertyDescriptor(rows, Symbol.iterator);
      Object.defineProperty(rows, Symbol.iterator, {
        configurable: true,
        value() {
          throw new Error('partition iterator executed');
        },
      });
    },
    (rows) => {
      if (priorIterator) {
        Object.defineProperty(rows, Symbol.iterator, priorIterator);
      } else {
        Reflect.deleteProperty(rows, Symbol.iterator);
      }
    },
  );

  const priorIsArray = Array.isArray;
  problems += await runEvaluationIntrinsicCase(
    'evaluation-array-isarray-capture',
    () => {
      Array.isArray = () => false;
    },
    () => {
      Array.isArray = priorIsArray;
    },
  );

  const priorSort = Array.prototype.sort;
  problems += await runEvaluationIntrinsicCase(
    'evaluation-array-sort-capture',
    () => {
      Array.prototype.sort = () => {
        throw new Error('live Array.prototype.sort executed');
      };
    },
    () => {
      Array.prototype.sort = priorSort;
    },
  );

  const priorApply = Reflect.apply;
  problems += await runEvaluationIntrinsicCase(
    'evaluation-reflect-apply-capture',
    () => {
      Reflect.apply = () => {
        throw new Error('live Reflect.apply executed');
      };
    },
    () => {
      Reflect.apply = priorApply;
    },
  );

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

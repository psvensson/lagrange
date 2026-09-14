/**
 * The storage-load report contract: a complete report judges clean, and every
 * required figure that goes missing is named. The scenario writes reports
 * against this contract; the quest probe reads them through the same judge.
 */
import {test} from '../../src/test-helpers/tap.js';
import {
  STORAGE_LOAD_REPORT,
  judgeSoakReport,
  judgeStorageLoadReport,
} from '../../scripts/checks/storage-load-report.js';

const HEAD = '0123456789abcdef0123456789abcdef01234567';
const STARTED_AT = '2026-09-14T06:00:00.000Z';
const HOUR_MS = 3600000;

function figure() {
  return {
    attempted: 120,
    succeeded: 118,
    failed: 2,
    opsPerSec: 9.8,
    latencyMs: {p50: 4.2, p95: 9.1, p99: 14.7},
  };
}

function storage(scale) {
  return {
    diskBytes: 1024 * scale,
    raftLogEntries: 10 * scale,
    raftLogCommandBytes: 512 * scale,
    messageGroupLogEntries: 3 * scale,
    rssBytes: 100000000 + scale,
  };
}

function completeReport(overrides = {}) {
  return {
    schema: STORAGE_LOAD_REPORT.SCHEMA,
    run: {
      head: HEAD,
      startedAt: STARTED_AT,
      keyType: STORAGE_LOAD_REPORT.KEY_TYPE.STRING,
      topology: STORAGE_LOAD_REPORT.TOPOLOGY_IN_PROCESS_THREE_NODE,
      nodeCount: 3,
      durationMs: 120000,
      elapsedMs: 120000,
      snapshotIntervalMs: 10000,
      opsPerSec: 20,
      endReason: STORAGE_LOAD_REPORT.END_REASON.COMPLETED,
    },
    write: figure(),
    read: figure(),
    partitions: [
      {tableName: 'storage_load_p0', write: figure(), read: figure()},
      {tableName: 'storage_load_p1', write: figure(), read: figure()},
    ],
    storage: storage(3),
    snapshots: [
      {elapsedMs: 10000, storage: storage(1)},
      {elapsedMs: 20000, storage: storage(2)},
      {elapsedMs: 30000, storage: storage(3)},
    ],
    growth: {
      diskBytesPerHour: 368640,
      raftLogEntriesPerHour: 3600,
      messageGroupLogEntriesPerHour: 1080,
    },
    ...overrides,
  };
}

test('a complete string-keyed report judges clean', (t) => {
  const verdict = judgeStorageLoadReport(completeReport(), {
    keyType: STORAGE_LOAD_REPORT.KEY_TYPE.STRING,
  });
  t.same(verdict.problems, [], 'no problems');
  t.end();
});

test('every missing figure is named, one problem each', (t) => {
  const report = completeReport();
  delete report.write.succeeded;
  delete report.storage.messageGroupLogEntries;
  report.growth.diskBytesPerHour = null;
  const verdict = judgeStorageLoadReport(report);
  t.ok(verdict.problems.some((problem) => problem.startsWith('write.succeeded')),
    'write.succeeded named');
  t.ok(verdict.problems.some((problem) =>
    problem.startsWith('storage.messageGroupLogEntries')),
  'storage.messageGroupLogEntries named');
  t.ok(verdict.problems.some((problem) =>
    problem.startsWith('growth.diskBytesPerHour')),
  'growth.diskBytesPerHour named');
  t.end();
});

test('the expected key type is enforced when asked for', (t) => {
  const report = completeReport();
  const asInteger = judgeStorageLoadReport(report, {
    keyType: STORAGE_LOAD_REPORT.KEY_TYPE.INTEGER,
  });
  t.equal(asInteger.problems.length, 1, 'one problem');
  t.match(asInteger.problems[0], /run\.keyType must be integer/,
    'names the expected key type');
  const unasked = judgeStorageLoadReport(report);
  t.same(unasked.problems, [], 'no key type asked, no problem');
  t.end();
});

test('a report with no succeeded work is not a measurement', (t) => {
  const report = completeReport();
  report.read.succeeded = 0;
  const verdict = judgeStorageLoadReport(report);
  t.ok(verdict.problems.some((problem) => problem.startsWith('read must record')),
    'read named');
  t.end();
});

test('every partition carries its own write and read figures', (t) => {
  const report = completeReport();
  delete report.partitions[1].read.latencyMs.p99;
  const verdict = judgeStorageLoadReport(report);
  t.ok(verdict.problems.some((problem) =>
    problem.startsWith('partitions.1.read.latencyMs.p99')),
  'the partition figure is named');
  const empty = judgeStorageLoadReport(completeReport({partitions: []}));
  t.ok(empty.problems.some((problem) => problem.startsWith('partitions must')),
    'an empty partition list is refused');
  t.end();
});

test('fewer than two snapshots cannot yield a growth figure', (t) => {
  const report = completeReport({snapshots: [{elapsedMs: 10000,
    storage: storage(1)}]});
  const verdict = judgeStorageLoadReport(report);
  t.ok(verdict.problems.some((problem) => problem.startsWith('snapshots must')),
    'snapshots named');
  t.end();
});

test('the wrong schema, topology or node count is refused', (t) => {
  const report = completeReport();
  report.schema = 'something-else';
  report.run.topology = 'docker';
  report.run.nodeCount = 5;
  const verdict = judgeStorageLoadReport(report);
  t.equal(verdict.problems.length, 3, 'three problems');
  t.end();
});

test('a soak report must cover a day and name the landed bound', (t) => {
  const short = judgeSoakReport(completeReport());
  t.equal(short.problems.length, 2, 'coverage and bound both missing');
  const soak = completeReport({bound: 'message-group-log-bound'});
  soak.run.elapsedMs = 25 * HOUR_MS;
  soak.run.durationMs = 25 * HOUR_MS;
  t.same(judgeSoakReport(soak).problems, [], 'a day with a bound is clean');
  t.end();
});

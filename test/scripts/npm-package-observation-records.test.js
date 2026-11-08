import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, it} from 'node:test';
import {finishPackageObservation, observePackageAsync, observePackageSync,
  snapshotPackageObservation, validatePackageObservation}
  from '../../scripts/npm-package-observation.js';
import {PACKAGE_DIAGNOSTIC_FILES, SNAPSHOT_MAX_BYTES, TOTAL_MAX_BYTES, TRACE_MAX_BYTES,
  createPackageDiagnosticSink} from '../../scripts/npm-package-diagnostic-sink.js';

const textOf = (records) => `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'package-observation-records-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  return root;
}

describe('transparent package observation records', () => {
  it('keeps sync execution and returned/thrown identity, with detached frozen scalar records', () => {
    const records = [];
    const observer = (record) => {
      assert.ok(Object.isFrozen(record));
      assert.ok(Object.values(record).every((value) => value === null ||
        ['string', 'number'].includes(typeof value)));
      records.push(record);
    };
    const original = {mutable: {value: 1}};
    const error = Object.assign(new Error('body failed'), {code: 'BODY'});
    let returned = false;
    assert.equal(observePackageSync(observer, 'outer', () => {
      assert.equal(returned, false);
      return observePackageSync(observer, 'inner', () => original);
    }), original);
    returned = true;
    original.mutable.value = 2;
    assert.throws(() => observePackageSync(observer, 'failure', () => {
      throw error;
    }),
    (caught) => caught === error);
    assert.equal(Object.isFrozen(original), false);
    assert.equal(Object.isFrozen(error), false);
    assert.equal(finishPackageObservation(observer).complete, true);
    assert.equal(validatePackageObservation(textOf(records)).complete, true);
    assert.equal(records.find((record) => record.stage === 'inner').parentStageId,
      records.find((record) => record.stage === 'outer').stageId);
  });

  it('keeps absent-observer promise identity and async value/error identity', async () => {
    const result = {};
    const promise = Promise.resolve(result);
    assert.equal(observePackageAsync(undefined, 'disabled', () => promise), promise);
    assert.equal(observePackageSync(undefined, 'disabled', () => result), result);
    const observer = () => {};
    assert.equal(await observePackageAsync(observer, 'success', () => promise), result);
    const error = new Error('async body');
    await assert.rejects(observePackageAsync(observer, 'failure', async () => {
      throw error;
    }),
    (caught) => caught === error);
    assert.equal(finishPackageObservation(observer).complete, true);
  });

  it('preserves cleanup error precedence and emits nested failures in execution order', async () => {
    const records = [];
    const observer = (record) => records.push(record);
    const bodyError = new Error('body');
    const cleanupError = new Error('cleanup');
    await assert.rejects(observePackageAsync(observer, 'owner', async () => {
      try {
        observePackageSync(observer, 'body', () => {
          throw bodyError;
        });
      } finally {
        await observePackageAsync(observer, 'cleanup', async () => {
          throw cleanupError;
        });
      }
    }), (caught) => caught === cleanupError);
    assert.deepEqual(records.filter((record) => record.event === 'end')
      .map(({stage, outcome}) => [stage, outcome]),
    [['body', 'error'], ['cleanup', 'error'], ['owner', 'error']]);
    finishPackageObservation(observer);
  });

  it('contains throwing, async-rejecting, thenable and unsupported sinks', async () => {
    const result = {};
    for (const sink of [() => {
      throw new Error('sink');
    },
    async () => {
      throw new Error('async sink');
    },
    () => ({then(_resolve, reject) {
      reject(new Error('thenable sink'));
    }}), 'invalid']) {
      assert.equal(observePackageSync(sink, 'body', () => result), result);
      assert.equal(await observePackageAsync(sink, 'async-body', async () => result), result);
      assert.equal(finishPackageObservation(sink).complete, false);
    }
    await new Promise((resolve) => setImmediate(resolve));
  });

  it('contains snapshot accessors and refuses closed-observer reuse explicitly', () => {
    const observer = () => {};
    Object.defineProperty(observer, 'snapshot', {get() {
      throw new Error('snapshot getter');
    }});
    observePackageSync(observer, 'body', () => {});
    assert.doesNotThrow(() => snapshotPackageObservation(observer, 'installed-package', '/unused'));
    assert.match(finishPackageObservation(observer).failures, /snapshot-installed-package-failed/u);
    assert.equal(observePackageSync(observer, 'after-close', () => 42), 42);
    assert.match(finishPackageObservation(observer).failures, /observer-already-closed/u);
  });

  it('rejects truncated, removed, duplicate, out-of-order and inconsistent records', () => {
    const records = [];
    const observer = (record) => records.push(record);
    observePackageSync(observer, 'owner', () => observePackageSync(observer, 'command',
      () => ({status: 0, signal: null}), 'command'));
    finishPackageObservation(observer);
    const validate = (value) => validatePackageObservation(value, {requiredStages: ['command']});
    assert.equal(validate(textOf(records)).complete, true);
    const commandEnd = records.findIndex((record) => record.kind === 'command' &&
      record.event === 'end');
    const wrongOutcome = records.map((record, index) => index === commandEnd ?
      {...record, outcome: 'error'} : record);
    const duplicateId = records.map((record) => record.stage === 'command' ?
      {...record, stageId: 1} : record);
    const inconsistentTerminal = records.map((record) => record.event === 'terminal' ?
      {...record, failures: 'unreported-failure'} : record);
    const withoutCommand = records.filter((record) => record.kind !== 'command')
      .map((record, index) => ({...record, sequence: index + 1}));
    for (const mutation of [textOf(records).slice(0, -1), textOf(records.slice(0, -1)),
      textOf(records.filter((_record, index) => index !== commandEnd)), textOf(wrongOutcome),
      textOf(duplicateId), textOf(inconsistentTerminal), textOf(withoutCommand),
      textOf([records.at(-1)]), textOf([...records, records.at(-1)]),
      '{broken json}\n']) {
      assert.equal(validate(mutation).complete, false, mutation);
    }
  });

  it('rejects counterfeit snapshot/command outcomes and records outside the session', () => {
    const records = [];
    const observer = (record) => records.push(record);
    observer.snapshot = () => ({outcome: 'saved', bytes: 7});
    observePackageSync(observer, 'owner', () => {
      observePackageSync(observer, 'command', () => ({status: 0, signal: null}), 'command');
      snapshotPackageObservation(observer, 'installed-package', '/fixture');
    });
    finishPackageObservation(observer);
    assert.equal(validatePackageObservation(textOf(records)).complete, true);
    const mutate = (predicate, fields) => records.map((record) => predicate(record) ?
      {...record, ...fields} : record);
    const isCommandEnd = (record) => record.kind === 'command' && record.event === 'end';
    const isSnapshot = (record) => record.event === 'snapshot';
    const snapshot = records.find(isSnapshot);
    const mutations = [
      ...[{status: '0'}, {signal: {}}, {errorCode: {}}, {signal: 'SIGTERM'},
        {errorCode: 'ETIMEDOUT'}].map((fields) => mutate(isCommandEnd, fields)),
      ...[{snapshotOutcome: 'error', bytes: 0}, {snapshotOutcome: 'missing', bytes: 0},
        {snapshotOutcome: 'optional-missing', bytes: 0}, {bytes: {}}, {bytes: -1},
        {bytes: SNAPSHOT_MAX_BYTES + 1}, {artifact: 'undeclared'}, {parentStageId: 999}]
        .map((fields) => mutate(isSnapshot, fields)),
      [snapshot, ...records],
      [...records.slice(0, -1), ...records.slice(1, 3), records.at(-1)],
      [...records.slice(0, -2), snapshot, ...records.slice(-2)],
    ];
    for (const mutation of mutations) {
      const renumbered = mutation.map((record, index) => ({...record, sequence: index + 1}));
      assert.equal(validatePackageObservation(textOf(renumbered)).complete, false);
    }
  });

  it('reads snapshot metadata once and never exposes a returned object', () => {
    const records = [];
    const observer = (record) => records.push(record);
    let reads = 0;
    observer.snapshot = () => ({outcome: 'saved', get bytes() {
      reads += 1;
      return reads === 1 ? 7 : {private: true};
    }});
    observePackageSync(observer, 'owner', () =>
      snapshotPackageObservation(observer, 'installed-package', '/fixture'));
    finishPackageObservation(observer);
    assert.equal(reads, 1);
    assert.equal(records.find((record) => record.event === 'snapshot').bytes, 7);
  });
});

describe('bounded package diagnostic snapshots', () => {
  it('retains exact bytes before deletion, missing optional state and measured snapshot overhead', (t) => {
    const root = fixture(t);
    const output = join(root, 'output');
    const source = join(root, 'package.json');
    const bytes = Buffer.from('{"name":"lagrange-server","version":"1.0.0"}\n');
    writeFileSync(source, bytes);
    const sink = createPackageDiagnosticSink(output);
    observePackageSync(sink, 'owner', () => {
      snapshotPackageObservation(sink, 'packed', {gitHead: 'a'.repeat(40), integrity: 'sha512-id'});
      snapshotPackageObservation(sink, 'installed-package', source);
      snapshotPackageObservation(sink, 'installed-lock', join(root, 'missing-lock'));
    });
    rmSync(source);
    const status = finishPackageObservation(sink);
    assert.equal(status.complete, true);
    assert.deepEqual(readFileSync(join(output, PACKAGE_DIAGNOSTIC_FILES['installed-package'])), bytes);
    const trace = readFileSync(join(output, PACKAGE_DIAGNOSTIC_FILES.trace), 'utf8');
    assert.equal(validatePackageObservation(trace).complete, true);
    assert.match(trace, /optional-missing/u);
    const terminal = JSON.parse(trace.trim().split('\n').at(-1));
    assert.ok(terminal.overheadMs > 0);
    assert.ok(terminal.overheadMs >= sink.setupOverheadMs);
    assert.equal(terminal.overheadScope, 'setup-records-and-snapshots-before-terminal-write');
    assert.equal(readdirSync(output).length, 3);
  });

  it('bounds snapshots and trace while reserving a truthful terminal record', (t) => {
    const root = fixture(t);
    const output = join(root, 'output');
    const source = join(root, 'large.json');
    writeFileSync(source, Buffer.alloc(SNAPSHOT_MAX_BYTES + 1));
    const sink = createPackageDiagnosticSink(output);
    observePackageSync(sink, 'owner', () => {
      snapshotPackageObservation(sink, 'installed-package', source);
      for (let index = 0; index < 2000; index += 1) {
        observePackageSync(sink, 'bounded-record', () => {});
      }
    });
    assert.equal(finishPackageObservation(sink).complete, false);
    const trace = readFileSync(join(output, PACKAGE_DIAGNOSTIC_FILES.trace), 'utf8');
    assert.ok(Buffer.byteLength(trace) <= TRACE_MAX_BYTES);
    assert.equal(JSON.parse(trace.trim().split('\n').at(-1)).outcome, 'incomplete');
    assert.equal(validatePackageObservation(trace).complete, false);
    assert.ok(readdirSync(output).reduce((total, name) => total +
      statSync(join(output, name)).size, 0) <= TOTAL_MAX_BYTES);
    assert.equal(readdirSync(output).includes(PACKAGE_DIAGNOSTIC_FILES['installed-package']), false);
  });

  it('records required missing metadata and failed output without changing the body result', (t) => {
    const root = fixture(t);
    const sink = createPackageDiagnosticSink(join(root, 'output'));
    assert.equal(observePackageSync(sink, 'owner', () => {
      snapshotPackageObservation(sink, 'installed-package', join(root, 'missing'));
      return 23;
    }), 23);
    assert.equal(finishPackageObservation(sink).complete, false);
    const notDirectory = join(root, 'file');
    writeFileSync(notDirectory, 'file');
    const brokenSink = createPackageDiagnosticSink(join(notDirectory, 'output'));
    assert.equal(observePackageSync(brokenSink, 'owner', () => 23), 23);
    assert.equal(finishPackageObservation(brokenSink).complete, false);
  });

  it('preserves stale destination bytes and refuses the new observation', (t) => {
    const root = fixture(t);
    const stale = join(root, PACKAGE_DIAGNOSTIC_FILES.packed);
    writeFileSync(stale, 'earlier evidence');
    const sink = createPackageDiagnosticSink(root);
    assert.equal(observePackageSync(sink, 'body', () => 23), 23);
    assert.equal(finishPackageObservation(sink).complete, false);
    assert.equal(readFileSync(stale, 'utf8'), 'earlier evidence');
    assert.deepEqual(readdirSync(root), [PACKAGE_DIAGNOSTIC_FILES.packed]);
  });

  it('rejects a FIFO without blocking the owner or its cleanup', (t) => {
    const root = fixture(t);
    const fifo = join(root, 'package.json');
    const created = spawnSync('mkfifo', [fifo], {encoding: 'utf8'});
    assert.equal(created.status, 0, created.stderr);
    const observationUrl = new URL('../../scripts/npm-package-observation.js', import.meta.url).href;
    const sinkUrl = new URL('../../scripts/npm-package-diagnostic-sink.js', import.meta.url).href;
    const child = spawnSync(process.execPath, ['--input-type=module', '--eval', `
      import {observePackageSync, snapshotPackageObservation, finishPackageObservation}
        from ${JSON.stringify(observationUrl)};
      import {createPackageDiagnosticSink} from ${JSON.stringify(sinkUrl)};
      const sink = createPackageDiagnosticSink(${JSON.stringify(join(root, 'output'))});
      let cleanup = false;
      const result = observePackageSync(sink, 'owner', () => {
        try { snapshotPackageObservation(sink, 'installed-package', ${JSON.stringify(fifo)}); }
        finally { cleanup = true; }
        return 42;
      });
      process.stdout.write(JSON.stringify({result, cleanup, status: finishPackageObservation(sink)}));
    `], {encoding: 'utf8', timeout: 3000});
    assert.equal(child.status, 0, child.stderr);
    const result = JSON.parse(child.stdout);
    assert.equal(result.result, 42);
    assert.equal(result.cleanup, true);
    assert.equal(result.status.complete, false);
  });

  it('closes on terminal write/bound/serialization failure and preserves the primary failure', (t) => {
    const root = fixture(t);
    const observationUrl = new URL('../../scripts/npm-package-observation.js', import.meta.url).href;
    const sinkUrl = new URL('../../scripts/npm-package-diagnostic-sink.js', import.meta.url).href;
    const child = spawnSync(process.execPath, ['--input-type=module', '--eval', `
      import fs from 'node:fs';
      import {join} from 'node:path';
      import {syncBuiltinESMExports} from 'node:module';
      const originalOpen = fs.openSync;
      const originalWrite = fs.writeFileSync;
      const originalClose = fs.closeSync;
      const writeError = new Error('terminal write failed');
      const closeError = new Error('secondary close failed');
      let traceDescriptor;
      let traceIdentity;
      let traceActive = false;
      let closedDuringRelease = false;
      let mode;
      fs.openSync = (...args) => {
        const descriptor = originalOpen(...args);
        if (String(args[0]).endsWith('trace.ndjson')) {
          traceDescriptor = descriptor;
          traceIdentity = fs.fstatSync(descriptor);
          traceActive = true;
          closedDuringRelease = false;
        }
        return descriptor;
      };
      fs.writeFileSync = (descriptor, bytes, ...args) => {
        if (mode === 'write' && traceActive && descriptor === traceDescriptor &&
          String(bytes).includes('"event":"terminal"')) throw writeError;
        return originalWrite(descriptor, bytes, ...args);
      };
      fs.closeSync = (descriptor) => {
        originalClose(descriptor);
        if (traceActive && descriptor === traceDescriptor) {
          traceActive = false;
          try { fs.fstatSync(descriptor); }
          catch (error) { closedDuringRelease = error.code === 'EBADF'; }
          throw closeError;
        }
      };
      syncBuiltinESMExports();
      const {observePackageSync, finishPackageObservation} = await import(
        ${JSON.stringify(observationUrl)});
      const {createPackageDiagnosticSink, TRACE_MAX_BYTES} = await import(
        ${JSON.stringify(sinkUrl)});
      const results = [];
      for (mode of ['write', 'bound', 'serialize']) {
        const sink = createPackageDiagnosticSink(join(${JSON.stringify(root)}, mode));
        let primary;
        const observer = (record) => {
          let supplied = record;
          if (record.event === 'terminal' && mode === 'bound') {
            supplied = {...record, padding: 'x'.repeat(TRACE_MAX_BYTES)};
          }
          if (record.event === 'terminal' && mode === 'serialize') {
            supplied = {...record};
            supplied.circular = supplied;
          }
          try { sink(supplied); }
          catch (error) { primary = error; throw error; }
        };
        const value = observePackageSync(observer, 'body', () => 42);
        const status = finishPackageObservation(observer);
        let lateDescriptorState;
        try {
          const late = fs.fstatSync(traceDescriptor);
          lateDescriptorState = late.dev === traceIdentity.dev && late.ino === traceIdentity.ino ?
            'still-open' : 'reused';
        } catch (error) {
          lateDescriptorState = error.code === 'EBADF' ? 'closed' : 'unknown';
        }
        results.push({mode, value, status, closedDuringRelease, lateDescriptorState,
          primaryPreserved: mode === 'write' ? primary === writeError : primary !== closeError});
      }
      process.stdout.write(JSON.stringify(results));
    `], {encoding: 'utf8', timeout: 3000});
    assert.equal(child.status, 0, child.stderr);
    const results = JSON.parse(child.stdout);
    t.diagnostic(JSON.stringify(results.map(({mode, lateDescriptorState}) =>
      ({mode, lateDescriptorState}))));
    for (const result of results) {
      assert.equal(result.value, 42);
      assert.equal(result.status.complete, false);
      assert.equal(result.closedDuringRelease, true, result.mode);
      assert.ok(['closed', 'reused'].includes(result.lateDescriptorState), result.mode);
      assert.equal(result.primaryPreserved, true, result.mode);
    }
  });
});

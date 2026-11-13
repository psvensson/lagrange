import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
import {runClassifiedTestFiles} from '../../scripts/run-classified-test-files.js';
import {runTestFiles} from '../../scripts/run-test-files.js';
import {nativeThermalFixture} from './native-thermal-fixture.js';

const MINUTE = 60000;
function fixture(t, count) {
  const native = nativeThermalFixture(t);
  const root = native.root;
  const files = Array.from({length: count}, (_, index) => `cadence-${index}.test.js`);
  return {root, files};
}

test('operator-paced blind policy waits after actual closure and records unavailable readings',
  {timeout: MINUTE}, async (t) => {
    const {root, files} = fixture(t, 2);
    const ledger = path.join(root, 'cadence-ledger');
    for (const file of files) {
      fs.writeFileSync(path.join(root, file), [
        'import {test} from \'node:test\';',
        'import {appendFileSync} from \'node:fs\';',
        `const ledger = ${JSON.stringify(ledger)};`,
        'appendFileSync(ledger, JSON.stringify({kind:\'start\', at:Date.now()}) + \'\\n\');',
        'test(\'finite\', () => {});',
        'process.on(\'exit\', () => appendFileSync(ledger, ' +
          'JSON.stringify({kind:\'exit\', at:Date.now()}) + \'\\n\'));',
      ].join('\n'));
    }
    const native = nativeThermalFixture(t, {outcomes: ['UNAVAILABLE'],
      policy: {mode: 'operator-paced', cadence_ms: 5000, max_concurrency: 1}});
    const lines = [];
    const result = await runTestFiles(files, {print: false, cwd: root, env: native.env, jobs: 4,
      write(line) {
        lines.push(line);
      }});
    assert.equal(result.ok, true);
    const events = fs.readFileSync(ledger, 'utf8').trim().split('\n').map(JSON.parse);
    assert.deepEqual(events.map((event) => event.kind), ['start', 'exit', 'start', 'exit']);
    assert.ok(events[2].at - events[1].at >= 5000, JSON.stringify(events));
    assert.ok(lines.some((line) => line.includes('OPERATOR_PACED') &&
      line.includes('"observation_outcome":"UNAVAILABLE"')));
  });

test('operator cadence also spans actual classified lane child boundaries',
  {timeout: MINUTE}, (t) => {
    const native = nativeThermalFixture(t, {outcomes: ['UNAVAILABLE'],
      policy: {mode: 'operator-paced', cadence_ms: 5000, max_concurrency: 1}});
    const files = ['test/unit/first.test.js', 'test/integration/second.integration.test.js'];
    const ledger = path.join(native.root, 'lane-times');
    for (const file of files) {
      const target = path.join(native.root, file);
      fs.mkdirSync(path.dirname(target), {recursive: true});
      fs.writeFileSync(target, [
        'import {test} from \'node:test\';',
        'import {appendFileSync} from \'node:fs\';',
        `const ledger = ${JSON.stringify(ledger)};`,
        'appendFileSync(ledger, JSON.stringify({kind:\'start\', at:Date.now()}) + \'\\n\');',
        'test(\'finite body\', () => {});',
        'process.on(\'exit\', () => appendFileSync(ledger, ' +
          'JSON.stringify({kind:\'exit\', at:Date.now()}) + \'\\n\'));',
      ].join('\n'));
    }
    let batches = 0;
    const status = runClassifiedTestFiles(files, {root: native.root, env: native.env, write() {},
      spawn(command, args, options) {
        batches += 1;
        const result = spawnSync(command, [path.join(process.cwd(), args[0]), ...args.slice(1)],
          {...options, stdio: ['ignore', 'pipe', 'pipe', 'pipe'], encoding: 'utf8',
            maxBuffer: 1024 * 1024, timeout: MINUTE});
        assert.ifError(result.error);
        assert.equal(result.signal, null, result.stderr);
        return result;
      }});
    assert.equal(status, 0);
    assert.equal(batches, 2);
    const events = fs.readFileSync(ledger, 'utf8').trim().split('\n').map(JSON.parse);
    assert.deepEqual(events.map((event) => event.kind), ['start', 'exit', 'start', 'exit']);
    assert.ok(events[2].at - events[1].at >= 5000, JSON.stringify(events));
  });

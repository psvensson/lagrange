import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {inspectLifecycleRetirements} from './lifecycle-retirement-census.js';

const file = '/project/src/node/consumer.js';
const ownerFile = '/project/src/raft/raft-rs-lifecycle-administration.js';
const prefix = "import {raftRsLifecycleAdministration as admin} from '../raft/raft-rs-lifecycle-administration.js';\n";
const inspect = (body) => inspectLifecycleRetirements(prefix + body, {file, ownerFile});

test('native census distinguishes the WASM creation owner and ignores comments and strings', () => {
  const result = inspect("lifecycle.retireReplica(origin); // admin.retireReplica(id, reason);\nconst text = 'admin.retireReplica(id)';");
  assert.deepEqual(result, {calls: [], violations: []});
});

test('native census follows renamed imports and literal computed calls', () => {
  for (const method of ['admin.retireReplica', "admin['retireReplica']"]) {
    const result = inspect(`${method}(id, reason, {groupId, runtime: captured});`);
    assert.equal(result.calls.length, 1);
    assert.deepEqual(result.violations, []);
    assert.equal(inspect(`${method}(id, reason, {groupId});`).violations.length, 1);
  }
});

test('native census rejects escaped, destructured, dynamic and shadowed bindings', () => {
  for (const body of [
    'const alias = admin; alias.retireReplica(id, reason);',
    'const {retireReplica: retire} = admin; retire(id, reason);',
    'const retire = admin.retireReplica; retire(id, reason);',
    'admin[method](id, reason, {runtime});',
    'function shadow(admin) { admin.retireReplica(id, reason, {runtime}); }',
  ]) assert.ok(inspect(body).violations.length > 0, body);
});

test('native census rejects missing and overwritten runtime but admits explicit shorthand', () => {
  for (const options of ['{}', 'options', '{runtime, ...later}', '{runtime, [key]: value}',
    '{runtime, runtime: other}']) {
    assert.ok(inspect(`admin.retireReplica(id, reason, ${options});`).violations.length > 0, options);
  }
  assert.deepEqual(inspect('admin.retireReplica(id, reason, {...before, runtime});').violations, []);
});

test('native census detects removing the runtime from the actual production call', () => {
  const file = fileURLToPath(new URL('../../../src/node/replica-handler-remove-execution-methods.js', import.meta.url));
  const ownerFile = fileURLToPath(new URL('../../../src/raft/raft-rs-lifecycle-administration.js', import.meta.url));
  const source = readFileSync(file, 'utf8');
  const positive = inspectLifecycleRetirements(source, {file, ownerFile});
  assert.ok(positive.calls.length > 0);
  assert.deepEqual(positive.violations, []);
  const mutant = source.replace('runtime: service?.raft ?? null', 'notRuntime: service?.raft ?? null');
  assert.notEqual(mutant, source, 'the real retirement target must be engaged');
  const negative = inspectLifecycleRetirements(mutant, {file, ownerFile});
  assert.equal(negative.calls.length, positive.calls.length);
  assert.ok(negative.violations.some(({reason}) => reason.includes('explicit non-overwritten runtime')));
});

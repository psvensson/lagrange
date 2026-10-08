import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';

const SOURCE_ROOT = path.resolve('src');
const CREATOR_CALL = 'createSqliteStateMachineCheckpoint({';

function javascriptFiles(root) {
  return fs.readdirSync(root, {withFileTypes: true}).flatMap((entry) => {
    const file = path.join(root, entry.name);
    return entry.isDirectory() ? javascriptFiles(file) :
      entry.isFile() && entry.name.endsWith('.js') ? [file] : [];
  });
}

test('dependency A leaves every production snapshot activation path closed',
  () => {
    const callers = javascriptFiles(SOURCE_ROOT).flatMap((file) => {
      const source = fs.readFileSync(file, 'utf8');
      return source.includes(CREATOR_CALL) ?
        [{file: path.relative('.', file), source}] : [];
    }).filter(({file}) =>
      file !== 'src/raft/snapshot-checkpoint-store.js');

    assert.deepEqual(callers.map(({file}) => file), [
      'src/raft/snapshot-catchup.js',
    ], 'the registered catch-up dispatcher remains the only production caller');
    const call = callers[0].source.slice(
      callers[0].source.indexOf(CREATOR_CALL),
      callers[0].source.indexOf(CREATOR_CALL) + 500);
    assert.equal(call.includes('raftRsGroupId'), false,
      'dependency A must not activate the direct v2 owner through live dispatch');

    const cadence = fs.readFileSync(
      path.join(SOURCE_ROOT, 'partition/partition-snapshot-cadence.js'),
      'utf8');
    assert.match(cadence, /COMMITTED_LOG_UNSUPPORTED/u,
      'automatic rs-raft snapshot cadence remains explicitly parked');
    assert.doesNotMatch(cadence, /createSqliteStateMachineCheckpoint/u,
      'cadence does not activate checkpoint production');
  });

import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

test('the verified integration remains green while transport has no raft-rs node access',
  () => {
    const phaseTests = [
      'backend-seam.test.js',
      'durable-ready-loop.test.js',
      'restart-from-durable-record.test.js',
      'conf-state-authority.test.js',
      'election-safety.test.js',
      'peer-identity.test.js',
      'real-partition-on-raft-rs.test.js',
    ].map((name) => path.join(
      ROOT, 'test', 'raft', 'raft-rs-backend', name));
    try {
      execFileSync(
        process.execPath,
        ['--test', ...phaseTests],
        {cwd: ROOT, encoding: 'utf8', stdio: 'pipe'},
      );
    } catch (error) {
      const stdout = String(error?.stdout || '');
      const stderr = String(error?.stderr || '');
      assert.fail(
        'the migrated phases-1-through-5 behavioral evidence must stay green' +
        `\n--- child stdout ---\n${stdout}` +
        `\n--- child stderr ---\n${stderr}`,
      );
    }
    const provider = fs.readFileSync(
      path.join(ROOT, 'src', 'raft', 'raft-rs-provider.js'), 'utf8');
    const transportQuest = path.join(ROOT, 'solve', 'quests',
      'raft-rs-partition-transport-demux', 'quest.json');
    assert.match(provider, /createPartitionPort/u,
      'phase integration enters raft-rs only through the operation port');
    assert.doesNotMatch(provider,
      /createPartitionNode|createNodeClass|partitionControlOf|raftRsGroupOf/u);
    if (fs.existsSync(transportQuest)) {
      const transport = JSON.parse(fs.readFileSync(transportQuest, 'utf8'));
      assert.notEqual(transport.status, 'complete',
        'transport stays blocked until this quest is independently approved');
    }
  });

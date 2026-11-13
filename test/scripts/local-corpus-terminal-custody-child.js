// Finite process fixture for the real local-corpus state writers. The only
// execution substitute is the gate command: an actual Node child exits 23.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {reconcileLocalCorpus, runLocalCorpus} from '../../scripts/publish-local-corpus.js';
import {readLocalCorpusRecords} from '../../scripts/publish-local-corpus-state.js';

const [mode, directory, head] = process.argv.slice(2);
const stateDir = path.join(directory, 'state');
const barrierBoundMs = 15000;
const pollMs = 10;
const waitCell = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));

function waitForRelease(name) {
  const deadline = Date.now() + barrierBoundMs;
  while (!fs.existsSync(path.join(directory, name))) {
    if (Date.now() >= deadline) throw new Error(`fixture barrier expired: ${name}`);
    Atomics.wait(waitCell, 0, 0, pollMs);
  }
}

function produceTerminal() {
  let commands = 0;
  const status = runLocalCorpus(directory, head, {stateDir,
    run(command, args) {
      commands += 1;
      assert.equal(commands, 1, 'the RED path executes only its gate collaborator');
      assert.equal(command, process.execPath);
      assert.equal(args[0], 'scripts/checks/push-gate-corpus-worktree.js');
      const running = readLocalCorpusRecords(stateDir).find((record) => record.sha === head);
      assert.equal(running.state, 'running');
      assert.equal(running.pid, process.pid);
      fs.writeFileSync(path.join(directory, 'producer-ready'), JSON.stringify(running));
      waitForRelease('release-producer');
      return spawnSync(process.execPath, ['-e', 'process.exitCode = 23'],
        {stdio: 'inherit', timeout: 5000, killSignal: 'SIGKILL'});
    },
  });
  assert.equal(status, 23, 'the actual subprocess failure reaches runLocalCorpus');
  process.exitCode = status;
}

function reconcileSnapshot() {
  const running = readLocalCorpusRecords(stateDir).find((record) => record.sha === head);
  assert.equal(running.state, 'running');
  const read = fs.readFileSync;
  const kill = process.kill;
  let captures = 0;
  const probes = [];
  fs.readFileSync = function(file, ...args) {
    try {
      return read.call(this, file, ...args);
    } catch (error) {
      // The canonical reader has read RUNNING and reached its native absent
      // successor lookup. Delay returning that actual ENOENT, retaining the
      // old logical snapshot even when the producer commits during the pause.
      if (typeof file === 'string' && file.startsWith(path.join(stateDir, `${head}.from-`)) &&
          error.code === 'ENOENT' && captures === 0) {
        captures += 1;
        const snapshotFile = path.join(directory, 'snapshot.json');
        fs.writeFileSync(`${snapshotFile}.tmp`, JSON.stringify(running), {flag: 'wx'});
        fs.renameSync(`${snapshotFile}.tmp`, snapshotFile);
        waitForRelease('release-reconciler');
      }
      throw error;
    }
  };
  process.kill = function(pid, signal) {
    try {
      const result = kill.call(this, pid, signal);
      probes.push({pid, signal, result});
      return result;
    } catch (error) {
      probes.push({pid, signal, code: error.code});
      throw error;
    }
  };
  try {
    reconcileLocalCorpus(stateDir);
  } finally {
    fs.readFileSync = read;
    process.kill = kill;
    fs.writeFileSync(path.join(directory, 'reconciler-observations.json'),
      JSON.stringify({captures, probes}));
  }
}

if (mode === 'producer') produceTerminal();
else if (mode === 'reconciler') reconcileSnapshot();
else throw new Error(`unknown fixture mode: ${mode}`);

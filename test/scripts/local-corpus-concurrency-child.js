// Native process fixture. Barriers pause only filesystem publication or an
// already-read owner snapshot; all state decisions stay with production.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {runLocalCorpus} from '../../scripts/publish-local-corpus.js';
import {
  LOCAL_CORPUS_STATE as STATE, createLocalCorpusState, readLocalCorpusRecords, transitionLocalCorpusState,
} from '../../scripts/publish-local-corpus-state.js';

const [mode, directory, head, token, statusText = '23'] = process.argv.slice(2);
const stateDir = path.join(directory, 'state');
const status = Number(statusText);
const boundMs = 15000;
const waitCell = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));

function publish(name, value) {
  const file = path.join(directory, name);
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(value), {flag: 'wx'});
  fs.renameSync(`${file}.tmp`, file);
}

function wait(name) {
  const deadline = Date.now() + boundMs;
  while (!fs.existsSync(path.join(directory, name))) {
    if (Date.now() >= deadline) throw new Error(`child barrier expired: ${name}`);
    Atomics.wait(waitCell, 0, 0, 10);
  }
}

function gate() {
  const script = "require('fs').appendFileSync(process.argv[1], process.pid + '\\n');" +
    'process.exitCode = 23;';
  return spawnSync(process.execPath, ['-e', script, path.join(directory, 'gates.log')],
    {encoding: 'utf8', timeout: 5000, killSignal: 'SIGKILL'});
}

function claimant() {
  const link = fs.linkSync;
  let paused = false;
  fs.linkSync = function(source, destination) {
    const proposal = JSON.parse(fs.readFileSync(source, 'utf8'));
    if (!paused && proposal.record?.state === STATE.RUNNING) {
      paused = true;
      publish(`${token}-ready.json`, {pid: process.pid, destination, source});
      wait('release');
    }
    return link(source, destination);
  };
  try { return {status: runLocalCorpus(directory, head, {stateDir, run: gate})}; }
  finally { fs.linkSync = link; }
}

function terminalWriter() {
  const before = readLocalCorpusRecords(stateDir).find((entry) => entry.sha === head);
  publish(`${token}-ready.json`, {pid: process.pid, before});
  wait('release');
  return transitionLocalCorpusState(stateDir, before,
    {...before, state: STATE.RED, status, finishedAt: 2});
}

function crashWriter() {
  const before = readLocalCorpusRecords(stateDir).find((entry) => entry.sha === head);
  const link = fs.linkSync;
  const sync = fs.fsyncSync;
  let linked = false;
  let target;
  const pause = () => {
    publish(`${token}-ready.json`, {pid: process.pid, ...target, linked});
    wait('never-released');
  };
  fs.linkSync = function(source, destination) {
    target = {source, destination};
    if (mode === 'crash-before-link') pause();
    link(source, destination);
    linked = true;
    if (mode === 'crash-after-link') pause();
  };
  fs.fsyncSync = function(fd) {
    sync(fd);
    if (mode === 'crash-after-fsync' && linked && fs.fstatSync(fd).isDirectory()) pause();
  };
  try {
    return transitionLocalCorpusState(stateDir, before,
      {...before, state: STATE.RED, status, finishedAt: 2});
  } finally { fs.linkSync = link; fs.fsyncSync = sync; }
}

let result;
try {
  if (mode === 'admission') {
    publish(`${token}-ready.json`, {pid: process.pid});
    wait('release');
    result = createLocalCorpusState(stateDir, {sha: head, state: STATE.STARTING,
      pid: null, startedAt: status, files: 1, admission: token});
  }
  else if (mode === 'claimant') result = claimant();
  else if (mode === 'terminal') result = terminalWriter();
  else if (mode.startsWith('crash-')) result = crashWriter();
  else if (mode === 'producer') result = {status: runLocalCorpus(directory, head, {stateDir, run: gate})};
  else throw new Error(`unknown child mode: ${mode}`);
} catch (error) {
  result = {error: {message: error.message, code: error.code, outcome: error.outcome,
    destination: error.destination, proposalPath: error.proposalPath,
    record: error.record, completion: error.localCorpusCompletion}};
}
publish(`${token}-result.json`, result);

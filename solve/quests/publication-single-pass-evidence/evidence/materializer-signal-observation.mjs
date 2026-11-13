// Finite scheduling observation only. This is not a proof receipt or an
// acceptance check: the output states what the synchronous gate actually did
// after SIGTERM arrived while its child was alive. Run only on the lab.
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {execGit} from '../../../../scripts/checks/git-invocation.js';
import {gitProcessEnvironment} from '../../../../scripts/checks/git-process-environment.js';

const MATERIALIZER = fileURLToPath(
  new URL('../../../../scripts/checks/push-gate-corpus-worktree.js', import.meta.url));
const WAIT_MS = 10000;
const POLL_MS = 25;
const delay = () => new Promise((resolve) => setTimeout(resolve, POLL_MS));

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
    return false;
  }
}

function validPid(pid) {
  return Number.isInteger(pid) && pid > 0;
}

async function closedWithin(closed, label) {
  let timer;
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), WAIT_MS);
  });
  try {
    const outcome = await Promise.race([closed, deadline]);
    if (outcome === null) throw new Error(`${label} did not close within ${WAIT_MS}ms`);
    return outcome;
  } finally {
    clearTimeout(timer);
  }
}

async function observe(childExit) {
  let scratch = null;
  let child = null;
  let group = null;
  let owned = null;
  let closed = null;
  let terminal = null;
  let primary = null;
  let stdout = '';
  let stderr = '';
  const cleanupErrors = [];
  try {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'materializer-signal-'));
    const root = path.join(scratch, 'repo');
    fs.mkdirSync(root);
    const env = gitProcessEnvironment();
    delete env.NODE_TEST_CONTEXT;
    const gitOptions = {cwd: root, env, timeout: WAIT_MS};
    for (const args of [['init', '--quiet'], ['config', 'commit.gpgsign', 'false'],
      ['config', 'user.name', 'Signal Observation'],
      ['config', 'user.email', 'signal@example.invalid']]) execGit(args, gitOptions);
    fs.writeFileSync(path.join(root, 'README'), 'finite materializer signal observation\n');
    fs.writeFileSync(path.join(root, '.gitignore'), 'test-output\n');
    execGit(['add', '.'], gitOptions);
    execGit(['commit', '--quiet', '-m', 'finite source'], gitOptions);
    const marker = path.join(scratch, 'started.json');
    const markerDraft = marker + '.tmp';
    const release = path.join(scratch, 'release');
    const original = `finite original diagnostic, child exit ${childExit}\n`;
    const report = JSON.stringify({commands: [{status: 'FAIL',
      artifactIdentity: {path: 'test-output/acceptance/original.txt'}}]});
    const command = [
      'const fs = require("node:fs");',
      'fs.mkdirSync("test-output/acceptance", {recursive: true});',
      `fs.writeFileSync("test-output/acceptance/gate.report.json", ${JSON.stringify(report)});`,
      `fs.writeFileSync("test-output/acceptance/original.txt", ${JSON.stringify(original)});`,
      `fs.writeFileSync(${JSON.stringify(markerDraft)}, JSON.stringify({` +
        'pid: process.pid, parent: process.ppid, checkout: process.cwd()}));',
      `fs.renameSync(${JSON.stringify(markerDraft)}, ${JSON.stringify(marker)});`,
      `const timer = setInterval(() => { if (fs.existsSync(${JSON.stringify(release)})) {` +
        `clearInterval(timer); process.exit(${childExit}); } }, ${POLL_MS});`,
      `setTimeout(() => process.exit(99), ${WAIT_MS});`,
    ].join('\n');
    child = spawn(process.execPath,
      [MATERIALIZER, '--gate', 'HEAD', '--run', process.execPath, '-e', command],
      {cwd: root, env, detached: true, stdio: ['ignore', 'pipe', 'pipe']});
    if (validPid(child.pid)) group = child.pid;
    // Observe error immediately, but terminal custody waits for closed stdio.
    // The promise never rejects while marker polling is still in progress.
    let childError = null;
    closed = new Promise((resolve) => {
      child.once('error', (error) => {
        childError = {name: error.name, code: error.code, message: error.message};
      });
      child.once('close', (code, signal) => {
        terminal = {code, signal, error: childError};
        resolve(terminal);
      });
    });
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    const started = Date.now();
    while (!fs.existsSync(marker) && !terminal && Date.now() - started < WAIT_MS) await delay();
    if (!fs.existsSync(marker)) {
      throw new Error(`finite child did not start: ${JSON.stringify(terminal)} ${stderr}`);
    }
    if (terminal) {
      throw new Error(`materializer closed before the signal: ${JSON.stringify(terminal)} ${stderr}`);
    }
    owned = JSON.parse(fs.readFileSync(marker, 'utf8'));
    if (!validPid(owned.pid) || owned.parent !== group || !alive(owned.pid)) {
      throw new Error('the observation did not acquire the expected live child');
    }
    const signalSent = child.kill('SIGTERM');
    if (!signalSent) {
      throw new Error(`SIGTERM was not sent: ${JSON.stringify(terminal)} ${stderr}`);
    }
    fs.writeFileSync(release, 'finish the already acquired child\n');
    const outcome = await closedWithin(closed, 'the materializer');
    const originalPath = path.join(owned.checkout, 'test-output/acceptance/original.txt');
    const archive = path.join(root, 'test-output', 'push-gate');
    const archived = fs.existsSync(archive) ? fs.readdirSync(archive).filter((entry) => {
      const file = path.join(archive, entry, 'original.txt');
      return fs.existsSync(file) && fs.readFileSync(file, 'utf8') === original;
    }) : [];
    process.stdout.write(JSON.stringify({kind: 'materializer-signal-observation',
      ceiling: 'scheduling and evidence observation only', childExit, signalSent, outcome,
      childAliveAfterClose: alive(owned.pid),
      originalRetained: fs.existsSync(originalPath) &&
        fs.readFileSync(originalPath, 'utf8') === original,
      archived, stdout, stderr}) + '\n');
  } catch (error) {
    primary = error;
  } finally {
    // Each acquired resource gets its own cleanup attempt. A failed wait or
    // signal cannot skip scratch cleanup or replace the first setup error.
    const cleanups = [
      ['owned process group', () => {
        if (!validPid(group)) return;
        try {
          process.kill(-group, 'SIGKILL');
        } catch (error) {
          if (error.code !== 'ESRCH') throw error;
        }
      }],
      ['materializer close', async () => {
        if (closed) await closedWithin(closed, 'the materializer during cleanup');
      }],
      ['scratch', () => {
        if (scratch) fs.rmSync(scratch, {recursive: true, force: true});
      }],
    ];
    for (const [resource, cleanup] of cleanups) {
      try {
        await cleanup();
      } catch (error) {
        cleanupErrors.push({resource, error});
      }
    }
  }
  for (const {resource, error} of cleanupErrors) {
    process.stderr.write(JSON.stringify({kind: 'materializer-signal-cleanup-unavailable',
      childExit, resource, message: error.message, primary: primary?.message ?? null}) + '\n');
  }
  if (primary) throw primary;
  if (cleanupErrors.length > 0) throw cleanupErrors[0].error;
}

await observe(0);
await observe(42);

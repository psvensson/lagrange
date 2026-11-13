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

async function observe(childExit) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'materializer-signal-'));
  const root = path.join(scratch, 'repo');
  fs.mkdirSync(root);
  const env = gitProcessEnvironment();
  delete env.NODE_TEST_CONTEXT;
  for (const args of [['init', '--quiet'], ['config', 'commit.gpgsign', 'false'],
    ['config', 'user.name', 'Signal Observation'],
    ['config', 'user.email', 'signal@example.invalid']]) execGit(args, {cwd: root, env});
  fs.writeFileSync(path.join(root, 'README'), 'finite materializer signal observation\n');
  fs.writeFileSync(path.join(root, '.gitignore'), 'test-output\n');
  execGit(['add', '.'], {cwd: root, env});
  execGit(['commit', '--quiet', '-m', 'finite source'], {cwd: root, env});
  const marker = path.join(scratch, 'started.json');
  const release = path.join(scratch, 'release');
  const original = `finite original diagnostic, child exit ${childExit}\n`;
  const report = JSON.stringify({commands: [{status: 'FAIL',
    artifactIdentity: {path: 'test-output/acceptance/original.txt'}}]});
  const command = [
    'const fs = require("node:fs");',
    'fs.mkdirSync("test-output/acceptance", {recursive: true});',
    `fs.writeFileSync("test-output/acceptance/gate.report.json", ${JSON.stringify(report)});`,
    `fs.writeFileSync("test-output/acceptance/original.txt", ${JSON.stringify(original)});`,
    `fs.writeFileSync(${JSON.stringify(marker)}, JSON.stringify({` +
      'pid: process.pid, parent: process.ppid, checkout: process.cwd()}));',
    `const timer = setInterval(() => { if (fs.existsSync(${JSON.stringify(release)})) {` +
      `clearInterval(timer); process.exit(${childExit}); } }, ${POLL_MS});`,
    `setTimeout(() => process.exit(99), ${WAIT_MS});`,
  ].join('\n');
  const child = spawn(process.execPath,
    [MATERIALIZER, '--gate', 'HEAD', '--run', process.execPath, '-e', command],
    {cwd: root, env, detached: true, stdio: ['ignore', 'pipe', 'pipe']});
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  const closed = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({code, signal}));
  });
  try {
    const started = Date.now();
    while (!fs.existsSync(marker) && Date.now() - started < WAIT_MS) await delay();
    if (!fs.existsSync(marker)) throw new Error(`finite child did not start: ${stderr}`);
    const owned = JSON.parse(fs.readFileSync(marker, 'utf8'));
    if (owned.parent !== child.pid || !alive(owned.pid)) {
      throw new Error('the observation did not acquire the expected live child');
    }
    const signalSent = child.kill('SIGTERM');
    fs.writeFileSync(release, 'finish the already acquired child\n');
    const outcome = await closed;
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
  } finally {
    // Exactly the process group created by this finite fixture, never a lab
    // service or another run. The observation above precedes this cleanup.
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
    await closed;
    fs.rmSync(scratch, {recursive: true, force: true});
  }
}

await observe(0);
await observe(42);

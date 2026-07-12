// Tier-2c fresh-join formation stress (validation epic, quest 2).
// The joiner starts FIRST with every candidate down; the FIRST-listed
// candidate (node-1) comes up LAST. Binding observable: formation
// converges to 4 active nodes without the joiner wedging on a dead
// candidate. N runs in one process, fresh data dirs per run.
import {spawn} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import {mkdir, readFile, rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {
  queryRows,
  waitForClusterSize,
} from '/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/examples/service-data-affinity/cluster-harness.js';

const REPO = '/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something';
const TARGET = 'ws://127.0.0.1:8081/api/admin/stream';
const RUNS = 3;
const STRIDE = 4;
const BASE_REST = 8080;
const BASE_ADMIN = 8081;
const JOINER_REST = 8130;
const JOINER_ADMIN = 8131;
// Candidate list: node-1 FIRST (comes up last), seed second.
const CANDIDATES = `localhost:${BASE_REST + STRIDE},localhost:${BASE_REST}`;
const JOINER_HEAD_START_MS = 5000;
const NODE1_EXTRA_DELAY_MS = 8000;

function startNode({index, dataRoot, seed}) {
  const restPort = index === null ? JOINER_REST : BASE_REST + index * STRIDE;
  const adminPort = index === null ? JOINER_ADMIN : BASE_ADMIN + index * STRIDE;
  const name = index === null ? 'joiner' : `node-${index}`;
  const dir = resolve(dataRoot, name);
  const logStream = createWriteStream(resolve(dataRoot, `${name}.log`));
  const env = {
    ...process.env,
    NODE_ADDRESS: `localhost:${restPort}`,
    REST_API_PORT: String(restPort),
    ADMIN_WEBSOCKET_PORT: String(adminPort),
    DATA_DIR: dir,
    LOG_LEVEL: 'info',
  };
  const args = ['src/index.js', '--data-dir', dir];
  if (seed) {
    env.SEED_NODE_ADDRESS = seed;
    args.push('--seed', seed);
  }
  const child = spawn('node', args, {cwd: REPO, env, stdio: ['ignore', 'pipe', 'pipe']});
  child.stdout.pipe(logStream);
  child.stderr.pipe(logStream);
  return {name, process: child, dir};
}

async function stopAll(nodes) {
  for (const n of nodes) if (n.process.exitCode === null) n.process.kill('SIGTERM');
  const deadline = Date.now() + 15000;
  for (const n of nodes) {
    while (n.process.exitCode === null && Date.now() < deadline) await sleep(200);
    if (n.process.exitCode === null) n.process.kill('SIGKILL');
  }
}

let failures = 0;
for (let run = 1; run <= RUNS; run += 1) {
  const dataRoot = resolve(REPO, 'data', `tier2c-run${run}`);
  await rm(dataRoot, {recursive: true, force: true});
  await mkdir(dataRoot, {recursive: true});
  const nodes = [];
  const startedAt = Date.now();
  try {
    console.log(`--- run ${run}: joiner first, all candidates down`);
    nodes.push(startNode({index: null, dataRoot, seed: CANDIDATES}));
    await sleep(JOINER_HEAD_START_MS);
    nodes.push(startNode({index: 0, dataRoot, seed: null}));
    nodes.push(startNode({index: 2, dataRoot, seed: `localhost:${BASE_REST}`}));
    await sleep(NODE1_EXTRA_DELAY_MS);
    nodes.push(startNode({index: 1, dataRoot, seed: `localhost:${BASE_REST}`}));

    const formMs = await waitForClusterSize(TARGET, 4);
    const totalMs = Date.now() - startedAt;
    const rows = await queryRows(TARGET, 'SELECT node_id, status FROM nodes');
    const active = rows.filter((r) => r.status === 'active').length;
    console.log(`run ${run}: PASS — 4 nodes (active=${active}) in ${formMs}ms (total ${totalMs}ms)`);
    const joinerLog = await readFile(resolve(dataRoot, 'joiner.log'), 'utf8');
    const budgetExhausted = joinerLog.includes('resume budget exhausted');
    if (budgetExhausted) {
      console.log(`run ${run}: NOTE — joiner exhausted a retry budget before succeeding`);
    }
  } catch (error) {
    failures += 1;
    console.log(`run ${run}: FAIL — ${error?.message || error}`);
  } finally {
    await stopAll(nodes);
    await sleep(1500);
  }
}
console.log(failures === 0 ? `TIER-2C: PASS (${RUNS}/${RUNS})` : `TIER-2C: FAIL (${failures}/${RUNS} failed)`);
process.exit(failures === 0 ? 0 : 1);

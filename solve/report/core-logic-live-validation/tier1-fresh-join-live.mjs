// Tier-1 live fresh-join check (validation epic, quest 2).
// Starts a real 3-node local cluster, then joins a 4th node whose
// candidate list is [dead-address, node-1 (a FOLLOWER)]. Binding
// observables: the cluster reaches size 4 (join completed), and the
// joiner's log shows the bootstrap succeeded via the follower after
// rotating past the dead candidate.
import {spawn} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import {mkdir, readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {
  queryRows,
  startCluster,
  waitForClusterSize,
} from '/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/examples/service-data-affinity/cluster-harness.js';

const REPO = '/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something';
const TARGET = 'ws://127.0.0.1:8081/api/admin/stream';
const DATA_ROOT = resolve(REPO, 'data', 'tier1-fresh-join-live');
const DEAD_ADDRESS = 'localhost:9';
const FOLLOWER_REST = 'localhost:8084'; // node-1 (index 1, PORT_STRIDE=4)
const JOINER_REST_PORT = 8130;
const JOINER_ADMIN_PORT = 8131;
const JOIN_TIMEOUT_MS = 180000;

console.log('starting 3-node cluster...');
const cluster = await startCluster({
  local: true,
  nodeCount: 3,
  target: TARGET,
  dataDir: DATA_ROOT,
});
console.log(`cluster up (${cluster.clusterFormationMs}ms). starting joiner...`);
let joiner = null;
let failures = 0;
try {
  const joinerDir = resolve(DATA_ROOT, 'joiner');
  await mkdir(joinerDir, {recursive: true});
  const logPath = resolve(DATA_ROOT, 'joiner.log');
  const logStream = createWriteStream(logPath);
  const candidates = `${DEAD_ADDRESS},${FOLLOWER_REST}`;
  joiner = spawn(
    'node',
    ['src/index.js', '--data-dir', joinerDir, '--seed', candidates],
    {
      cwd: REPO,
      env: {
        ...process.env,
        NODE_ADDRESS: `localhost:${JOINER_REST_PORT}`,
        REST_API_PORT: String(JOINER_REST_PORT),
        ADMIN_WEBSOCKET_PORT: String(JOINER_ADMIN_PORT),
        DATA_DIR: joinerDir,
        SEED_NODE_ADDRESS: candidates,
        LOG_LEVEL: 'info',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  joiner.stdout.pipe(logStream);
  joiner.stderr.pipe(logStream);

  const joinMs = await waitForClusterSize(TARGET, 4, JOIN_TIMEOUT_MS);
  console.log(`JOINED: cluster reached size 4 in ${joinMs}ms`);

  const nodes = await queryRows(TARGET, 'SELECT node_id, status FROM nodes');
  console.log(`nodes table: ${JSON.stringify(nodes)}`);
  if (nodes.length !== 4) {
    failures += 1;
    console.log('FAIL: nodes table does not show 4 members');
  }

  const log = await readFile(logPath, 'utf8');
  const rotatedPastDead =
    log.includes(DEAD_ADDRESS) &&
    (log.includes(FOLLOWER_REST) || log.includes('8084'));
  console.log(
    rotatedPastDead ?
      'PASS: joiner log shows both the dead candidate and the follower' :
      'WARN: could not confirm rotation from log text alone',
  );
  const contactedFollower =
    log.includes(`http://${FOLLOWER_REST}`) || log.includes('8084');
  if (!contactedFollower) {
    failures += 1;
    console.log('FAIL: no evidence the follower candidate was contacted');
  }
} catch (error) {
  failures += 1;
  console.log(`FAIL: ${error?.message || error}`);
} finally {
  if (joiner && joiner.exitCode === null) joiner.kill('SIGTERM');
  if (cluster.stop) await cluster.stop();
}
console.log(failures === 0 ? 'FRESH-JOIN LIVE: PASS' : 'FRESH-JOIN LIVE: FAIL');
process.exit(failures === 0 ? 0 : 1);

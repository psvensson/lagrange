// @ts-nocheck
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {AdminWsClient} from '../../scripts/examples/admin-ws-client.js';
import {DEFAULT_TARGET, loadRatingsIntoLagrange} from './lagrange-loader.js';

const DEFAULT_DATA_DIR = 'data/examples/movielens-lagrange-node';
const EXAMPLE_ID = '07-movielens-access-affinity';

function parseArgs(argv) {
  const args = new Set(argv);
  return {
    noStart: args.has('--no-start'),
    target: process.env.LAGRANGE_TARGET || DEFAULT_TARGET,
    dataDir: process.env.LAGRANGE_DATA_DIR || DEFAULT_DATA_DIR,
  };
}

async function waitForAdmin(target, timeoutMs = 60000) {
  const client = new AdminWsClient({target, timeoutMs: 2000});
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await client.query('SELECT 1');
      await client.close();
      return;
    } catch {
      await sleep(1000);
    }
  }

  await client.close();
  throw new Error(`Timed out waiting for admin endpoint at ${target}`);
}

function startSeedNode(dataDir) {
  return spawn('bash', ['scripts/start-seed-node.sh'], {
    env: {
      ...process.env,
      DATA_DIR: dataDir,
    },
    stdio: 'inherit',
  });
}

async function runExample(target) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'node',
      [
        'scripts/examples/build-upload-run.js',
        '--include',
        EXAMPLE_ID,
        '--target',
        target,
      ],
      {stdio: 'inherit'},
    );

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Example runner exited with code ${code}`));
    });
  });
}

async function runLagrangeDemo(options = null) {
  const resolvedOptions = options || parseArgs(process.argv.slice(2));
  const {noStart, target, dataDir} = resolvedOptions;
  let nodeProcess = null;

  if (!noStart) {
    console.log('Starting seed node...');
    nodeProcess = startSeedNode(dataDir);
  }

  try {
    console.log('Waiting for admin endpoint...');
    await waitForAdmin(target);

    console.log('Loading ratings into Lagrange...');
    const loadStart = Date.now();
    const totalRows = await loadRatingsIntoLagrange({target});
    const loadDurationMs = Date.now() - loadStart;
    console.log(`Loaded ${totalRows} ratings into Lagrange.`);

    console.log('Running distributed callback example...');
    const callbackStart = Date.now();
    await runExample(target);
    const callbackDurationMs = Date.now() - callbackStart;

    return {
      totalRows,
      loadDurationMs,
      callbackDurationMs,
      target,
    };
  } finally {
    if (nodeProcess) {
      nodeProcess.kill('SIGTERM');
    }
  }
}

if (process.argv[1]?.includes('run-lagrange-demo.js')) {
  runLagrangeDemo()
    .then((metrics) => {
      console.log('Lagrange demo metrics:');
      console.log(JSON.stringify(metrics, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

export {runLagrangeDemo};

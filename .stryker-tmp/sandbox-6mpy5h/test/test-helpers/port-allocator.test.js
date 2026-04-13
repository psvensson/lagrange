// @ts-nocheck
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {test} from '../../src/test-helpers/tap.js';

const COLLIDING_FILE_ID_A =
  'test/integration/node-joining-rebalance.integration.test.js';
const COLLIDING_FILE_ID_B =
  'test/message-group/packet-round-trip-preservation.property.test.js';
const CHILD_SCRIPT = `
  import {createPortAllocator} from './src/test-helpers/port-allocator.js';
  const allocator = createPortAllocator(process.env.TEST_FILE_ID);
  process.stdout.write(String(allocator.getPort()) + '\\n');
  process.stdin.resume();
`;

function startAllocatorChild(fileId, namespace) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--input-type=module', '-e', CHILD_SCRIPT],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          DDB_TEST_PORT_ALLOCATOR_NAMESPACE: namespace,
          TEST_FILE_ID: fileId,
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );

    let resolved = false;
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      const newlineIndex = stdout.indexOf('\n');
      if (resolved || newlineIndex === -1) {
        return;
      }

      resolved = true;
      resolve({
        child,
        port: Number(stdout.slice(0, newlineIndex).trim()),
      });
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (!resolved) {
        reject(new Error(
          `allocator child exited before reporting a port: ${code}\n${stderr}`,
        ));
      }
    });
  });
}

function waitForChildExit(child) {
  return new Promise((resolve, reject) => {
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`allocator child exited with code ${code}`));
      }
    });
    child.on('error', reject);
  });
}

async function stopAllocatorChild(child) {
  child.stdin.end();
  await waitForChildExit(child);
}

test('createPortAllocator allocates distinct ports for colliding ids across processes',
  async (t) => {
    const namespace = `port-allocator-${randomUUID()}`;
    const first = await startAllocatorChild(COLLIDING_FILE_ID_A, namespace);
    const second = await startAllocatorChild(COLLIDING_FILE_ID_B, namespace);

    try {
      t.type(first.port, 'number', 'first child should return a numeric port');
      t.type(second.port, 'number', 'second child should return a numeric port');
      t.not(first.port, second.port,
        'colliding file ids should still reserve unique ports');
    } finally {
      await Promise.all([
        stopAllocatorChild(first.child),
        stopAllocatorChild(second.child),
      ]);
    }
  });

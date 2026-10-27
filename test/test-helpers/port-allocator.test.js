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

test('createPortAllocator reserves consecutive port blocks that never ' +
  'overlap later reservations', async (t) => {
  const {createPortAllocator} =
    await import('../../src/test-helpers/port-allocator.js');
  const allocator = createPortAllocator(`port-block-${randomUUID()}`);
  const first = allocator.getPortBlock(3);
  t.equal(first.length, 3, 'a block has the requested length');
  t.same(first, [first[0], first[0] + 1, first[0] + 2],
    'a block is consecutive');
  const single = allocator.getPort();
  const second = allocator.getPortBlock(3);
  const taken = new Set([...first, single]);
  t.notOk(second.some((port) => taken.has(port)),
    'a later block never reuses a reserved port');
  t.notOk(first.includes(single), 'a later single port is outside the block');
});

test('createPortAllocator reserves one runtime listener block the ' +
  'listener-port model derives from its REST port', async (t) => {
  const {createPortAllocator} =
    await import('../../src/test-helpers/port-allocator.js');
  const {resolveListenerPorts} =
    await import('../../src/config/listener-port-model.js');
  const allocator = createPortAllocator(`listener-block-${randomUUID()}`);
  const ports = allocator.getListenerPorts();
  t.same(ports, resolveListenerPorts({restApiPort: ports.restApiPort}),
    'admin and transport are what a peer derives from the REST port');
  const next = allocator.getListenerPorts();
  const taken = new Set(Object.values(ports));
  t.notOk(Object.values(next).some((port) => taken.has(port)),
    'a second runtime never shares a listener port with the first');
});

// A port held by a socket the allocator's state file does not know (on the
// WSL2 lab host: a port the Windows side holds inside its dynamic range) is
// skipped: every reservation test-binds before it hands a port out.
const HELD_PORT_CHILD_SCRIPT = `
  import net from 'node:net';
  import {createPortAllocator} from './src/test-helpers/port-allocator.js';
  const hold = (options) => new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(options, () => resolve(server));
  });
  const allocator = createPortAllocator(process.env.TEST_FILE_ID);
  const first = allocator.getPort();
  // The next request is first + 1: hold it on the wildcard address.
  const wildcard = await hold({port: first + 1});
  const second = allocator.getPort();
  // The next request walks to first + 3: hold it on the test host only.
  const loopback = await hold({host: '127.0.0.1', port: first + 3});
  const third = allocator.getPort();
  // A block whose middle port is held is never handed out.
  const blockHeld = await hold({port: first + 5});
  const block = allocator.getPortBlock(3);
  process.stdout.write(JSON.stringify({block, first, second, third}) + '\\n');
  for (const server of [wildcard, loopback, blockHeld]) server.close();
`;

test('a reservation test-binds: a port held by another socket (wildcard or ' +
  'loopback) is skipped, and so is a block containing one', async (t) => {
  const output = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath,
      ['--input-type=module', '-e', HELD_PORT_CHILD_SCRIPT], {
        cwd: process.cwd(),
        env: {...process.env,
          DDB_TEST_PORT_ALLOCATOR_NAMESPACE: `port-held-${randomUUID()}`,
          TEST_FILE_ID: `port-held-${randomUUID()}`},
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve(stdout) :
      reject(new Error(`held-port child exited ${code}\n${stderr}`))));
  });
  const {block, first, second, third} = JSON.parse(output);
  t.equal(second, first + 2, 'the wildcard-held port is skipped');
  t.equal(third, first + 4, 'the loopback-held port is skipped');
  t.notOk(block.includes(first + 5), 'no block contains a held port');
  t.same(block, [block[0], block[0] + 1, block[0] + 2],
    'the block is still consecutive');
});

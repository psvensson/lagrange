// Boundary fidelity for both supported harnesses. The HTTP owner answer and
// application read are controlled; this is not a live cluster/listener proof.
import {createServer} from 'node:http';
import {test} from '../../src/test-helpers/tap.js';
import {createPortAllocator} from '../../src/test-helpers/port-allocator.js';
import {NodeHandle} from '../distributed/harness/cluster.js';
import {provisionPublicListener} from '../distributed/scenarios/public-seam-durability-client.js';
import {enablePasswordPgwire} from './helpers/public-binding-seam-harness.js';

const ports = createPortAllocator(import.meta.url);
const HOST = '127.0.0.1';
const SCALE_PATH = '/api/admin/services/sys-postgres-wire/scale';

async function listen(t, port, handler) {
  const server = createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, HOST, resolve);
  });
  t.teardown(() => new Promise((resolve) => server.close(resolve)));
}

async function fixture(t) {
  const {restApiPort} = ports.getListenerPorts();
  const requests = [];
  let refusal = false;
  await listen(t, restApiPort, (_request, reply) => reply.end());
  await listen(t, restApiPort + 1, async (request, reply) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw);
    requests.push({path: request.url, method: request.method, body});
    reply.setHeader('content-type', 'application/json');
    reply.statusCode = refusal ? 503 : 200;
    reply.end(JSON.stringify(refusal ? {success: false, outcome: 'owner_not_ready',
      errorCode: 'TEST_OWNER_NOT_READY', error: 'try the owner later', retryAfterMs: 12} : {
      success: true, outcome: 'applied', scaleState: 'desired_state_persisted', desiredState: body,
    }));
  });
  return {restApiPort, requests, refuse() {
    refusal = true;
  }};
}

test('both PG-wire provisioning harnesses use the exact HTTP owner operation and keep observation separate',
  async (t) => {
    const world = await fixture(t);
    const node = new NodeHandle('n1', 'container', HOST, 'seed', {}, world.restApiPort + 1);
    node.query = async () => {
      throw new Error('provisioning must not use raw SQL');
    };
    const distributed = await provisionPublicListener(node, 3);
    t.equal(distributed.scaleState, 'desired_state_persisted');
    t.equal(distributed.desiredState.replicaCount, 3);
    t.equal(distributed.desiredState.runtimeConfig.authMode, 'password');
    t.equal(distributed.desiredState.runtimeConfig.host, '0.0.0.0');
    const reads = [];
    const db = {async query(sql) {
      reads.push(sql);
      return {rows: [{address: HOST, port: 5439}]};
    }};
    const wait = {restPort: world.restApiPort, deadlineMs: Date.now() + 1000,
      pause: async () => {
        throw new Error('all observations are ready');
      }};
    const embedded = await enablePasswordPgwire(db, 5439, wait);
    t.same({host: embedded.host, port: embedded.port}, {host: HOST, port: 5439});
    t.equal(embedded.desiredStateResult.scaleState, 'desired_state_persisted');
    t.equal(reads.length, 1, 'endpoint publication is independently observed');
    t.match(reads[0], /^SELECT /u);
    t.same(world.requests.map(({path, method}) => ({path, method})),
      [{path: SCALE_PATH, method: 'POST'}, {path: SCALE_PATH, method: 'POST'}]);
    t.equal(world.requests[1].body.runtimeConfig.port, 5439);
    world.refuse();
    await t.rejects(provisionPublicListener(node, 3),
      {code: 'TEST_OWNER_NOT_READY', outcome: 'owner_not_ready', retryAfterMs: 12});
    await t.rejects(enablePasswordPgwire(db, 5439, wait),
      {code: 'TEST_OWNER_NOT_READY', outcome: 'owner_not_ready', retryAfterMs: 12});
    t.equal(reads.length, 1, 'refused mutation does not become endpoint readiness');
  });

import {readFile} from 'node:fs/promises';
import {test} from '../../src/test-helpers/tap.js';

const RUNTIME_RESOURCE_PATTERN = /Server|Socket|TCP|Timer|Signal/u;
const PROCESS_EVENTS = Object.freeze([
  'beforeExit',
  'exit',
  'SIGINT',
  'SIGTERM',
  'uncaughtException',
  'unhandledRejection',
]);

function listenerCounts() {
  return Object.fromEntries(PROCESS_EVENTS.map((event) =>
    [event, process.listenerCount(event)]));
}

test('package public API imports and creates an embedded handle without effects',
  async (t) => {
    const before = process.getActiveResourcesInfo()
      .filter((resource) => RUNTIME_RESOURCE_PATTERN.test(resource));
    const listenersBefore = listenerCounts();
    const module = await import('lagrange-server');
    const runtime = module.createEmbeddedLagrange({configuration: {}});
    let invalidFactoryError;
    try {
      module.createEmbeddedLagrange({configuration: Number.NaN});
    } catch (error) {
      invalidFactoryError = error;
    }
    const after = process.getActiveResourcesInfo()
      .filter((resource) => RUNTIME_RESOURCE_PATTERN.test(resource));
    const listenersAfter = listenerCounts();
    const packageJson = JSON.parse(await readFile('package.json', 'utf8'));

    t.equal(module.VERSION, packageJson.version);
    t.type(module.createEmbeddedLagrange, 'function');
    t.type(runtime.start, 'function');
    t.equal(invalidFactoryError.name, 'ApplicationDatabaseError');
    t.equal(invalidFactoryError.code, 'INVALID_ARGUMENT');
    t.same(after, before);
    t.same(listenersAfter, listenersBefore);
  });

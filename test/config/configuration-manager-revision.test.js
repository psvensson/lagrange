// The configuration owner's change revision: advanced by every write of the
// configuration tree and by nothing else, so a reader keyed on it re-reads
// exactly when a value may have changed (the CDC plan stamp is one such reader).
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {CONFIG_KEY} from '../../src/config/config-key-constants.js';
import {LATENCY_PROPAGATION_MODE} from '../../src/config/config-latency-constants.js';

beforeEach(() => ConfigurationManager.resetInstance());
afterEach(() => ConfigurationManager.resetInstance());

test('ConfigurationManager revision advances on every configuration write', () => {
  const config = ConfigurationManager.getInstance();
  const created = config.getRevision();
  assert.ok(Number.isSafeInteger(created) && created >= 0, 'a revision from construction');
  config.initialize({node: {id: 'revision-node'}, logging: {level: 'error'}},
    {environment: {}});
  const initialized = config.getRevision();
  assert.ok(initialized > created, 'initialize writes the tree');
  config.setByPath(CONFIG_KEY.LATENCY_PROPAGATION_MODE, LATENCY_PROPAGATION_MODE.GROUPED);
  const written = config.getRevision();
  assert.ok(written > initialized, 'setByPath writes the tree');
  config.applyOverrides({latency: {propagationMode: LATENCY_PROPAGATION_MODE.SAFE}});
  assert.ok(config.getRevision() > written, 'applyOverrides writes the tree');
});

test('ConfigurationManager revision does not move on reads', () => {
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: 'revision-node'}, logging: {level: 'error'}},
    {environment: {}});
  const before = config.getRevision();
  config.get(CONFIG_KEY.LATENCY_PROPAGATION_MODE);
  config.getAll();
  config.getCategory('latency');
  assert.equal(config.getRevision(), before);
});

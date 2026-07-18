/**
 * HLC Tests - Hybrid Logical Clock tests.
 */

import {test} from '../../src/test-helpers/tap.js';
import {HLCTimestamp} from '../../src/hlc/hlc-timestamp.js';
import {HLCClockService} from '../../src/hlc/hlc-clock-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';

// Initialize configuration before tests
test('setup', async (t) => {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: 'test-node'}});
  t.pass('configuration initialized');
});

test('HLCTimestamp creation and serialization', async (t) => {
  const ts = new HLCTimestamp(1000, 5, 'node-1');

  t.equal(ts.physical, 1000, 'should store physical time');
  t.equal(ts.logical, 5, 'should store logical counter');
  t.equal(ts.nodeId, 'node-1', 'should store node ID');
  t.equal(ts.toString(), '1000-5-node-1', 'should serialize correctly');
});

test('HLCTimestamp parsing', async (t) => {
  const ts = HLCTimestamp.fromString('1000-5-node-1');

  t.equal(ts.physical, 1000, 'should parse physical time');
  t.equal(ts.logical, 5, 'should parse logical counter');
  t.equal(ts.nodeId, 'node-1', 'should parse node ID');
});

test('HLCTimestamp parsing with dashes in nodeId', async (t) => {
  const ts = HLCTimestamp.fromString('1000-5-node-with-dashes');

  t.equal(ts.physical, 1000, 'should parse physical time');
  t.equal(ts.logical, 5, 'should parse logical counter');
  t.equal(ts.nodeId, 'node-with-dashes', 'should parse node ID with dashes');
});

test('HLCTimestamp comparison', async (t) => {
  const ts1 = new HLCTimestamp(1000, 5, 'node-1');
  const ts2 = new HLCTimestamp(1000, 10, 'node-1');
  const ts3 = new HLCTimestamp(2000, 0, 'node-1');
  const ts4 = new HLCTimestamp(1000, 5, 'node-2');

  t.ok(ts1.isBefore(ts2), 'should compare by logical when physical equal');
  t.ok(ts2.isBefore(ts3), 'should compare by physical first');
  t.ok(ts1.isBefore(ts4), 'should compare by nodeId when physical and logical equal');
  t.ok(ts1.equals(ts1.clone()), 'should equal clone');
});

test('HLCClockService now() generates monotonic timestamps', async (t) => {
  const clock = new HLCClockService('test-node');

  const ts1 = clock.now();
  const ts2 = clock.now();
  const ts3 = clock.now();

  t.ok(ts1.isBefore(ts2), 'second timestamp should be after first');
  t.ok(ts2.isBefore(ts3), 'third timestamp should be after second');
});

test('HLCClockService update() handles remote timestamps', async (t) => {
  const clock = new HLCClockService('local-node');

  // Create a remote timestamp in the future
  const futureTime = Date.now() + 100;
  const remoteTs = new HLCTimestamp(futureTime, 10, 'remote-node');

  const updatedTs = clock.update(remoteTs);

  t.ok(
    updatedTs.physical >= futureTime,
    'should update physical to at least remote time',
  );
  t.ok(
    updatedTs.logical > remoteTs.logical || updatedTs.physical > remoteTs.physical,
    'should advance past remote timestamp',
  );
});

test('HLCClockService detects clock drift', async (t) => {
  let driftWarning = null;

  const clock = new HLCClockService('local-node', {
    maxDrift: 100,
    onDriftWarning: (warning) => {
      driftWarning = warning;
    },
  });

  // Create a remote timestamp far in the future
  const futureTime = Date.now() + 1000;
  const remoteTs = new HLCTimestamp(futureTime, 0, 'remote-node');

  clock.update(remoteTs);

  t.ok(driftWarning, 'should trigger drift warning');
  t.ok(driftWarning.drift > 100, 'should report drift amount');
});

test('HLCClockService keeps drift diagnostics out of distributed logs',
  async (t) => {
    const localDiagnostics = [];
    const distributedDiagnostics = [];
    const callbacks = [];
    const clock = new HLCClockService('local-node', {
      maxDrift: 100,
      onDriftWarning: (warning) => {
        callbacks.push(warning);
      },
    });
    clock.logger = {
      logConsoleOnly: (level, message, context) => {
        localDiagnostics.push({level, message, context});
      },
      warn: (message, context) => {
        distributedDiagnostics.push({message, context});
      },
    };

    const remoteTs = new HLCTimestamp(
      Date.now() + 1000,
      0,
      'remote-node',
    );
    clock.update(remoteTs);
    clock.update(new HLCTimestamp(
      Date.now() + 1100,
      0,
      'other-remote-node',
    ));

    t.equal(localDiagnostics.length, 1,
      'repeated forward drift is bounded in the node-local captured log');
    t.equal(localDiagnostics[0].level, 'warn',
      'the local diagnostic preserves warning severity');
    t.equal(
      localDiagnostics[0].message,
      'Excessive clock drift detected',
      'the local diagnostic preserves the established message',
    );
    t.equal(distributedDiagnostics.length, 0,
      'drift cannot recursively create an HLC-stamped distributed log row');
    t.equal(callbacks.length, 2,
      'the programmatic drift signal still fires on every occurrence');
    t.equal(
      callbacks[0].remoteNodeId,
      localDiagnostics[0].context.remoteNodeId,
      'the callback and first local diagnostic observe the same drift source',
    );
    t.equal(localDiagnostics[0].context.suppressedSinceLastWarning, 0,
      'the first bounded diagnostic reports no prior suppression');
  });

test('HLCClockService does not classify delayed remote events as clock drift',
  async (t) => {
    const localDiagnostics = [];
    const callbacks = [];
    const clock = new HLCClockService('local-node', {
      maxDrift: 100,
      onDriftWarning: (warning) => {
        callbacks.push(warning);
      },
    });
    clock.logger = {
      logConsoleOnly: (...args) => {
        localDiagnostics.push(args);
      },
    };

    const before = clock.current();
    const delayedRemoteTs = new HLCTimestamp(
      Date.now() - 1000,
      3,
      'remote-node',
    );
    const updated = clock.update(delayedRemoteTs);

    t.equal(localDiagnostics.length, 0,
      'a delayed past timestamp emits no false forward-skew warning');
    t.equal(callbacks.length, 0,
      'a delayed past timestamp emits no programmatic drift signal');
    t.ok(before.isBefore(updated),
      'the ordinary HLC merge still advances monotonically');
  });

test('HLCClockService handles logical overflow', async (t) => {
  const clock = new HLCClockService('test-node', {
    maxLogicalCounter: 10,
  });

  // Force logical counter near overflow
  clock.logical = 10;
  const physicalBefore = clock.physical;

  const ts = clock.now();

  t.ok(
    ts.physical > physicalBefore || ts.logical === 0,
    'should handle logical overflow',
  );
});

test('HLCClockService current() returns current state', async (t) => {
  const clock = new HLCClockService('test-node');

  clock.now(); // Advance the clock

  const current = clock.current();
  const next = clock.now();

  t.ok(current.isBefore(next), 'current should be before next now()');
});

test('HLCTimestamp.tryFromString parses a valid timestamp', async (t) => {
  const ts = HLCTimestamp.tryFromString('1000-5-node-1');
  t.ok(ts, 'should return a timestamp for valid input');
  t.equal(ts.physical, 1000, 'should parse physical time');
  t.equal(ts.logical, 5, 'should parse logical counter');
  t.equal(ts.nodeId, 'node-1', 'should parse node ID');
});

test('HLCTimestamp.tryFromString returns null for malformed/absent input',
  async (t) => {
    t.equal(HLCTimestamp.tryFromString(''), null, 'empty string -> null');
    t.equal(HLCTimestamp.tryFromString('not-an-hlc'), null,
      'unparseable -> null (NaN physical/logical)');
    t.equal(HLCTimestamp.tryFromString(undefined), null, 'undefined -> null');
    t.equal(HLCTimestamp.tryFromString(null), null, 'null -> null');
    t.equal(HLCTimestamp.tryFromString(12345), null, 'non-string -> null');
  });

test('cleanup', async (t) => {
  ConfigurationManager.resetInstance();
  t.pass('cleanup complete');
});

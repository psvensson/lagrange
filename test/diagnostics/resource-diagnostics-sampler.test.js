import {test} from '../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ResourceDiagnosticsSampler} from
  '../../src/diagnostics/resource-diagnostics-sampler.js';

function setup() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: 'diag-node-1'}});
  LoggingService.resetInstance();
  LoggingService.getInstance().initialize({nodeId: 'diag-node-1', level: 'error'});
}

function teardown() {
  LoggingService.resetInstance();
  ConfigurationManager.resetInstance();
}

test('ResourceDiagnosticsSampler returns process and component snapshots', async (t) => {
  setup();
  const ownerState = {queueDepth: 3};
  const owner = {
    messageRouter: {
      getStats: () => ({
        queueDepth: ownerState.queueDepth,
      }),
    },
  };

  const sampler = new ResourceDiagnosticsSampler({
    nodeId: 'diag-node-1',
    owner,
  });
  const report = sampler.getReport();

  assert.equal(report.nodeId, 'diag-node-1');
  assert.ok(report.latest.process.rssBytes > 0);
  assert.equal(
    report.latest.components.messageRouter.queueDepth,
    3,
    'should include owner component stats',
  );

  teardown();
  t.end();
});

test('ResourceDiagnosticsSampler ranks growing component signals', async (t) => {
  setup();
  const ownerState = {queueDepth: 1, delivered: 10};
  const owner = {
    messageRouter: {
      getStats: () => ({
        queueDepth: ownerState.queueDepth,
        delivered: ownerState.delivered,
      }),
    },
  };

  const sampler = new ResourceDiagnosticsSampler({
    nodeId: 'diag-node-1',
    owner,
  });

  sampler.getReport();
  ownerState.queueDepth = 40;
  ownerState.delivered = 200;
  const secondReport = sampler.getReport();
  const topSignals = secondReport.trend?.topGrowingSignals || [];

  assert.ok(topSignals.length > 0, 'should include growing signals');
  assert.ok(
    topSignals.some((entry) => entry.signal === 'messageRouter.queueDepth'),
    'should include growing queue depth signal',
  );
  assert.ok(
    topSignals.some((entry) => entry.signal === 'messageRouter.delivered'),
    'should include growing delivered signal',
  );

  teardown();
  t.end();
});

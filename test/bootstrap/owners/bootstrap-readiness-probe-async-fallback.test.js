import {test} from '../../../src/test-helpers/tap.js';
import {BootstrapReadinessOwner} from '../../../src/bootstrap/owners/bootstrap-readiness-owner.js';
import {captureLogger} from '../../test-helpers/wait-bound-spent-capture.js';

// The HTTP readiness probe gives async diagnostics a 250 ms window and then
// answers from the synchronous owner snapshot. That fallback is the designed
// exit of a probe, not a spent wait: it logs at DEBUG and never reports a
// wait_bound_spent ERROR.

test('readiness probe async fallback is a probe fallback, not a spent wait',
  async (t) => {
    const capture = captureLogger();
    const syncSnapshot = {ready: false, phase: 'joining'};
    const owner = new BootstrapReadinessOwner({
      delegates: {
        getLogger: () => capture.logger,
        getSeedNodeId: () => 'seed-1',
      },
    });
    owner.evaluateReadinessSnapshotAsync = () => new Promise(() => {});
    owner.evaluateReadinessSnapshot = () => syncSnapshot;

    const snapshot = await owner.evaluateReadinessSnapshotForProbe();

    t.equal(snapshot, syncSnapshot, 'the probe answers from the sync snapshot');
    t.equal(capture.spent().length, 0, 'no wait_bound_spent for the fallback');
    t.equal(capture.errors().length, 0, 'no ERROR for the fallback');
    const debug = capture.lines.filter((line) => line.level === 'debug');
    t.equal(debug.length, 1, 'the fallback logs one DEBUG line');
    t.match(debug[0].message, /timed out/i, 'the DEBUG line names the timeout');
    t.same(debug[0].context, {seedNodeId: 'seed-1', timeoutMs: 250},
      'the DEBUG line carries the base context');
    t.end();
  });

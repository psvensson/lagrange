import {test} from '../../src/test-helpers/tap.js';
import {ReplicaStateMachine} from '../../src/node/replica-state-machine.js';
import {RealTimeSource, VirtualTimeSource} from '../../src/time/time-source.js';

// Round 8 clock-owner wiring: the timeout checker schedules on the node's
// canonical time source, never on the host timers directly when one is given.

function createStateMachine(options = {}) {
  return new ReplicaStateMachine({
    nodeId: 'node-a',
    controlPlaneSystemTableGateway: {},
    ...options,
  });
}

test('default time source is the real host clock (production unchanged)', (t) => {
  const stateMachine = createStateMachine();
  t.ok(stateMachine.timeSource instanceof RealTimeSource);
  const before = Date.now();
  const stamped = stateMachine.now();
  t.ok(stamped >= before && stamped <= Date.now());
  t.end();
});

test('a given time source drives the timeout checker and now()', (t) => {
  const timeSource = new VirtualTimeSource({startMs: 1000});
  const stateMachine = createStateMachine({timeSource});
  let checks = 0;
  stateMachine._checkTimeouts = () => {
    checks += 1;
  };
  stateMachine.startTimeoutChecker();
  t.equal(checks, 0);
  timeSource.advance(stateMachine.timeoutCheckIntervalMs * 3);
  t.equal(checks, 3, 'virtual time alone fires the checker');
  t.equal(stateMachine.now(), timeSource.now());
  stateMachine.stopTimeoutChecker();
  timeSource.advance(stateMachine.timeoutCheckIntervalMs * 3);
  t.equal(checks, 3, 'stop clears the interval on the same time source');
  t.end();
});

test('an explicit now() still wins over the time source for stamps', (t) => {
  const timeSource = new VirtualTimeSource({startMs: 1000});
  const stateMachine = createStateMachine({timeSource, now: () => 42});
  t.equal(stateMachine.now(), 42);
  t.end();
});

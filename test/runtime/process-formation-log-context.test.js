import {test} from '../../src/test-helpers/tap.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {BOOTSTRAP_API_LOG_MSG} from '../../src/bootstrap/bootstrap-api-constants.js';
import {matchesNodeContext} from '../integration/helpers/process-formation-log-context.js';

test('process formation evidence separates real logging emitter and joiner context', (t) => {
  const logger = new LoggingService();
  const cases = [
    {emitterNodeId: 'node-b', subjectNodeId: 'node-c',
      message: BOOTSTRAP_API_LOG_MSG.RECEIVED_BOOTSTRAP_REQUEST},
    {emitterNodeId: 'seed', subjectNodeId: 'joiner',
      message: BOOTSTRAP_API_LOG_MSG.RESPONSE_PREPARED},
  ];
  for (const observation of cases) {
    logger.nodeId = observation.emitterNodeId;
    const payload = logger.buildConsolePayload({nodeId: observation.subjectNodeId});
    const entry = {msg: observation.message, ...payload};
    t.equal(payload.nodeId, observation.emitterNodeId);
    t.equal(payload.contextNodeId, observation.subjectNodeId);
    t.equal(matchesNodeContext(entry, observation), true, observation.message);
    t.equal(matchesNodeContext(entry, {...observation, emitterNodeId: 'unrelated'}), false);
    t.equal(matchesNodeContext(entry, {...observation, subjectNodeId: 'unrelated'}), false);
  }
  logger.nodeId = 'local-owner';
  const local = logger.buildConsolePayload({nodeId: logger.nodeId});
  t.equal(matchesNodeContext(local, {
    emitterNodeId: logger.nodeId, subjectNodeId: logger.nodeId,
  }), true, 'self-context remains the emitting node without a fabricated context field');
  t.end();
});

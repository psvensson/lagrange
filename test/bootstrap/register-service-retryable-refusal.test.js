// A retryable refusal is answered retryably (line-regression-causes stage 2,
// item 5). The pre-CDC SQL fallback stays removed; a register-service the seed
// receives before its CDC integration owner is wired is refused by the gateway
// with CDC_REQUIRED and deferRetry. The route must answer that typed retryable
// refusal with the bootstrap API's retryable status and typed body (the one
// mapping buildBootstrapControlPlaneQueryError already owns), never 500.
import {test} from '../../src/test-helpers/tap.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {
  createEmptySystemTableCache,
  initializeTestEnvironment,
} from './bootstrap-api-test-fixtures.js';
import {SERVICE_REGISTRATION_HANDOFF_FIELD} from
  '../../src/bootstrap/owners/service-registration-handoff-owner.js';
import {HTTP_STATUS, SERVICE_STATUS, SERVICE_TYPE} from '../../src/constants/index.js';

test('register-service before CDC is wired answers the typed retryable refusal, not 500',
  async (t) => {
    initializeTestEnvironment();
    const sqlCalls = [];
    const api = new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache: createEmptySystemTableCache(),
      sqlQueryEngine: {
        async executeQuery(sql, params, options) {
          sqlCalls.push({sql, params, options});
          return {success: true, affectedRows: 1};
        },
      },
      cdcIntegrationService: null,
    });
    await api.initialize(0, {listen: false});
    t.teardown(() => api.shutdown());
    api.readCurrentRegisteredServiceRow = async () => null;
    const response = await api.getFastify().inject({
      method: 'POST',
      url: '/register-service',
      payload: {
        service_id: 'mg-retryable-r1',
        service_type: SERVICE_TYPE.MESSAGE_GROUP,
        node_id: 'joiner-node-1',
        group_id: 'mg-retryable',
        replica_id: 'mg-retryable-r1',
        status: SERVICE_STATUS.STOPPED,
      },
    });
    t.equal(response.statusCode, HTTP_STATUS.SERVICE_UNAVAILABLE,
      `the typed retryable refusal keeps its retryable status (${response.body})`);
    const body = JSON.parse(response.body);
    t.equal(body.success, false, 'not registered');
    t.type(body.code, 'string', 'a typed refusal code');
    t.ok(Number.isFinite(body.retryAfterMs), 'a retry hint');
    t.equal(body[SERVICE_REGISTRATION_HANDOFF_FIELD.CONTRACT]?.producerOwnerOutcome?.terminal,
      false, 'the handoff contract is not terminal');
    t.same(sqlCalls, [], 'the removed pre-CDC SQL fallback stays removed');
  });

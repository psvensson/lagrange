import {test} from '../../src/test-helpers/tap.js';
import {TABLES} from '../../src/constants/index.js';
import {ControlPlaneSystemTableGateway} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {buildControlPlaneReadAuthority} from
  '../../src/control-plane/control-plane-system-table-gateway-read-contracts.js';
import {CONTROL_PLANE_AUTHORITATIVE_READ_MODE as MODE,
  CONTROL_PLANE_READ_LEADER_MODE as LEADER, CONTROL_PLANE_READ_STRATEGY as STRATEGY,
  GATEWAY_ERROR_MSG} from
  '../../src/control-plane/control-plane-system-table-gateway-constants.js';
import {CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_SCOPE as SCOPE} from
  '../../src/control-plane/control-plane-cache-reconcile-constants.js';

const SQL = 'SELECT * FROM nodes WHERE node_id = ?';
const NODE_ID = 'gateway-token-node';
const CONTRADICTION = 'contradictory_control_plane_authoritative_read_authority';

function fixture() {
  const calls = {identities: 0, admissions: 0, cache: 0, owner: []};
  const gateway = new ControlPlaneSystemTableGateway({nodeId: NODE_ID,
    systemTableCache: {getAll() {
      calls.cache += 1;
      return [{node_id: 'projection-row'}];
    }},
    pressureGovernor: {configure() {}, async admit() {
      calls.admissions += 1;
      return {action: 'allow'};
    }},
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead(tableName, sql, params, options) {
        calls.owner.push({tableName, sql, params, options});
        return {success: true, rows: [{node_id: NODE_ID}], source: 'owner_rpc_lane'};
      },
    },
  });
  const buildKey = gateway.buildReadRequestKey;
  gateway.buildReadRequestKey = function(...args) {
    calls.identities += 1;
    return Reflect.apply(buildKey, this, args);
  };
  return {gateway, calls};
}

for (const mode of [MODE.OWNER_LOCAL_ONLY, MODE.OWNER_RPC_REQUIRED]) {
  test(`gateway retains the supplied ${mode} token and required leader intent`, async (t) => {
    const f = fixture();
    const authority = buildControlPlaneReadAuthority({authoritativeReadMode: mode,
      leaderMode: LEADER.REQUIRED, localReadConsistency: 'local_leader'});
    const result = await f.gateway.readAuthoritativeRows(TABLES.NODES, SQL, [NODE_ID], {
      readAuthority: authority,
    });
    t.equal(result.success, true);
    t.equal(f.calls.owner.length, 1);
    t.equal(f.calls.owner[0].options.readAuthority, authority,
      'the ingress does not replace an already selected authority contract');
    t.equal(f.calls.owner[0].options.readAuthority.authoritativeReadMode, mode);
    t.equal(f.calls.owner[0].options.readAuthority.leaderMode, LEADER.REQUIRED);
    t.equal(f.calls.identities, 1);
    t.equal(f.calls.admissions, 1);
    t.equal(f.gateway.inFlightReadRequestsByKey.size, 0);
  });
}

const TOKEN = buildControlPlaneReadAuthority({authoritativeReadMode: MODE.OWNER_RPC_REQUIRED,
  leaderMode: LEADER.REQUIRED});
const REFUSALS = [
  {name: 'null', authority: null,
    expected: {message: GATEWAY_ERROR_MSG.AUTHORITATIVE_READ_AUTHORITY_TOKEN_REQUIRED}},
  {name: 'mutable', authority: {...TOKEN},
    expected: {message: GATEWAY_ERROR_MSG.AUTHORITATIVE_READ_AUTHORITY_TOKEN_REQUIRED}},
  {name: 'unknown mode', authority: Object.freeze({...TOKEN,
    authoritativeReadMode: 'unknown-token-mode'}),
  expected: {message: 'unsupported_control_plane_authoritative_read_mode'}},
  {name: 'complete local observation', authority: Object.freeze({...TOKEN,
    authoritativeReadMode: MODE.OWNER_LOCAL_ONLY,
    authoritativeObservationScope: SCOPE.COMPLETE_TABLE}), expected: {code: CONTRADICTION}},
  {name: 'conflicting flat mode', authority: TOKEN,
    options: {authoritativeReadMode: MODE.OWNER_LOCAL_ONLY}, expected: {code: CONTRADICTION}},
  {name: 'conflicting flat leader', authority: TOKEN,
    options: {leaderMode: LEADER.ANY}, expected: {code: CONTRADICTION}},
  {name: 'projection token at authoritative ingress',
    authority: buildControlPlaneReadAuthority({strategy: STRATEGY.CACHE,
      authoritativeReadMode: MODE.OWNER_LOCAL_ONLY}), expected: {code: CONTRADICTION}},
  {name: 'authoritative token at projection ingress', projection: true,
    authority: buildControlPlaneReadAuthority({strategy: STRATEGY.AUTHORITATIVE,
      authoritativeReadMode: MODE.OWNER_RPC_REQUIRED}), expected: {code: CONTRADICTION}},
  {name: 'unspecified strategy owner token at projection ingress', projection: true,
    authority: TOKEN, expected: {code: CONTRADICTION}},
];

for (const refusal of REFUSALS) {
  test(`gateway refuses ${refusal.name} authority before identity or pressure`, async (t) => {
    const f = fixture();
    const options = {
      ...refusal.options, readAuthority: refusal.authority,
    };
    const pending = refusal.projection ?
      f.gateway.readProjectionRows(TABLES.NODES, options) :
      f.gateway.readAuthoritativeRows(TABLES.NODES, SQL, [NODE_ID], options);
    await t.rejects(pending, refusal.expected);
    t.equal(f.calls.identities, 0);
    t.equal(f.calls.admissions, 0);
    t.equal(f.calls.owner.length, 0, 'no owner executes a substituted contract');
    t.equal(f.calls.cache, 0, 'projection access cannot discharge the rejected intent');
    t.equal(f.gateway.inFlightReadRequestsByKey.size, 0);
  });
}

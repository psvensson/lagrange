/**
 * A control-plane read profile decides the authority of a read through
 * exactly two owner-named values: the read strategy and the authoritative
 * read mode. This pins both for every profile, pins that an explicit caller
 * value wins over the profile, and pins that profile resolution writes no
 * option the gateway does not own (the retired routing booleans, or a key
 * named after a missing constant).
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE as MODE,
  CONTROL_PLANE_READ_PROFILE as PROFILE,
  CONTROL_PLANE_READ_STRATEGY as STRATEGY,
} from '../../src/control-plane/control-plane-system-table-gateway-constants.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION as DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {PRESSURE_WORK_CLASS} from '../../src/control-plane/pressure-governor.js';
import {
  buildControlPlaneReadAuthority,
  resolveAuthoritativeReadModeContract,
  resolveControlPlaneReadIntent,
  resolveReadProfileOptions,
} from '../../src/control-plane/control-plane-system-table-gateway-read-contracts.js';

const TABLE = 'nodes';
const SQL = 'SELECT * FROM nodes';
const CRITICAL_DELIVERY_PRIORITY = 'critical';
const RETIRED_OR_UNOWNED_OPTION_KEYS = Object.freeze([
  'undefined', 'requireAuthoritative', 'preferAuthoritativeRead',
]);

const PROFILE_DEFAULTS = Object.freeze([
  {
    profile: PROFILE.DIAGNOSTICS,
    strategy: STRATEGY.AUTHORITATIVE_REQUIRED,
    authoritativeReadMode: MODE.OWNER_RPC_REQUIRED,
    requireOwnerRpcRead: true,
    allowSqlFallback: false,
    routingReadinessDimension: DIMENSION.REPAIR_ELIGIBLE,
    deliveryPriority: undefined,
    workClass: undefined,
  },
  {
    profile: PROFILE.PLANNING,
    strategy: STRATEGY.AUTHORITATIVE,
    authoritativeReadMode: MODE.OWNER_RPC_PREFERRED_SQL_FALLBACK,
    requireOwnerRpcRead: false,
    allowSqlFallback: true,
    routingReadinessDimension: DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    deliveryPriority: undefined,
    workClass: undefined,
  },
  {
    profile: PROFILE.REPAIR_REQUIRED,
    strategy: STRATEGY.AUTHORITATIVE_REQUIRED,
    authoritativeReadMode: MODE.OWNER_RPC_PREFERRED_SQL_FALLBACK,
    requireOwnerRpcRead: false,
    allowSqlFallback: true,
    routingReadinessDimension: DIMENSION.REPAIR_ELIGIBLE,
    deliveryPriority: CRITICAL_DELIVERY_PRIORITY,
    workClass: PRESSURE_WORK_CLASS.CRITICAL,
  },
  {
    profile: PROFILE.TABLE_LIFECYCLE,
    strategy: STRATEGY.AUTHORITATIVE_REQUIRED,
    authoritativeReadMode: MODE.OWNER_RPC_PREFERRED_SQL_FALLBACK,
    requireOwnerRpcRead: false,
    allowSqlFallback: true,
    routingReadinessDimension: DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    deliveryPriority: CRITICAL_DELIVERY_PRIORITY,
    workClass: undefined,
  },
]);

// The authority a profiled read reaches the gateway's executors with: the
// same composition executeRead performs.
function resolveProfiledReadAuthority(options) {
  const {readIntent, readProfile} = resolveControlPlaneReadIntent(
    TABLE, SQL, [], options, true);
  const profiledOptions = resolveReadProfileOptions({...options, readProfile});
  const readAuthority = buildControlPlaneReadAuthority({
    ...profiledOptions,
    strategy: readIntent.strategy,
  });
  return {
    profiledOptions,
    readAuthority,
    contract: resolveAuthoritativeReadModeContract(readAuthority),
  };
}

test('the profile vocabulary under test is the whole vocabulary', async (t) => {
  t.same(
    PROFILE_DEFAULTS.map((expected) => expected.profile).sort(),
    Object.values(PROFILE).sort(),
  );
});

for (const expected of PROFILE_DEFAULTS) {
  test(`profile ${expected.profile} applies its authority defaults`, async (t) => {
    const {profiledOptions, readAuthority, contract} =
      resolveProfiledReadAuthority({readProfile: expected.profile});

    t.equal(readAuthority.readProfile, expected.profile);
    t.equal(readAuthority.strategy, expected.strategy);
    t.equal(readAuthority.authoritativeReadMode, expected.authoritativeReadMode);
    t.equal(contract.authoritativeReadMode, expected.authoritativeReadMode);
    t.equal(contract.preferOwnerRpcRead, true);
    t.equal(contract.requireOwnerRpcRead, expected.requireOwnerRpcRead);
    t.equal(contract.allowSqlFallback, expected.allowSqlFallback);
    t.equal(
      readAuthority.routingReadinessDimension,
      expected.routingReadinessDimension,
    );
    t.equal(profiledOptions.deliveryPriority, expected.deliveryPriority);
    t.equal(profiledOptions.workClass, expected.workClass);
    for (const key of RETIRED_OR_UNOWNED_OPTION_KEYS) {
      t.notOk(
        Object.hasOwn(profiledOptions, key),
        `profile resolution writes no "${key}" option`,
      );
    }
  });

  test(`an explicit caller value wins over profile ${expected.profile}`,
    async (t) => {
      const {profiledOptions, readAuthority, contract} =
        resolveProfiledReadAuthority({
          readProfile: expected.profile,
          strategy: STRATEGY.CACHE,
          authoritativeReadMode: MODE.OWNER_LOCAL_ONLY,
          routingReadinessDimension: DIMENSION.ROUTING_READY,
          deliveryPriority: 'readiness',
          workClass: PRESSURE_WORK_CLASS.BACKGROUND,
        });

      t.equal(readAuthority.strategy, STRATEGY.CACHE);
      t.equal(readAuthority.authoritativeReadMode, MODE.OWNER_LOCAL_ONLY);
      t.equal(contract.preferOwnerRpcRead, false);
      t.equal(contract.allowOwnerRpcFallback, false);
      t.equal(
        readAuthority.routingReadinessDimension, DIMENSION.ROUTING_READY);
      t.equal(profiledOptions.deliveryPriority, 'readiness');
      t.equal(profiledOptions.workClass, PRESSURE_WORK_CLASS.BACKGROUND);
    });
}

test('the retired routing booleans do not change a read\'s authority',
  async (t) => {
    const plain = resolveProfiledReadAuthority({});
    const withBooleans = resolveProfiledReadAuthority({
      requireAuthoritative: true,
      preferAuthoritativeRead: true,
    });

    t.same(withBooleans.readAuthority, plain.readAuthority);
    t.equal(plain.readAuthority.strategy, STRATEGY.AUTHORITATIVE);
    t.equal(
      plain.readAuthority.authoritativeReadMode,
      MODE.OWNER_LOCAL_PREFERRED_OWNER_RPC_FALLBACK,
    );
  });

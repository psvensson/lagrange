// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { TABLES } from '../constants/index.js';
const CDC_AUTHORITY_CLASS = Object.freeze(stryMutAct_9fa48("33852") ? {} : (stryCov_9fa48("33852"), {
  CONTROL: stryMutAct_9fa48("33853") ? "" : (stryCov_9fa48("33853"), 'control'),
  USER: stryMutAct_9fa48("33854") ? "" : (stryCov_9fa48("33854"), 'user')
}));
const CDC_POLICY_CLASS = Object.freeze(stryMutAct_9fa48("33855") ? {} : (stryCov_9fa48("33855"), {
  CONTROL_INTERNAL_PROPAGATION: stryMutAct_9fa48("33856") ? "" : (stryCov_9fa48("33856"), 'control_internal_propagation'),
  CONTROL_NO_INTERNAL_PROPAGATION: stryMutAct_9fa48("33857") ? "" : (stryCov_9fa48("33857"), 'control_no_internal_propagation'),
  USER_EXTERNAL_CDC: stryMutAct_9fa48("33858") ? "" : (stryCov_9fa48("33858"), 'user_external_cdc'),
  USER_NO_CDC: stryMutAct_9fa48("33859") ? "" : (stryCov_9fa48("33859"), 'user_no_cdc')
}));
const CDC_BOOTSTRAP_HYDRATION_MODE = Object.freeze(stryMutAct_9fa48("33860") ? {} : (stryCov_9fa48("33860"), {
  BOOTSTRAP_ONLY: stryMutAct_9fa48("33861") ? "" : (stryCov_9fa48("33861"), 'bootstrap_only'),
  NONE: stryMutAct_9fa48("33862") ? "" : (stryCov_9fa48("33862"), 'none')
}));
function freezeTablePolicy(policy) {
  if (stryMutAct_9fa48("33863")) {
    {}
  } else {
    stryCov_9fa48("33863");
    return Object.freeze(stryMutAct_9fa48("33864") ? {} : (stryCov_9fa48("33864"), {
      ...policy,
      degradedByOperationIds: Object.freeze(Array.isArray(policy.degradedByOperationIds) ? stryMutAct_9fa48("33865") ? [] : (stryCov_9fa48("33865"), [...policy.degradedByOperationIds]) : stryMutAct_9fa48("33866") ? ["Stryker was here"] : (stryCov_9fa48("33866"), []))
    }));
  }
}
function createTablePolicy(tableName, policy) {
  if (stryMutAct_9fa48("33867")) {
    {}
  } else {
    stryCov_9fa48("33867");
    return freezeTablePolicy(stryMutAct_9fa48("33868") ? {} : (stryCov_9fa48("33868"), {
      tableName,
      ...policy
    }));
  }
}
const SYSTEM_TABLE_CDC_POLICIES = Object.freeze(stryMutAct_9fa48("33869") ? {} : (stryCov_9fa48("33869"), {
  [TABLES.NODES]: createTablePolicy(TABLES.NODES, stryMutAct_9fa48("33870") ? {} : (stryCov_9fa48("33870"), {
    policyClass: CDC_POLICY_CLASS.CONTROL_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: stryMutAct_9fa48("33871") ? false : (stryCov_9fa48("33871"), true),
    readinessRelevant: stryMutAct_9fa48("33872") ? false : (stryCov_9fa48("33872"), true),
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.BOOTSTRAP_ONLY,
    externalCdcAllowed: stryMutAct_9fa48("33873") ? true : (stryCov_9fa48("33873"), false)
  })),
  [TABLES.PARTITIONS]: createTablePolicy(TABLES.PARTITIONS, stryMutAct_9fa48("33874") ? {} : (stryCov_9fa48("33874"), {
    policyClass: CDC_POLICY_CLASS.CONTROL_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: stryMutAct_9fa48("33875") ? false : (stryCov_9fa48("33875"), true),
    readinessRelevant: stryMutAct_9fa48("33876") ? false : (stryCov_9fa48("33876"), true),
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.BOOTSTRAP_ONLY,
    externalCdcAllowed: stryMutAct_9fa48("33877") ? true : (stryCov_9fa48("33877"), false)
  })),
  [TABLES.SERVICES]: createTablePolicy(TABLES.SERVICES, stryMutAct_9fa48("33878") ? {} : (stryCov_9fa48("33878"), {
    policyClass: CDC_POLICY_CLASS.CONTROL_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: stryMutAct_9fa48("33879") ? false : (stryCov_9fa48("33879"), true),
    readinessRelevant: stryMutAct_9fa48("33880") ? false : (stryCov_9fa48("33880"), true),
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.BOOTSTRAP_ONLY,
    externalCdcAllowed: stryMutAct_9fa48("33881") ? true : (stryCov_9fa48("33881"), false)
  })),
  [TABLES.MESSAGE_GROUPS]: createTablePolicy(TABLES.MESSAGE_GROUPS, stryMutAct_9fa48("33882") ? {} : (stryCov_9fa48("33882"), {
    policyClass: CDC_POLICY_CLASS.CONTROL_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: stryMutAct_9fa48("33883") ? false : (stryCov_9fa48("33883"), true),
    readinessRelevant: stryMutAct_9fa48("33884") ? false : (stryCov_9fa48("33884"), true),
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.BOOTSTRAP_ONLY,
    externalCdcAllowed: stryMutAct_9fa48("33885") ? true : (stryCov_9fa48("33885"), false)
  })),
  [TABLES.TABLES]: createTablePolicy(TABLES.TABLES, stryMutAct_9fa48("33886") ? {} : (stryCov_9fa48("33886"), {
    policyClass: CDC_POLICY_CLASS.CONTROL_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: stryMutAct_9fa48("33887") ? false : (stryCov_9fa48("33887"), true),
    readinessRelevant: stryMutAct_9fa48("33888") ? false : (stryCov_9fa48("33888"), true),
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.BOOTSTRAP_ONLY,
    externalCdcAllowed: stryMutAct_9fa48("33889") ? true : (stryCov_9fa48("33889"), false)
  })),
  [TABLES.SCHEMA_MIGRATIONS]: createTablePolicy(TABLES.SCHEMA_MIGRATIONS, stryMutAct_9fa48("33890") ? {} : (stryCov_9fa48("33890"), {
    policyClass: CDC_POLICY_CLASS.CONTROL_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: stryMutAct_9fa48("33891") ? false : (stryCov_9fa48("33891"), true),
    readinessRelevant: stryMutAct_9fa48("33892") ? true : (stryCov_9fa48("33892"), false),
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.BOOTSTRAP_ONLY,
    externalCdcAllowed: stryMutAct_9fa48("33893") ? true : (stryCov_9fa48("33893"), false)
  })),
  [TABLES.INDICES]: createTablePolicy(TABLES.INDICES, stryMutAct_9fa48("33894") ? {} : (stryCov_9fa48("33894"), {
    policyClass: CDC_POLICY_CLASS.CONTROL_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: stryMutAct_9fa48("33895") ? false : (stryCov_9fa48("33895"), true),
    readinessRelevant: stryMutAct_9fa48("33896") ? false : (stryCov_9fa48("33896"), true),
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.BOOTSTRAP_ONLY,
    externalCdcAllowed: stryMutAct_9fa48("33897") ? true : (stryCov_9fa48("33897"), false)
  })),
  [TABLES.NODE_ENDPOINTS]: createTablePolicy(TABLES.NODE_ENDPOINTS, stryMutAct_9fa48("33898") ? {} : (stryCov_9fa48("33898"), {
    policyClass: CDC_POLICY_CLASS.CONTROL_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: stryMutAct_9fa48("33899") ? false : (stryCov_9fa48("33899"), true),
    readinessRelevant: stryMutAct_9fa48("33900") ? false : (stryCov_9fa48("33900"), true),
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.BOOTSTRAP_ONLY,
    externalCdcAllowed: stryMutAct_9fa48("33901") ? true : (stryCov_9fa48("33901"), false)
  })),
  [TABLES.SERVICE_DEFINITIONS]: createTablePolicy(TABLES.SERVICE_DEFINITIONS, stryMutAct_9fa48("33902") ? {} : (stryCov_9fa48("33902"), {
    policyClass: CDC_POLICY_CLASS.CONTROL_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: stryMutAct_9fa48("33903") ? false : (stryCov_9fa48("33903"), true),
    readinessRelevant: stryMutAct_9fa48("33904") ? false : (stryCov_9fa48("33904"), true),
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.BOOTSTRAP_ONLY,
    externalCdcAllowed: stryMutAct_9fa48("33905") ? true : (stryCov_9fa48("33905"), false)
  })),
  [TABLES.SERVICE_ENDPOINTS]: createTablePolicy(TABLES.SERVICE_ENDPOINTS, stryMutAct_9fa48("33906") ? {} : (stryCov_9fa48("33906"), {
    policyClass: CDC_POLICY_CLASS.CONTROL_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: stryMutAct_9fa48("33907") ? false : (stryCov_9fa48("33907"), true),
    readinessRelevant: stryMutAct_9fa48("33908") ? false : (stryCov_9fa48("33908"), true),
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.BOOTSTRAP_ONLY,
    externalCdcAllowed: stryMutAct_9fa48("33909") ? true : (stryCov_9fa48("33909"), false)
  })),
  [TABLES.REPLICA_OPERATIONS]: createTablePolicy(TABLES.REPLICA_OPERATIONS, stryMutAct_9fa48("33910") ? {} : (stryCov_9fa48("33910"), {
    policyClass: CDC_POLICY_CLASS.CONTROL_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: stryMutAct_9fa48("33911") ? false : (stryCov_9fa48("33911"), true),
    readinessRelevant: stryMutAct_9fa48("33912") ? false : (stryCov_9fa48("33912"), true),
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.BOOTSTRAP_ONLY,
    externalCdcAllowed: stryMutAct_9fa48("33913") ? true : (stryCov_9fa48("33913"), false)
  })),
  [TABLES.STORAGE_RESERVATIONS]: createTablePolicy(TABLES.STORAGE_RESERVATIONS, stryMutAct_9fa48("33914") ? {} : (stryCov_9fa48("33914"), {
    policyClass: CDC_POLICY_CLASS.CONTROL_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: stryMutAct_9fa48("33915") ? false : (stryCov_9fa48("33915"), true),
    readinessRelevant: stryMutAct_9fa48("33916") ? false : (stryCov_9fa48("33916"), true),
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.BOOTSTRAP_ONLY,
    externalCdcAllowed: stryMutAct_9fa48("33917") ? true : (stryCov_9fa48("33917"), false)
  })),
  [TABLES.CONTROL_PLANE_PUBLICATIONS]: createTablePolicy(TABLES.CONTROL_PLANE_PUBLICATIONS, stryMutAct_9fa48("33918") ? {} : (stryCov_9fa48("33918"), {
    policyClass: CDC_POLICY_CLASS.CONTROL_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: stryMutAct_9fa48("33919") ? false : (stryCov_9fa48("33919"), true),
    readinessRelevant: stryMutAct_9fa48("33920") ? false : (stryCov_9fa48("33920"), true),
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.BOOTSTRAP_ONLY,
    externalCdcAllowed: stryMutAct_9fa48("33921") ? true : (stryCov_9fa48("33921"), false)
  })),
  [TABLES.CONFIG]: createTablePolicy(TABLES.CONFIG, stryMutAct_9fa48("33922") ? {} : (stryCov_9fa48("33922"), {
    policyClass: CDC_POLICY_CLASS.CONTROL_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: stryMutAct_9fa48("33923") ? false : (stryCov_9fa48("33923"), true),
    readinessRelevant: stryMutAct_9fa48("33924") ? false : (stryCov_9fa48("33924"), true),
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.BOOTSTRAP_ONLY,
    externalCdcAllowed: stryMutAct_9fa48("33925") ? true : (stryCov_9fa48("33925"), false)
  })),
  [TABLES.SQL_TRANSACTIONS]: createTablePolicy(TABLES.SQL_TRANSACTIONS, stryMutAct_9fa48("33926") ? {} : (stryCov_9fa48("33926"), {
    policyClass: CDC_POLICY_CLASS.CONTROL_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: stryMutAct_9fa48("33927") ? false : (stryCov_9fa48("33927"), true),
    readinessRelevant: stryMutAct_9fa48("33928") ? false : (stryCov_9fa48("33928"), true),
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.BOOTSTRAP_ONLY,
    externalCdcAllowed: stryMutAct_9fa48("33929") ? true : (stryCov_9fa48("33929"), false)
  })),
  [TABLES.SQL_TRANSACTION_PARTICIPANTS]: createTablePolicy(TABLES.SQL_TRANSACTION_PARTICIPANTS, stryMutAct_9fa48("33930") ? {} : (stryCov_9fa48("33930"), {
    policyClass: CDC_POLICY_CLASS.CONTROL_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: stryMutAct_9fa48("33931") ? false : (stryCov_9fa48("33931"), true),
    readinessRelevant: stryMutAct_9fa48("33932") ? false : (stryCov_9fa48("33932"), true),
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.BOOTSTRAP_ONLY,
    externalCdcAllowed: stryMutAct_9fa48("33933") ? true : (stryCov_9fa48("33933"), false)
  })),
  [TABLES.SQL_WRITE_OPERATIONS]: createTablePolicy(TABLES.SQL_WRITE_OPERATIONS, stryMutAct_9fa48("33934") ? {} : (stryCov_9fa48("33934"), {
    policyClass: CDC_POLICY_CLASS.CONTROL_NO_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: stryMutAct_9fa48("33935") ? true : (stryCov_9fa48("33935"), false),
    readinessRelevant: stryMutAct_9fa48("33936") ? true : (stryCov_9fa48("33936"), false),
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.NONE,
    externalCdcAllowed: stryMutAct_9fa48("33937") ? true : (stryCov_9fa48("33937"), false)
  })),
  [TABLES.SCHEMA_MIGRATION_PARTITIONS]: createTablePolicy(TABLES.SCHEMA_MIGRATION_PARTITIONS, stryMutAct_9fa48("33938") ? {} : (stryCov_9fa48("33938"), {
    policyClass: CDC_POLICY_CLASS.CONTROL_NO_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: stryMutAct_9fa48("33939") ? true : (stryCov_9fa48("33939"), false),
    readinessRelevant: stryMutAct_9fa48("33940") ? true : (stryCov_9fa48("33940"), false),
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.NONE,
    externalCdcAllowed: stryMutAct_9fa48("33941") ? true : (stryCov_9fa48("33941"), false)
  })),
  [TABLES.DEBUG_SESSIONS]: createTablePolicy(TABLES.DEBUG_SESSIONS, stryMutAct_9fa48("33942") ? {} : (stryCov_9fa48("33942"), {
    policyClass: CDC_POLICY_CLASS.CONTROL_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: stryMutAct_9fa48("33943") ? false : (stryCov_9fa48("33943"), true),
    readinessRelevant: stryMutAct_9fa48("33944") ? false : (stryCov_9fa48("33944"), true),
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.BOOTSTRAP_ONLY,
    externalCdcAllowed: stryMutAct_9fa48("33945") ? true : (stryCov_9fa48("33945"), false)
  })),
  [TABLES.LATENCY_GROUPS]: createTablePolicy(TABLES.LATENCY_GROUPS, stryMutAct_9fa48("33946") ? {} : (stryCov_9fa48("33946"), {
    policyClass: CDC_POLICY_CLASS.CONTROL_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: stryMutAct_9fa48("33947") ? false : (stryCov_9fa48("33947"), true),
    readinessRelevant: stryMutAct_9fa48("33948") ? false : (stryCov_9fa48("33948"), true),
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.BOOTSTRAP_ONLY,
    externalCdcAllowed: stryMutAct_9fa48("33949") ? true : (stryCov_9fa48("33949"), false)
  })),
  [TABLES.INTER_GROUP_LATENCIES]: createTablePolicy(TABLES.INTER_GROUP_LATENCIES, stryMutAct_9fa48("33950") ? {} : (stryCov_9fa48("33950"), {
    policyClass: CDC_POLICY_CLASS.CONTROL_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: stryMutAct_9fa48("33951") ? false : (stryCov_9fa48("33951"), true),
    readinessRelevant: stryMutAct_9fa48("33952") ? false : (stryCov_9fa48("33952"), true),
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.BOOTSTRAP_ONLY,
    externalCdcAllowed: stryMutAct_9fa48("33953") ? true : (stryCov_9fa48("33953"), false)
  })),
  [TABLES.LOGS]: createTablePolicy(TABLES.LOGS, stryMutAct_9fa48("33954") ? {} : (stryCov_9fa48("33954"), {
    policyClass: CDC_POLICY_CLASS.CONTROL_NO_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: stryMutAct_9fa48("33955") ? true : (stryCov_9fa48("33955"), false),
    readinessRelevant: stryMutAct_9fa48("33956") ? true : (stryCov_9fa48("33956"), false),
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.NONE,
    externalCdcAllowed: stryMutAct_9fa48("33957") ? true : (stryCov_9fa48("33957"), false)
  })),
  [TABLES.CONTEXTS]: createTablePolicy(TABLES.CONTEXTS, stryMutAct_9fa48("33958") ? {} : (stryCov_9fa48("33958"), {
    policyClass: CDC_POLICY_CLASS.CONTROL_NO_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: stryMutAct_9fa48("33959") ? true : (stryCov_9fa48("33959"), false),
    readinessRelevant: stryMutAct_9fa48("33960") ? true : (stryCov_9fa48("33960"), false),
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.NONE,
    externalCdcAllowed: stryMutAct_9fa48("33961") ? true : (stryCov_9fa48("33961"), false)
  })),
  [TABLES.CODE]: createTablePolicy(TABLES.CODE, stryMutAct_9fa48("33962") ? {} : (stryCov_9fa48("33962"), {
    policyClass: CDC_POLICY_CLASS.CONTROL_NO_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: stryMutAct_9fa48("33963") ? true : (stryCov_9fa48("33963"), false),
    readinessRelevant: stryMutAct_9fa48("33964") ? true : (stryCov_9fa48("33964"), false),
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.NONE,
    externalCdcAllowed: stryMutAct_9fa48("33965") ? true : (stryCov_9fa48("33965"), false)
  })),
  [TABLES.LIVE_QUERIES]: createTablePolicy(TABLES.LIVE_QUERIES, stryMutAct_9fa48("33966") ? {} : (stryCov_9fa48("33966"), {
    policyClass: CDC_POLICY_CLASS.CONTROL_NO_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: stryMutAct_9fa48("33967") ? true : (stryCov_9fa48("33967"), false),
    readinessRelevant: stryMutAct_9fa48("33968") ? true : (stryCov_9fa48("33968"), false),
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.NONE,
    externalCdcAllowed: stryMutAct_9fa48("33969") ? true : (stryCov_9fa48("33969"), false)
  })),
  [TABLES.SERVICE_TIMERS]: createTablePolicy(TABLES.SERVICE_TIMERS, stryMutAct_9fa48("33970") ? {} : (stryCov_9fa48("33970"), {
    policyClass: CDC_POLICY_CLASS.CONTROL_NO_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: stryMutAct_9fa48("33971") ? true : (stryCov_9fa48("33971"), false),
    readinessRelevant: stryMutAct_9fa48("33972") ? true : (stryCov_9fa48("33972"), false),
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.NONE,
    externalCdcAllowed: stryMutAct_9fa48("33973") ? true : (stryCov_9fa48("33973"), false)
  })),
  [TABLES.MODULE_MANIFESTS]: createTablePolicy(TABLES.MODULE_MANIFESTS, stryMutAct_9fa48("33974") ? {} : (stryCov_9fa48("33974"), {
    policyClass: CDC_POLICY_CLASS.CONTROL_NO_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: stryMutAct_9fa48("33975") ? true : (stryCov_9fa48("33975"), false),
    readinessRelevant: stryMutAct_9fa48("33976") ? true : (stryCov_9fa48("33976"), false),
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.NONE,
    externalCdcAllowed: stryMutAct_9fa48("33977") ? true : (stryCov_9fa48("33977"), false)
  })),
  [TABLES.PACKAGE_REGISTRY_MAPPINGS]: createTablePolicy(TABLES.PACKAGE_REGISTRY_MAPPINGS, stryMutAct_9fa48("33978") ? {} : (stryCov_9fa48("33978"), {
    policyClass: CDC_POLICY_CLASS.CONTROL_NO_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: stryMutAct_9fa48("33979") ? true : (stryCov_9fa48("33979"), false),
    readinessRelevant: stryMutAct_9fa48("33980") ? true : (stryCov_9fa48("33980"), false),
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.NONE,
    externalCdcAllowed: stryMutAct_9fa48("33981") ? true : (stryCov_9fa48("33981"), false)
  })),
  [TABLES.PACKAGE_REGISTRY_OVERRIDES]: createTablePolicy(TABLES.PACKAGE_REGISTRY_OVERRIDES, stryMutAct_9fa48("33982") ? {} : (stryCov_9fa48("33982"), {
    policyClass: CDC_POLICY_CLASS.CONTROL_NO_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: stryMutAct_9fa48("33983") ? true : (stryCov_9fa48("33983"), false),
    readinessRelevant: stryMutAct_9fa48("33984") ? true : (stryCov_9fa48("33984"), false),
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.NONE,
    externalCdcAllowed: stryMutAct_9fa48("33985") ? true : (stryCov_9fa48("33985"), false)
  })),
  [TABLES.MODULE_DEPENDENCY_LOCKS]: createTablePolicy(TABLES.MODULE_DEPENDENCY_LOCKS, stryMutAct_9fa48("33986") ? {} : (stryCov_9fa48("33986"), {
    policyClass: CDC_POLICY_CLASS.CONTROL_NO_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: stryMutAct_9fa48("33987") ? true : (stryCov_9fa48("33987"), false),
    readinessRelevant: stryMutAct_9fa48("33988") ? true : (stryCov_9fa48("33988"), false),
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.NONE,
    externalCdcAllowed: stryMutAct_9fa48("33989") ? true : (stryCov_9fa48("33989"), false)
  })),
  [TABLES.WASM_OPERATIONS]: createTablePolicy(TABLES.WASM_OPERATIONS, stryMutAct_9fa48("33990") ? {} : (stryCov_9fa48("33990"), {
    policyClass: CDC_POLICY_CLASS.CONTROL_NO_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: stryMutAct_9fa48("33991") ? true : (stryCov_9fa48("33991"), false),
    readinessRelevant: stryMutAct_9fa48("33992") ? true : (stryCov_9fa48("33992"), false),
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.NONE,
    externalCdcAllowed: stryMutAct_9fa48("33993") ? true : (stryCov_9fa48("33993"), false)
  })),
  [TABLES.DEBUG_BREAKPOINTS]: createTablePolicy(TABLES.DEBUG_BREAKPOINTS, stryMutAct_9fa48("33994") ? {} : (stryCov_9fa48("33994"), {
    policyClass: CDC_POLICY_CLASS.CONTROL_NO_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: stryMutAct_9fa48("33995") ? true : (stryCov_9fa48("33995"), false),
    readinessRelevant: stryMutAct_9fa48("33996") ? true : (stryCov_9fa48("33996"), false),
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.NONE,
    externalCdcAllowed: stryMutAct_9fa48("33997") ? true : (stryCov_9fa48("33997"), false)
  })),
  [TABLES.DEBUG_SNAPSHOTS]: createTablePolicy(TABLES.DEBUG_SNAPSHOTS, stryMutAct_9fa48("33998") ? {} : (stryCov_9fa48("33998"), {
    policyClass: CDC_POLICY_CLASS.CONTROL_NO_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: stryMutAct_9fa48("33999") ? true : (stryCov_9fa48("33999"), false),
    readinessRelevant: stryMutAct_9fa48("34000") ? true : (stryCov_9fa48("34000"), false),
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.NONE,
    externalCdcAllowed: stryMutAct_9fa48("34001") ? true : (stryCov_9fa48("34001"), false)
  }))
}));
const USER_TABLE_EXTERNAL_CDC_POLICY = createTablePolicy(null, stryMutAct_9fa48("34002") ? {} : (stryCov_9fa48("34002"), {
  policyClass: CDC_POLICY_CLASS.USER_EXTERNAL_CDC,
  authorityClass: CDC_AUTHORITY_CLASS.USER,
  internalCachePropagation: stryMutAct_9fa48("34003") ? true : (stryCov_9fa48("34003"), false),
  readinessRelevant: stryMutAct_9fa48("34004") ? true : (stryCov_9fa48("34004"), false),
  bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.NONE,
  externalCdcAllowed: stryMutAct_9fa48("34005") ? false : (stryCov_9fa48("34005"), true)
}));
const USER_TABLE_NO_CDC_POLICY = createTablePolicy(null, stryMutAct_9fa48("34006") ? {} : (stryCov_9fa48("34006"), {
  policyClass: CDC_POLICY_CLASS.USER_NO_CDC,
  authorityClass: CDC_AUTHORITY_CLASS.USER,
  internalCachePropagation: stryMutAct_9fa48("34007") ? true : (stryCov_9fa48("34007"), false),
  readinessRelevant: stryMutAct_9fa48("34008") ? true : (stryCov_9fa48("34008"), false),
  bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.NONE,
  externalCdcAllowed: stryMutAct_9fa48("34009") ? true : (stryCov_9fa48("34009"), false)
}));
const SYSTEM_TABLE_CDC_POLICY_LIST = Object.freeze(Object.values(SYSTEM_TABLE_CDC_POLICIES));
const CDC_PROPAGATED_TABLES = Object.freeze(stryMutAct_9fa48("34010") ? SYSTEM_TABLE_CDC_POLICY_LIST.map(policy => policy.tableName) : (stryCov_9fa48("34010"), SYSTEM_TABLE_CDC_POLICY_LIST.filter(stryMutAct_9fa48("34011") ? () => undefined : (stryCov_9fa48("34011"), policy => stryMutAct_9fa48("34014") ? policy.internalCachePropagation !== true : stryMutAct_9fa48("34013") ? false : stryMutAct_9fa48("34012") ? true : (stryCov_9fa48("34012", "34013", "34014"), policy.internalCachePropagation === (stryMutAct_9fa48("34015") ? false : (stryCov_9fa48("34015"), true))))).map(stryMutAct_9fa48("34016") ? () => undefined : (stryCov_9fa48("34016"), policy => policy.tableName))));
const CDC_NON_PROPAGATED_TABLES = Object.freeze(stryMutAct_9fa48("34017") ? SYSTEM_TABLE_CDC_POLICY_LIST.map(policy => policy.tableName) : (stryCov_9fa48("34017"), SYSTEM_TABLE_CDC_POLICY_LIST.filter(stryMutAct_9fa48("34018") ? () => undefined : (stryCov_9fa48("34018"), policy => stryMutAct_9fa48("34021") ? policy.internalCachePropagation === true : stryMutAct_9fa48("34020") ? false : stryMutAct_9fa48("34019") ? true : (stryCov_9fa48("34019", "34020", "34021"), policy.internalCachePropagation !== (stryMutAct_9fa48("34022") ? false : (stryCov_9fa48("34022"), true))))).map(stryMutAct_9fa48("34023") ? () => undefined : (stryCov_9fa48("34023"), policy => policy.tableName))));
function isKnownSystemTable(tableName) {
  if (stryMutAct_9fa48("34024")) {
    {}
  } else {
    stryCov_9fa48("34024");
    return Object.prototype.hasOwnProperty.call(SYSTEM_TABLE_CDC_POLICIES, String(stryMutAct_9fa48("34027") ? tableName && '' : stryMutAct_9fa48("34026") ? false : stryMutAct_9fa48("34025") ? true : (stryCov_9fa48("34025", "34026", "34027"), tableName || (stryMutAct_9fa48("34028") ? "Stryker was here!" : (stryCov_9fa48("34028"), '')))));
  }
}
function getSystemTableCdcPolicy(tableName) {
  if (stryMutAct_9fa48("34029")) {
    {}
  } else {
    stryCov_9fa48("34029");
    const normalizedTableName = String(stryMutAct_9fa48("34032") ? tableName && '' : stryMutAct_9fa48("34031") ? false : stryMutAct_9fa48("34030") ? true : (stryCov_9fa48("34030", "34031", "34032"), tableName || (stryMutAct_9fa48("34033") ? "Stryker was here!" : (stryCov_9fa48("34033"), ''))));
    return stryMutAct_9fa48("34036") ? SYSTEM_TABLE_CDC_POLICIES[normalizedTableName] && null : stryMutAct_9fa48("34035") ? false : stryMutAct_9fa48("34034") ? true : (stryCov_9fa48("34034", "34035", "34036"), SYSTEM_TABLE_CDC_POLICIES[normalizedTableName] || null);
  }
}
function getTableCdcPolicy(tableName, options = {}) {
  if (stryMutAct_9fa48("34037")) {
    {}
  } else {
    stryCov_9fa48("34037");
    const normalizedTableName = String(stryMutAct_9fa48("34040") ? tableName && '' : stryMutAct_9fa48("34039") ? false : stryMutAct_9fa48("34038") ? true : (stryCov_9fa48("34038", "34039", "34040"), tableName || (stryMutAct_9fa48("34041") ? "Stryker was here!" : (stryCov_9fa48("34041"), ''))));
    const systemTablePolicy = getSystemTableCdcPolicy(normalizedTableName);
    if (stryMutAct_9fa48("34043") ? false : stryMutAct_9fa48("34042") ? true : (stryCov_9fa48("34042", "34043"), systemTablePolicy)) {
      if (stryMutAct_9fa48("34044")) {
        {}
      } else {
        stryCov_9fa48("34044");
        return systemTablePolicy;
      }
    }
    if (stryMutAct_9fa48("34047") ? options.externalCdcAllowed !== false : stryMutAct_9fa48("34046") ? false : stryMutAct_9fa48("34045") ? true : (stryCov_9fa48("34045", "34046", "34047"), options.externalCdcAllowed === (stryMutAct_9fa48("34048") ? true : (stryCov_9fa48("34048"), false)))) {
      if (stryMutAct_9fa48("34049")) {
        {}
      } else {
        stryCov_9fa48("34049");
        return createTablePolicy(normalizedTableName, USER_TABLE_NO_CDC_POLICY);
      }
    }
    return createTablePolicy(normalizedTableName, USER_TABLE_EXTERNAL_CDC_POLICY);
  }
}
function isTableInternalCachePropagationEnabled(tableName, options = {}) {
  if (stryMutAct_9fa48("34050")) {
    {}
  } else {
    stryCov_9fa48("34050");
    return stryMutAct_9fa48("34053") ? getTableCdcPolicy(tableName, options)?.internalCachePropagation !== true : stryMutAct_9fa48("34052") ? false : stryMutAct_9fa48("34051") ? true : (stryCov_9fa48("34051", "34052", "34053"), (stryMutAct_9fa48("34054") ? getTableCdcPolicy(tableName, options).internalCachePropagation : (stryCov_9fa48("34054"), getTableCdcPolicy(tableName, options)?.internalCachePropagation)) === (stryMutAct_9fa48("34055") ? false : (stryCov_9fa48("34055"), true)));
  }
}
function isTableCdcReadinessRelevant(tableName, options = {}) {
  if (stryMutAct_9fa48("34056")) {
    {}
  } else {
    stryCov_9fa48("34056");
    return stryMutAct_9fa48("34059") ? getTableCdcPolicy(tableName, options)?.readinessRelevant !== true : stryMutAct_9fa48("34058") ? false : stryMutAct_9fa48("34057") ? true : (stryCov_9fa48("34057", "34058", "34059"), (stryMutAct_9fa48("34060") ? getTableCdcPolicy(tableName, options).readinessRelevant : (stryCov_9fa48("34060"), getTableCdcPolicy(tableName, options)?.readinessRelevant)) === (stryMutAct_9fa48("34061") ? false : (stryCov_9fa48("34061"), true)));
  }
}
function isExternalCdcAllowedForTable(tableName, options = {}) {
  if (stryMutAct_9fa48("34062")) {
    {}
  } else {
    stryCov_9fa48("34062");
    return stryMutAct_9fa48("34065") ? getTableCdcPolicy(tableName, options)?.externalCdcAllowed !== true : stryMutAct_9fa48("34064") ? false : stryMutAct_9fa48("34063") ? true : (stryCov_9fa48("34063", "34064", "34065"), (stryMutAct_9fa48("34066") ? getTableCdcPolicy(tableName, options).externalCdcAllowed : (stryCov_9fa48("34066"), getTableCdcPolicy(tableName, options)?.externalCdcAllowed)) === (stryMutAct_9fa48("34067") ? false : (stryCov_9fa48("34067"), true)));
  }
}
export { CDC_AUTHORITY_CLASS, CDC_BOOTSTRAP_HYDRATION_MODE, CDC_NON_PROPAGATED_TABLES, CDC_POLICY_CLASS, CDC_PROPAGATED_TABLES, SYSTEM_TABLE_CDC_POLICIES, getSystemTableCdcPolicy, getTableCdcPolicy, isExternalCdcAllowedForTable, isKnownSystemTable, isTableCdcReadinessRelevant, isTableInternalCachePropagationEnabled };
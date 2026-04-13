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
const INVARIANT_SEVERITY = Object.freeze(stryMutAct_9fa48("81502") ? {} : (stryCov_9fa48("81502"), {
  CRITICAL: stryMutAct_9fa48("81503") ? "" : (stryCov_9fa48("81503"), 'critical'),
  ERROR: stryMutAct_9fa48("81504") ? "" : (stryCov_9fa48("81504"), 'error'),
  WARNING: stryMutAct_9fa48("81505") ? "" : (stryCov_9fa48("81505"), 'warning')
}));
const INVARIANT_SCOPE = Object.freeze(stryMutAct_9fa48("81506") ? {} : (stryCov_9fa48("81506"), {
  CLUSTER: stryMutAct_9fa48("81507") ? "" : (stryCov_9fa48("81507"), 'cluster'),
  NODE: stryMutAct_9fa48("81508") ? "" : (stryCov_9fa48("81508"), 'node'),
  PARTITION: stryMutAct_9fa48("81509") ? "" : (stryCov_9fa48("81509"), 'partition'),
  REPLICA: stryMutAct_9fa48("81510") ? "" : (stryCov_9fa48("81510"), 'replica'),
  BENCHMARK: stryMutAct_9fa48("81511") ? "" : (stryCov_9fa48("81511"), 'benchmark')
}));
const INVARIANT_EVENT = Object.freeze(stryMutAct_9fa48("81512") ? {} : (stryCov_9fa48("81512"), {
  RUNTIME: stryMutAct_9fa48("81513") ? "" : (stryCov_9fa48("81513"), 'runtime.invariant')
}));
const INVARIANT_ID = Object.freeze(stryMutAct_9fa48("81514") ? {} : (stryCov_9fa48("81514"), {
  CONTROL_PLANE_SNAPSHOT_AVAILABLE: stryMutAct_9fa48("81515") ? "" : (stryCov_9fa48("81515"), 'control_plane.snapshot_available'),
  CONTROL_PLANE_PARTITION_LEADER_DISCOVERABLE: stryMutAct_9fa48("81516") ? "" : (stryCov_9fa48("81516"), 'control_plane.partition_leader_discoverable'),
  CDC_RETRY_BUDGET_HEALTHY: stryMutAct_9fa48("81517") ? "" : (stryCov_9fa48("81517"), 'cdc.retry_budget_healthy'),
  CACHE_FRESHNESS_WITHIN_WATERMARK: stryMutAct_9fa48("81518") ? "" : (stryCov_9fa48("81518"), 'cache.freshness_within_watermark'),
  DISCOVERY_SYS_POSTGRES_WIRE_VISIBLE: stryMutAct_9fa48("81519") ? "" : (stryCov_9fa48("81519"), 'discovery.sys_postgres_wire_visible'),
  DISCOVERY_NON_EMPTY_WITH_SERVICES_PRESENT: stryMutAct_9fa48("81520") ? "" : (stryCov_9fa48("81520"), 'discovery.non_empty_with_services_present'),
  PARTITION_SINGLE_CANONICAL_LEADER: stryMutAct_9fa48("81521") ? "" : (stryCov_9fa48("81521"), 'partition.single_canonical_leader'),
  REPLICA_LOCAL_ROLE_IS_STABLE_FOR_READINESS: stryMutAct_9fa48("81522") ? "" : (stryCov_9fa48("81522"), 'replica.local_role_is_stable_for_readiness'),
  NODE_LEASE_STATE_NOT_REGRESSED: stryMutAct_9fa48("81523") ? "" : (stryCov_9fa48("81523"), 'node.lease_state_not_regressed'),
  CDC_SUBSCRIPTION_PROGRESS_VISIBLE: stryMutAct_9fa48("81524") ? "" : (stryCov_9fa48("81524"), 'cdc.subscription_progress_visible'),
  BENCHMARK_REQUIRED_NODES_ALL_READY: stryMutAct_9fa48("81525") ? "" : (stryCov_9fa48("81525"), 'benchmark.required_nodes_all_ready'),
  LEADER_UNIQUENESS: stryMutAct_9fa48("81526") ? "" : (stryCov_9fa48("81526"), 'control_plane.leader_uniqueness'),
  MONOTONIC_STEPS: stryMutAct_9fa48("81527") ? "" : (stryCov_9fa48("81527"), 'control_plane.monotonic_steps'),
  CLAIM_EXCLUSIVITY: stryMutAct_9fa48("81528") ? "" : (stryCov_9fa48("81528"), 'control_plane.claim_exclusivity'),
  ORPHAN_IN_FLIGHT: stryMutAct_9fa48("81529") ? "" : (stryCov_9fa48("81529"), 'control_plane.orphan_in_flight'),
  CONTROL_PLANE_REPLICA_OPERATIONS_SINGLE_WRITER: stryMutAct_9fa48("81530") ? "" : (stryCov_9fa48("81530"), 'control_plane.replica_operations_single_writer'),
  CONTROL_PLANE_ACK_BEFORE_ADVANCE: stryMutAct_9fa48("81531") ? "" : (stryCov_9fa48("81531"), 'control_plane.ack_before_advance'),
  CONTROL_PLANE_SPLIT_RESUME_COMPLETENESS: stryMutAct_9fa48("81532") ? "" : (stryCov_9fa48("81532"), 'control_plane.split_resume_completeness'),
  CONTROL_PLANE_READINESS_DIMENSION_CORRECTNESS: stryMutAct_9fa48("81533") ? "" : (stryCov_9fa48("81533"), 'control_plane.readiness_dimension_correctness'),
  CONTROL_PLANE_TRANSACTION_COORDINATOR_REQUIRED: stryMutAct_9fa48("81534") ? "" : (stryCov_9fa48("81534"), 'control_plane.transaction_coordinator_required')
}));
function freezeDefinition(definition) {
  if (stryMutAct_9fa48("81535")) {
    {}
  } else {
    stryCov_9fa48("81535");
    return Object.freeze(stryMutAct_9fa48("81536") ? {} : (stryCov_9fa48("81536"), {
      ...definition,
      expected: Object.freeze(stryMutAct_9fa48("81537") ? {} : (stryCov_9fa48("81537"), {
        condition: String(stryMutAct_9fa48("81540") ? definition.expected?.condition && '' : stryMutAct_9fa48("81539") ? false : stryMutAct_9fa48("81538") ? true : (stryCov_9fa48("81538", "81539", "81540"), (stryMutAct_9fa48("81541") ? definition.expected.condition : (stryCov_9fa48("81541"), definition.expected?.condition)) || (stryMutAct_9fa48("81542") ? "Stryker was here!" : (stryCov_9fa48("81542"), ''))))
      }))
    }));
  }
}
const INVARIANT_CATALOG = Object.freeze(stryMutAct_9fa48("81543") ? {} : (stryCov_9fa48("81543"), {
  [INVARIANT_ID.CONTROL_PLANE_SNAPSHOT_AVAILABLE]: freezeDefinition(stryMutAct_9fa48("81544") ? {} : (stryCov_9fa48("81544"), {
    id: INVARIANT_ID.CONTROL_PLANE_SNAPSHOT_AVAILABLE,
    severity: INVARIANT_SEVERITY.CRITICAL,
    scope: INVARIANT_SCOPE.CLUSTER,
    owningSubsystem: stryMutAct_9fa48("81545") ? "" : (stryCov_9fa48("81545"), 'distributed-harness'),
    defaultReasonCode: stryMutAct_9fa48("81546") ? "" : (stryCov_9fa48("81546"), 'snapshot_missing'),
    expected: stryMutAct_9fa48("81547") ? {} : (stryCov_9fa48("81547"), {
      condition: stryMutAct_9fa48("81548") ? "" : (stryCov_9fa48("81548"), 'all required preflight snapshots are collected')
    })
  })),
  [INVARIANT_ID.CONTROL_PLANE_PARTITION_LEADER_DISCOVERABLE]: freezeDefinition(stryMutAct_9fa48("81549") ? {} : (stryCov_9fa48("81549"), {
    id: INVARIANT_ID.CONTROL_PLANE_PARTITION_LEADER_DISCOVERABLE,
    severity: INVARIANT_SEVERITY.CRITICAL,
    scope: INVARIANT_SCOPE.PARTITION,
    owningSubsystem: stryMutAct_9fa48("81550") ? "" : (stryCov_9fa48("81550"), 'control-plane'),
    defaultReasonCode: stryMutAct_9fa48("81551") ? "" : (stryCov_9fa48("81551"), 'leadership_unknown_control_plane_partition'),
    expected: stryMutAct_9fa48("81552") ? {} : (stryCov_9fa48("81552"), {
      condition: stryMutAct_9fa48("81553") ? "" : (stryCov_9fa48("81553"), 'control-plane owner rows expose a leader for every observed partition')
    })
  })),
  [INVARIANT_ID.CDC_RETRY_BUDGET_HEALTHY]: freezeDefinition(stryMutAct_9fa48("81554") ? {} : (stryCov_9fa48("81554"), {
    id: INVARIANT_ID.CDC_RETRY_BUDGET_HEALTHY,
    severity: INVARIANT_SEVERITY.CRITICAL,
    scope: INVARIANT_SCOPE.NODE,
    owningSubsystem: stryMutAct_9fa48("81555") ? "" : (stryCov_9fa48("81555"), 'cdc'),
    defaultReasonCode: stryMutAct_9fa48("81556") ? "" : (stryCov_9fa48("81556"), 'cdc_retry_storm'),
    expected: stryMutAct_9fa48("81557") ? {} : (stryCov_9fa48("81557"), {
      condition: stryMutAct_9fa48("81558") ? "" : (stryCov_9fa48("81558"), 'cdc retry activity remains below the configured storm threshold')
    })
  })),
  [INVARIANT_ID.CACHE_FRESHNESS_WITHIN_WATERMARK]: freezeDefinition(stryMutAct_9fa48("81559") ? {} : (stryCov_9fa48("81559"), {
    id: INVARIANT_ID.CACHE_FRESHNESS_WITHIN_WATERMARK,
    severity: INVARIANT_SEVERITY.ERROR,
    scope: INVARIANT_SCOPE.NODE,
    owningSubsystem: stryMutAct_9fa48("81560") ? "" : (stryCov_9fa48("81560"), 'cache'),
    defaultReasonCode: stryMutAct_9fa48("81561") ? "" : (stryCov_9fa48("81561"), 'cache_stale_watermark'),
    expected: stryMutAct_9fa48("81562") ? {} : (stryCov_9fa48("81562"), {
      condition: stryMutAct_9fa48("81563") ? "" : (stryCov_9fa48("81563"), 'cache freshness remains within the configured watermark')
    })
  })),
  [INVARIANT_ID.DISCOVERY_SYS_POSTGRES_WIRE_VISIBLE]: freezeDefinition(stryMutAct_9fa48("81564") ? {} : (stryCov_9fa48("81564"), {
    id: INVARIANT_ID.DISCOVERY_SYS_POSTGRES_WIRE_VISIBLE,
    severity: INVARIANT_SEVERITY.CRITICAL,
    scope: INVARIANT_SCOPE.NODE,
    owningSubsystem: stryMutAct_9fa48("81565") ? "" : (stryCov_9fa48("81565"), 'discovery'),
    defaultReasonCode: stryMutAct_9fa48("81566") ? "" : (stryCov_9fa48("81566"), 'services_missing_sys_postgres_wire'),
    expected: stryMutAct_9fa48("81567") ? {} : (stryCov_9fa48("81567"), {
      condition: stryMutAct_9fa48("81568") ? "" : (stryCov_9fa48("81568"), 'sys-postgres-wire service rows are visible before load discovery')
    })
  })),
  [INVARIANT_ID.DISCOVERY_NON_EMPTY_WITH_SERVICES_PRESENT]: freezeDefinition(stryMutAct_9fa48("81569") ? {} : (stryCov_9fa48("81569"), {
    id: INVARIANT_ID.DISCOVERY_NON_EMPTY_WITH_SERVICES_PRESENT,
    severity: INVARIANT_SEVERITY.CRITICAL,
    scope: INVARIANT_SCOPE.NODE,
    owningSubsystem: stryMutAct_9fa48("81570") ? "" : (stryCov_9fa48("81570"), 'discovery'),
    defaultReasonCode: stryMutAct_9fa48("81571") ? "" : (stryCov_9fa48("81571"), 'discovery_empty_with_services_present'),
    expected: stryMutAct_9fa48("81572") ? {} : (stryCov_9fa48("81572"), {
      condition: stryMutAct_9fa48("81573") ? "" : (stryCov_9fa48("81573"), 'discovery selects at least one eligible node when service rows exist')
    })
  })),
  [INVARIANT_ID.PARTITION_SINGLE_CANONICAL_LEADER]: freezeDefinition(stryMutAct_9fa48("81574") ? {} : (stryCov_9fa48("81574"), {
    id: INVARIANT_ID.PARTITION_SINGLE_CANONICAL_LEADER,
    severity: INVARIANT_SEVERITY.CRITICAL,
    scope: INVARIANT_SCOPE.PARTITION,
    owningSubsystem: stryMutAct_9fa48("81575") ? "" : (stryCov_9fa48("81575"), 'partition-service'),
    defaultReasonCode: stryMutAct_9fa48("81576") ? "" : (stryCov_9fa48("81576"), 'partition_leader_mismatch'),
    expected: stryMutAct_9fa48("81577") ? {} : (stryCov_9fa48("81577"), {
      condition: stryMutAct_9fa48("81578") ? "" : (stryCov_9fa48("81578"), 'every partition resolves to exactly one canonical owner-row leader')
    })
  })),
  [INVARIANT_ID.REPLICA_LOCAL_ROLE_IS_STABLE_FOR_READINESS]: freezeDefinition(stryMutAct_9fa48("81579") ? {} : (stryCov_9fa48("81579"), {
    id: INVARIANT_ID.REPLICA_LOCAL_ROLE_IS_STABLE_FOR_READINESS,
    severity: INVARIANT_SEVERITY.CRITICAL,
    scope: INVARIANT_SCOPE.REPLICA,
    owningSubsystem: stryMutAct_9fa48("81580") ? "" : (stryCov_9fa48("81580"), 'readiness'),
    defaultReasonCode: stryMutAct_9fa48("81581") ? "" : (stryCov_9fa48("81581"), 'local_replica_role_unstable'),
    expected: stryMutAct_9fa48("81582") ? {} : (stryCov_9fa48("81582"), {
      condition: stryMutAct_9fa48("81583") ? "" : (stryCov_9fa48("81583"), 'replicas admitted for readiness are in stable serving roles')
    })
  })),
  [INVARIANT_ID.NODE_LEASE_STATE_NOT_REGRESSED]: freezeDefinition(stryMutAct_9fa48("81584") ? {} : (stryCov_9fa48("81584"), {
    id: INVARIANT_ID.NODE_LEASE_STATE_NOT_REGRESSED,
    severity: INVARIANT_SEVERITY.CRITICAL,
    scope: INVARIANT_SCOPE.NODE,
    owningSubsystem: stryMutAct_9fa48("81585") ? "" : (stryCov_9fa48("81585"), 'lease-service'),
    defaultReasonCode: stryMutAct_9fa48("81586") ? "" : (stryCov_9fa48("81586"), 'lease_state_regressed'),
    expected: stryMutAct_9fa48("81587") ? {} : (stryCov_9fa48("81587"), {
      condition: stryMutAct_9fa48("81588") ? "" : (stryCov_9fa48("81588"), 'lease and heartbeat state never regress behind newer observations')
    })
  })),
  [INVARIANT_ID.CDC_SUBSCRIPTION_PROGRESS_VISIBLE]: freezeDefinition(stryMutAct_9fa48("81589") ? {} : (stryCov_9fa48("81589"), {
    id: INVARIANT_ID.CDC_SUBSCRIPTION_PROGRESS_VISIBLE,
    severity: INVARIANT_SEVERITY.CRITICAL,
    scope: INVARIANT_SCOPE.NODE,
    owningSubsystem: stryMutAct_9fa48("81590") ? "" : (stryCov_9fa48("81590"), 'cdc'),
    defaultReasonCode: stryMutAct_9fa48("81591") ? "" : (stryCov_9fa48("81591"), 'cdc_subscription_progress_missing'),
    expected: stryMutAct_9fa48("81592") ? {} : (stryCov_9fa48("81592"), {
      condition: stryMutAct_9fa48("81593") ? "" : (stryCov_9fa48("81593"), 'cdc subscriptions become active and visible before readiness')
    })
  })),
  [INVARIANT_ID.BENCHMARK_REQUIRED_NODES_ALL_READY]: freezeDefinition(stryMutAct_9fa48("81594") ? {} : (stryCov_9fa48("81594"), {
    id: INVARIANT_ID.BENCHMARK_REQUIRED_NODES_ALL_READY,
    severity: INVARIANT_SEVERITY.CRITICAL,
    scope: INVARIANT_SCOPE.BENCHMARK,
    owningSubsystem: stryMutAct_9fa48("81595") ? "" : (stryCov_9fa48("81595"), 'distributed-harness'),
    defaultReasonCode: stryMutAct_9fa48("81596") ? "" : (stryCov_9fa48("81596"), 'required_nodes_not_ready'),
    expected: stryMutAct_9fa48("81597") ? {} : (stryCov_9fa48("81597"), {
      condition: stryMutAct_9fa48("81598") ? "" : (stryCov_9fa48("81598"), 'all required benchmark nodes are admitted by the shared readiness evaluator')
    })
  })),
  [INVARIANT_ID.LEADER_UNIQUENESS]: freezeDefinition(stryMutAct_9fa48("81599") ? {} : (stryCov_9fa48("81599"), {
    id: INVARIANT_ID.LEADER_UNIQUENESS,
    severity: INVARIANT_SEVERITY.CRITICAL,
    scope: INVARIANT_SCOPE.PARTITION,
    owningSubsystem: stryMutAct_9fa48("81600") ? "" : (stryCov_9fa48("81600"), 'invariant-engine'),
    defaultReasonCode: stryMutAct_9fa48("81601") ? "" : (stryCov_9fa48("81601"), 'duplicate_leader'),
    expected: stryMutAct_9fa48("81602") ? {} : (stryCov_9fa48("81602"), {
      condition: stryMutAct_9fa48("81603") ? "" : (stryCov_9fa48("81603"), 'each partition or message group has at most one canonical leader')
    })
  })),
  [INVARIANT_ID.MONOTONIC_STEPS]: freezeDefinition(stryMutAct_9fa48("81604") ? {} : (stryCov_9fa48("81604"), {
    id: INVARIANT_ID.MONOTONIC_STEPS,
    severity: INVARIANT_SEVERITY.CRITICAL,
    scope: INVARIANT_SCOPE.CLUSTER,
    owningSubsystem: stryMutAct_9fa48("81605") ? "" : (stryCov_9fa48("81605"), 'invariant-engine'),
    defaultReasonCode: stryMutAct_9fa48("81606") ? "" : (stryCov_9fa48("81606"), 'backward_step_transition'),
    expected: stryMutAct_9fa48("81607") ? {} : (stryCov_9fa48("81607"), {
      condition: stryMutAct_9fa48("81608") ? "" : (stryCov_9fa48("81608"), 'workflow step transitions are monotonically increasing')
    })
  })),
  [INVARIANT_ID.CLAIM_EXCLUSIVITY]: freezeDefinition(stryMutAct_9fa48("81609") ? {} : (stryCov_9fa48("81609"), {
    id: INVARIANT_ID.CLAIM_EXCLUSIVITY,
    severity: INVARIANT_SEVERITY.CRITICAL,
    scope: INVARIANT_SCOPE.CLUSTER,
    owningSubsystem: stryMutAct_9fa48("81610") ? "" : (stryCov_9fa48("81610"), 'invariant-engine'),
    defaultReasonCode: stryMutAct_9fa48("81611") ? "" : (stryCov_9fa48("81611"), 'duplicate_claim'),
    expected: stryMutAct_9fa48("81612") ? {} : (stryCov_9fa48("81612"), {
      condition: stryMutAct_9fa48("81613") ? "" : (stryCov_9fa48("81613"), 'each operation id and owner key has at most one active claim')
    })
  })),
  [INVARIANT_ID.ORPHAN_IN_FLIGHT]: freezeDefinition(stryMutAct_9fa48("81614") ? {} : (stryCov_9fa48("81614"), {
    id: INVARIANT_ID.ORPHAN_IN_FLIGHT,
    severity: INVARIANT_SEVERITY.ERROR,
    scope: INVARIANT_SCOPE.CLUSTER,
    owningSubsystem: stryMutAct_9fa48("81615") ? "" : (stryCov_9fa48("81615"), 'invariant-engine'),
    defaultReasonCode: stryMutAct_9fa48("81616") ? "" : (stryCov_9fa48("81616"), 'orphan_in_flight_operation'),
    expected: stryMutAct_9fa48("81617") ? {} : (stryCov_9fa48("81617"), {
      condition: stryMutAct_9fa48("81618") ? "" : (stryCov_9fa48("81618"), 'every in-flight operation has a corresponding owner key')
    })
  })),
  [INVARIANT_ID.CONTROL_PLANE_REPLICA_OPERATIONS_SINGLE_WRITER]: freezeDefinition(stryMutAct_9fa48("81619") ? {} : (stryCov_9fa48("81619"), {
    id: INVARIANT_ID.CONTROL_PLANE_REPLICA_OPERATIONS_SINGLE_WRITER,
    severity: INVARIANT_SEVERITY.CRITICAL,
    scope: INVARIANT_SCOPE.CLUSTER,
    owningSubsystem: stryMutAct_9fa48("81620") ? "" : (stryCov_9fa48("81620"), 'invariant-engine'),
    defaultReasonCode: stryMutAct_9fa48("81621") ? "" : (stryCov_9fa48("81621"), 'replica_operations_single_writer_violation'),
    expected: stryMutAct_9fa48("81622") ? {} : (stryCov_9fa48("81622"), {
      condition: (stryMutAct_9fa48("81623") ? "" : (stryCov_9fa48("81623"), 'owner-managed replica_operations fields are written only by ')) + (stryMutAct_9fa48("81624") ? "" : (stryCov_9fa48("81624"), 'RebalanceCoordinator'))
    })
  })),
  [INVARIANT_ID.CONTROL_PLANE_ACK_BEFORE_ADVANCE]: freezeDefinition(stryMutAct_9fa48("81625") ? {} : (stryCov_9fa48("81625"), {
    id: INVARIANT_ID.CONTROL_PLANE_ACK_BEFORE_ADVANCE,
    severity: INVARIANT_SEVERITY.CRITICAL,
    scope: INVARIANT_SCOPE.PARTITION,
    owningSubsystem: stryMutAct_9fa48("81626") ? "" : (stryCov_9fa48("81626"), 'invariant-engine'),
    defaultReasonCode: stryMutAct_9fa48("81627") ? "" : (stryCov_9fa48("81627"), 'ack_before_advance_violation'),
    expected: stryMutAct_9fa48("81628") ? {} : (stryCov_9fa48("81628"), {
      condition: (stryMutAct_9fa48("81629") ? "" : (stryCov_9fa48("81629"), 'executor-owned topology phases advance only after durable ')) + (stryMutAct_9fa48("81630") ? "" : (stryCov_9fa48("81630"), 'participant acknowledgement'))
    })
  })),
  [INVARIANT_ID.CONTROL_PLANE_SPLIT_RESUME_COMPLETENESS]: freezeDefinition(stryMutAct_9fa48("81631") ? {} : (stryCov_9fa48("81631"), {
    id: INVARIANT_ID.CONTROL_PLANE_SPLIT_RESUME_COMPLETENESS,
    severity: INVARIANT_SEVERITY.CRITICAL,
    scope: INVARIANT_SCOPE.PARTITION,
    owningSubsystem: stryMutAct_9fa48("81632") ? "" : (stryCov_9fa48("81632"), 'invariant-engine'),
    defaultReasonCode: stryMutAct_9fa48("81633") ? "" : (stryCov_9fa48("81633"), 'split_resume_incomplete'),
    expected: stryMutAct_9fa48("81634") ? {} : (stryCov_9fa48("81634"), {
      condition: (stryMutAct_9fa48("81635") ? "" : (stryCov_9fa48("81635"), 'resumable split workflows persist workflow identity, phase, ')) + (stryMutAct_9fa48("81636") ? "" : (stryCov_9fa48("81636"), 'participant state, and required source checkpoints'))
    })
  })),
  [INVARIANT_ID.CONTROL_PLANE_READINESS_DIMENSION_CORRECTNESS]: freezeDefinition(stryMutAct_9fa48("81637") ? {} : (stryCov_9fa48("81637"), {
    id: INVARIANT_ID.CONTROL_PLANE_READINESS_DIMENSION_CORRECTNESS,
    severity: INVARIANT_SEVERITY.CRITICAL,
    scope: INVARIANT_SCOPE.NODE,
    owningSubsystem: stryMutAct_9fa48("81638") ? "" : (stryCov_9fa48("81638"), 'invariant-engine'),
    defaultReasonCode: stryMutAct_9fa48("81639") ? "" : (stryCov_9fa48("81639"), 'readiness_dimension_incorrect'),
    expected: stryMutAct_9fa48("81640") ? {} : (stryCov_9fa48("81640"), {
      condition: (stryMutAct_9fa48("81641") ? "" : (stryCov_9fa48("81641"), 'internal topology consumers gate on repairEligible while ')) + (stryMutAct_9fa48("81642") ? "" : (stryCov_9fa48("81642"), 'routing and benchmark consumers gate on serveEligible'))
    })
  })),
  [INVARIANT_ID.CONTROL_PLANE_TRANSACTION_COORDINATOR_REQUIRED]: freezeDefinition(stryMutAct_9fa48("81643") ? {} : (stryCov_9fa48("81643"), {
    id: INVARIANT_ID.CONTROL_PLANE_TRANSACTION_COORDINATOR_REQUIRED,
    severity: INVARIANT_SEVERITY.CRITICAL,
    scope: INVARIANT_SCOPE.CLUSTER,
    owningSubsystem: stryMutAct_9fa48("81644") ? "" : (stryCov_9fa48("81644"), 'invariant-engine'),
    defaultReasonCode: stryMutAct_9fa48("81645") ? "" : (stryCov_9fa48("81645"), 'transaction_coordinator_required'),
    expected: stryMutAct_9fa48("81646") ? {} : (stryCov_9fa48("81646"), {
      condition: (stryMutAct_9fa48("81647") ? "" : (stryCov_9fa48("81647"), 'atomic topology transitions do not execute when the distributed ')) + (stryMutAct_9fa48("81648") ? "" : (stryCov_9fa48("81648"), 'transaction coordinator is absent'))
    })
  }))
}));
function clonePayload(payload) {
  if (stryMutAct_9fa48("81649")) {
    {}
  } else {
    stryCov_9fa48("81649");
    if (stryMutAct_9fa48("81652") ? (!payload || typeof payload !== 'object') && Array.isArray(payload) : stryMutAct_9fa48("81651") ? false : stryMutAct_9fa48("81650") ? true : (stryCov_9fa48("81650", "81651", "81652"), (stryMutAct_9fa48("81654") ? !payload && typeof payload !== 'object' : stryMutAct_9fa48("81653") ? false : (stryCov_9fa48("81653", "81654"), (stryMutAct_9fa48("81655") ? payload : (stryCov_9fa48("81655"), !payload)) || (stryMutAct_9fa48("81657") ? typeof payload === 'object' : stryMutAct_9fa48("81656") ? false : (stryCov_9fa48("81656", "81657"), typeof payload !== (stryMutAct_9fa48("81658") ? "" : (stryCov_9fa48("81658"), 'object')))))) || Array.isArray(payload))) {
      if (stryMutAct_9fa48("81659")) {
        {}
      } else {
        stryCov_9fa48("81659");
        return {};
      }
    }
    return stryMutAct_9fa48("81660") ? {} : (stryCov_9fa48("81660"), {
      ...payload
    });
  }
}
function getInvariantDefinition(invariantId) {
  if (stryMutAct_9fa48("81661")) {
    {}
  } else {
    stryCov_9fa48("81661");
    if (stryMutAct_9fa48("81664") ? typeof invariantId !== 'string' && invariantId.length === 0 : stryMutAct_9fa48("81663") ? false : stryMutAct_9fa48("81662") ? true : (stryCov_9fa48("81662", "81663", "81664"), (stryMutAct_9fa48("81666") ? typeof invariantId === 'string' : stryMutAct_9fa48("81665") ? false : (stryCov_9fa48("81665", "81666"), typeof invariantId !== (stryMutAct_9fa48("81667") ? "" : (stryCov_9fa48("81667"), 'string')))) || (stryMutAct_9fa48("81669") ? invariantId.length !== 0 : stryMutAct_9fa48("81668") ? false : (stryCov_9fa48("81668", "81669"), invariantId.length === 0)))) {
      if (stryMutAct_9fa48("81670")) {
        {}
      } else {
        stryCov_9fa48("81670");
        return null;
      }
    }
    return stryMutAct_9fa48("81673") ? INVARIANT_CATALOG[invariantId] && null : stryMutAct_9fa48("81672") ? false : stryMutAct_9fa48("81671") ? true : (stryCov_9fa48("81671", "81672", "81673"), INVARIANT_CATALOG[invariantId] || null);
  }
}
function createInvariantRecord(options = {}) {
  if (stryMutAct_9fa48("81674")) {
    {}
  } else {
    stryCov_9fa48("81674");
    const definition = getInvariantDefinition(options.invariantId);
    if (stryMutAct_9fa48("81677") ? false : stryMutAct_9fa48("81676") ? true : stryMutAct_9fa48("81675") ? definition : (stryCov_9fa48("81675", "81676", "81677"), !definition)) {
      if (stryMutAct_9fa48("81678")) {
        {}
      } else {
        stryCov_9fa48("81678");
        throw new Error(stryMutAct_9fa48("81679") ? `` : (stryCov_9fa48("81679"), `Unknown invariant ID: ${String(stryMutAct_9fa48("81682") ? options.invariantId && '' : stryMutAct_9fa48("81681") ? false : stryMutAct_9fa48("81680") ? true : (stryCov_9fa48("81680", "81681", "81682"), options.invariantId || (stryMutAct_9fa48("81683") ? "Stryker was here!" : (stryCov_9fa48("81683"), ''))))}`));
      }
    }
    return Object.freeze(stryMutAct_9fa48("81684") ? {} : (stryCov_9fa48("81684"), {
      invariantId: definition.id,
      severity: definition.severity,
      scope: (stryMutAct_9fa48("81687") ? typeof options.scope === 'string' || options.scope.length > 0 : stryMutAct_9fa48("81686") ? false : stryMutAct_9fa48("81685") ? true : (stryCov_9fa48("81685", "81686", "81687"), (stryMutAct_9fa48("81689") ? typeof options.scope !== 'string' : stryMutAct_9fa48("81688") ? true : (stryCov_9fa48("81688", "81689"), typeof options.scope === (stryMutAct_9fa48("81690") ? "" : (stryCov_9fa48("81690"), 'string')))) && (stryMutAct_9fa48("81693") ? options.scope.length <= 0 : stryMutAct_9fa48("81692") ? options.scope.length >= 0 : stryMutAct_9fa48("81691") ? true : (stryCov_9fa48("81691", "81692", "81693"), options.scope.length > 0)))) ? options.scope : definition.scope,
      entityId: (stryMutAct_9fa48("81696") ? typeof options.entityId === 'string' || options.entityId.length > 0 : stryMutAct_9fa48("81695") ? false : stryMutAct_9fa48("81694") ? true : (stryCov_9fa48("81694", "81695", "81696"), (stryMutAct_9fa48("81698") ? typeof options.entityId !== 'string' : stryMutAct_9fa48("81697") ? true : (stryCov_9fa48("81697", "81698"), typeof options.entityId === (stryMutAct_9fa48("81699") ? "" : (stryCov_9fa48("81699"), 'string')))) && (stryMutAct_9fa48("81702") ? options.entityId.length <= 0 : stryMutAct_9fa48("81701") ? options.entityId.length >= 0 : stryMutAct_9fa48("81700") ? true : (stryCov_9fa48("81700", "81701", "81702"), options.entityId.length > 0)))) ? options.entityId : null,
      owningSubsystem: (stryMutAct_9fa48("81705") ? typeof options.owningSubsystem === 'string' || options.owningSubsystem.length > 0 : stryMutAct_9fa48("81704") ? false : stryMutAct_9fa48("81703") ? true : (stryCov_9fa48("81703", "81704", "81705"), (stryMutAct_9fa48("81707") ? typeof options.owningSubsystem !== 'string' : stryMutAct_9fa48("81706") ? true : (stryCov_9fa48("81706", "81707"), typeof options.owningSubsystem === (stryMutAct_9fa48("81708") ? "" : (stryCov_9fa48("81708"), 'string')))) && (stryMutAct_9fa48("81711") ? options.owningSubsystem.length <= 0 : stryMutAct_9fa48("81710") ? options.owningSubsystem.length >= 0 : stryMutAct_9fa48("81709") ? true : (stryCov_9fa48("81709", "81710", "81711"), options.owningSubsystem.length > 0)))) ? options.owningSubsystem : definition.owningSubsystem,
      reasonCode: (stryMutAct_9fa48("81714") ? typeof options.reasonCode === 'string' || options.reasonCode.length > 0 : stryMutAct_9fa48("81713") ? false : stryMutAct_9fa48("81712") ? true : (stryCov_9fa48("81712", "81713", "81714"), (stryMutAct_9fa48("81716") ? typeof options.reasonCode !== 'string' : stryMutAct_9fa48("81715") ? true : (stryCov_9fa48("81715", "81716"), typeof options.reasonCode === (stryMutAct_9fa48("81717") ? "" : (stryCov_9fa48("81717"), 'string')))) && (stryMutAct_9fa48("81720") ? options.reasonCode.length <= 0 : stryMutAct_9fa48("81719") ? options.reasonCode.length >= 0 : stryMutAct_9fa48("81718") ? true : (stryCov_9fa48("81718", "81719", "81720"), options.reasonCode.length > 0)))) ? options.reasonCode : definition.defaultReasonCode,
      passed: stryMutAct_9fa48("81723") ? options.passed === false : stryMutAct_9fa48("81722") ? false : stryMutAct_9fa48("81721") ? true : (stryCov_9fa48("81721", "81722", "81723"), options.passed !== (stryMutAct_9fa48("81724") ? true : (stryCov_9fa48("81724"), false))),
      expected: clonePayload(options.expected).condition ? clonePayload(options.expected) : stryMutAct_9fa48("81725") ? {} : (stryCov_9fa48("81725"), {
        ...definition.expected
      }),
      observed: clonePayload(options.observed),
      details: clonePayload(options.details),
      timestampMs: Number.isFinite(options.timestampMs) ? Math.floor(options.timestampMs) : Date.now()
    }));
  }
}
export { INVARIANT_CATALOG, INVARIANT_EVENT, INVARIANT_ID, INVARIANT_SCOPE, INVARIANT_SEVERITY, createInvariantRecord, getInvariantDefinition };
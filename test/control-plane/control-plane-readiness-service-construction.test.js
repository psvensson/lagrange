/**
 * Construction witness for the control-plane readiness service (quest
 * readiness-service-constructor-injection).
 *
 * The service is one class: its named collaborators are validated once, in
 * the constructor, and a missing or malformed collaborator is a typed
 * construction refusal rather than a runtime fallback. The planning answer
 * has one name; the three former names do not exist. Every owner that reads
 * readiness takes the node service as a named collaborator and builds none.
 */
import {test} from '../../src/test-helpers/tap.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ReadOnlySystemTableCache} from '../../src/cache/read-only-system-table-cache.js';
import {
  ControlPlaneReadinessService,
} from '../../src/control-plane/control-plane-readiness-service.js';
import {
  CONTROL_PLANE_READINESS_COLLABORATOR,
  CONTROL_PLANE_READINESS_COLLABORATOR_UNWIRED,
  CONTROL_PLANE_READINESS_ERROR_CODE,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  readWiredCollaborator,
} from '../../src/control-plane/control-plane-readiness-collaborators.js';
import {
  PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE,
} from '../../src/control-plane/startup-authority-snapshot-owner.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {UnifiedRebalancer} from '../../src/rebalancer/unified-rebalancer.js';
import {ReplicaDispatchService} from '../../src/control-plane/replica-dispatch-service.js';
import {StorageAdmissionService} from '../../src/rebalancer/storage-admission-service.js';
import {
  partialReadinessFake,
  readinessCollaboratorFake,
} from '../helpers/readiness-service-fixture.js';

const NODE_ID = 'node-construction-witness';
const OBSERVED_AT_MS = 1000;
const MAX_PROTOTYPE_CHAIN_LENGTH = 2;
const PLANNING_ANSWER_METHOD = 'getPriorityRecoveryPlanningAnswerSync';
const REMOVED_PLANNING_METHODS = Object.freeze([
  'getMembershipPublicationPlanningAnswerSync',
  'getPriorityRecoveryPlanningSnapshotSync',
  'getMembershipPublicationPlanningSnapshotSync',
]);

function completeOptions() {
  return {
    nodeId: NODE_ID,
    systemTableCache: new SystemTableCache(),
    now: () => OBSERVED_AT_MS,
  };
}

function prototypeChainLength(prototype) {
  let length = 0;
  let current = prototype;
  while (current !== Object.prototype) {
    current = Object.getPrototypeOf(current);
    length += 1;
  }
  return length;
}

function assertRefusal(t, options, collaborator, code) {
  t.throws(
    () => new ControlPlaneReadinessService(options),
    {code, collaborator},
    `${collaborator} is refused with ${code}`,
  );
}

test('a missing required collaborator is a typed construction refusal',
  async (t) => {
    const required = [
      CONTROL_PLANE_READINESS_COLLABORATOR.NODE_ID,
      CONTROL_PLANE_READINESS_COLLABORATOR.SYSTEM_TABLE_CACHE,
    ];
    for (const collaborator of required) {
      const absent = completeOptions();
      delete absent[collaborator];
      assertRefusal(t, absent, collaborator,
        CONTROL_PLANE_READINESS_ERROR_CODE.COLLABORATOR_MISSING);
      const nulled = {...completeOptions(), [collaborator]: null};
      assertRefusal(t, nulled, collaborator,
        CONTROL_PLANE_READINESS_ERROR_CODE.COLLABORATOR_MISSING);
    }
    t.throws(
      () => new ControlPlaneReadinessService(),
      {code: CONTROL_PLANE_READINESS_ERROR_CODE.COLLABORATOR_MISSING},
      'no options at all is refused, never a degraded service',
    );
  });

test('a malformed collaborator is a typed construction refusal', async (t) => {
  const malformed = [
    [CONTROL_PLANE_READINESS_COLLABORATOR.NODE_ID, ''],
    [CONTROL_PLANE_READINESS_COLLABORATOR.SYSTEM_TABLE_CACHE, 'cache'],
    [CONTROL_PLANE_READINESS_COLLABORATOR.CLOCK, OBSERVED_AT_MS],
    [CONTROL_PLANE_READINESS_COLLABORATOR.TIME_SOURCE, {}],
    [CONTROL_PLANE_READINESS_COLLABORATOR.INCARNATION_FENCE, true],
    [CONTROL_PLANE_READINESS_COLLABORATOR.SET_TIMEOUT, OBSERVED_AT_MS],
    [CONTROL_PLANE_READINESS_COLLABORATOR.CLEAR_TIMEOUT, 'clear'],
  ];
  for (const [collaborator, value] of malformed) {
    assertRefusal(t, {...completeOptions(), [collaborator]: value},
      collaborator, CONTROL_PLANE_READINESS_ERROR_CODE.COLLABORATOR_INVALID);
  }
});

test('a complete construction is one class with one planning answer',
  async (t) => {
    const service = new ControlPlaneReadinessService(completeOptions());
    t.teardown(() => service.shutdown());
    const prototype = Object.getPrototypeOf(service);
    t.equal(prototype, ControlPlaneReadinessService.prototype,
      'the instance is built by the exported class itself');
    t.ok(prototypeChainLength(prototype) <= MAX_PROTOTYPE_CHAIN_LENGTH,
      'the service prototype reaches Object.prototype within two steps');
    t.equal(typeof service[PLANNING_ANSWER_METHOD], 'function',
      'the one planning answer is a method of the service');
    for (const name of REMOVED_PLANNING_METHODS) {
      t.notOk(name in service, `${name} is deleted, not aliased`);
    }
    t.equal(service.nodeId, NODE_ID, 'the named node identity is kept');
  });

test('every readiness consumer requires the node service and builds none',
  async (t) => {
    const runtime = {
      nodeId: NODE_ID,
      systemTableCache: new SystemTableCache(),
      cdcIntegrationService: {},
      messageRouter: {},
      tablePolicyService: {},
      sqlQueryEngine: {},
    };
    const owners = [
      ['RebalanceCoordinator', () => new RebalanceCoordinator(runtime)],
      // A coordinator carrying a service is not a fallback source: the
      // rebalancer is handed the service by name or refuses.
      ['UnifiedRebalancer',
        () => new UnifiedRebalancer({
          ...runtime,
          entityId: 'partition-witness',
          entityType: 'partition',
          rebalanceCoordinator: {
            controlPlaneReadinessService: partialReadinessFake(),
          },
        })],
      ['ReplicaDispatchService',
        () => new ReplicaDispatchService({
          ...runtime,
          rebalanceCoordinator: {
            controlPlaneReadinessService: partialReadinessFake(),
          },
        })],
      ['StorageAdmissionService',
        () => new StorageAdmissionService({
          nodeId: NODE_ID,
          accountingService: {systemTableCache: runtime.systemTableCache},
        })],
    ];
    for (const [owner, construct] of owners) {
      t.throws(construct, {
        code: CONTROL_PLANE_READINESS_ERROR_CODE.SERVICE_MISSING,
        collaborator: CONTROL_PLANE_READINESS_COLLABORATOR.SERVICE,
        owner,
      }, `${owner} refuses construction without the readiness service`);
    }
  });

const COLLABORATOR = CONTROL_PLANE_READINESS_COLLABORATOR;
const LATE_BOUND_COLLABORATORS = Object.freeze([
  COLLABORATOR.MEMBERSHIP_PUBLICATION,
  COLLABORATOR.NODES_OWNER,
  COLLABORATOR.SERVICES_OWNER,
  COLLABORATOR.MESSAGE_ROUTER,
  COLLABORATOR.HEARTBEAT,
  COLLABORATOR.CDC_GROUP_PROPAGATION,
  COLLABORATOR.STORAGE_ACCOUNTING,
  COLLABORATOR.NODE_LIFECYCLE,
  COLLABORATOR.AUTHORITATIVE_VIEW,
  COLLABORATOR.EVIDENCE_RECONCILER,
]);
const PLANNING_MEMO_KEY = 'memo-witness';

test('a malformed late-bound collaborator is refused at construction',
  async (t) => {
    for (const collaborator of LATE_BOUND_COLLABORATORS) {
      assertRefusal(t, {...completeOptions(), [collaborator]: {}},
        collaborator, CONTROL_PLANE_READINESS_ERROR_CODE.COLLABORATOR_INVALID);
    }
    assertRefusal(t, {...completeOptions(), systemTableCache: {}},
      COLLABORATOR.SYSTEM_TABLE_CACHE,
      CONTROL_PLANE_READINESS_ERROR_CODE.COLLABORATOR_INVALID);
  });

test('every wiring validates what it wires before anything changes',
  async (t) => {
    const service = new ControlPlaneReadinessService(completeOptions());
    t.teardown(() => service.shutdown());
    for (const collaborator of LATE_BOUND_COLLABORATORS) {
      const before = service[collaborator];
      t.throws(
        () => service.syncOwnerDependencies({[collaborator]: {}}),
        {
          code: CONTROL_PLANE_READINESS_ERROR_CODE.COLLABORATOR_INVALID,
          collaborator,
        },
        `a malformed ${collaborator} wiring is refused`,
      );
      t.equal(service[collaborator], before,
        `the refused ${collaborator} wiring changed nothing`);
    }
    t.throws(
      () => service.syncOwnerDependencies({
        heartbeatService: readinessCollaboratorFake('heartbeatService', {}),
        messageRouter: {on() {}},
      }),
      {collaborator: COLLABORATOR.MESSAGE_ROUTER},
      'one malformed collaborator refuses the whole wiring',
    );
    t.equal(service.heartbeatService, null,
      'the valid half of a refused wiring is not applied');
  });

test('a read before wiring answers the named unwired state', async (t) => {
  const service = new ControlPlaneReadinessService(completeOptions());
  t.teardown(() => service.shutdown());
  t.equal(
    readWiredCollaborator(service, COLLABORATOR.MEMBERSHIP_PUBLICATION),
    CONTROL_PLANE_READINESS_COLLABORATOR_UNWIRED,
    'an unwired collaborator reads as the named state, not null');
  t.equal(service.membershipPublicationService, null,
    'the slot itself stays empty for owners that read it by presence');
  t.equal(service.getLatestMembershipPublicationRowSync(NODE_ID), null,
    'no publication row while the publication owner is unwired');
  const health = service.getPriorityControlPlaneRecoveryHealthSync(NODE_ID);
  t.equal(health.healthy, false, 'recovery health is not healthy unwired');
  t.equal(health.details?.failureReason,
    PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.SERVICE_UNAVAILABLE,
    'and names the unwired publication owner as its failure reason');
});

test('a second wiring is the named replacement transition', async (t) => {
  const service = new ControlPlaneReadinessService(completeOptions());
  t.teardown(() => service.shutdown());
  const first = readinessCollaboratorFake(
    COLLABORATOR.MEMBERSHIP_PUBLICATION, {});
  const second = readinessCollaboratorFake(
    COLLABORATOR.MEMBERSHIP_PUBLICATION, {});
  service.syncOwnerDependencies({membershipPublicationService: first});
  service.priorityRecoveryPlanningProjectionMemoByNodeId.set(
    PLANNING_MEMO_KEY, {});
  service.syncOwnerDependencies({membershipPublicationService: first});
  t.ok(service.priorityRecoveryPlanningProjectionMemoByNodeId.has(
    PLANNING_MEMO_KEY), 'wiring the same owner again changes nothing');
  service.syncOwnerDependencies({membershipPublicationService: second});
  t.equal(service.membershipPublicationService, second,
    'a different owner replaces the wired one');
  t.notOk(service.priorityRecoveryPlanningProjectionMemoByNodeId.has(
    PLANNING_MEMO_KEY), 'the replacement clears the memos the previous owner derived');
});

test('the cache apply-change channel is optional, both members or neither',
  async (t) => {
    const writable = new SystemTableCache();
    const readOnly = new ReadOnlySystemTableCache(writable);
    const service = new ControlPlaneReadinessService(completeOptions());
    t.teardown(() => service.shutdown());
    service.syncOwnerDependencies({systemTableCache: readOnly});
    t.equal(service.systemTableCache, readOnly,
      'the joiner read-only cache (no apply-change channel) is wired');
    t.equal(service.cacheApplyChangeListener, null,
      'and no apply-time listener is registered on it');
    const halfChannel = Object.create(writable);
    halfChannel.offCacheApplyChange = undefined;
    t.throws(
      () => service.syncOwnerDependencies({systemTableCache: halfChannel}),
      {
        code: CONTROL_PLANE_READINESS_ERROR_CODE.COLLABORATOR_INVALID,
        collaborator: COLLABORATOR.SYSTEM_TABLE_CACHE,
      },
      'a cache with half the apply-change channel is refused');
  });

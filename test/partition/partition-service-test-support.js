/**
 * Shared test support for PartitionService unit suites.
 *
 * These helpers were previously duplicated verbatim across the
 * partition-service test parts. They are extracted here unchanged so the
 * runnable suites can import a single semantic support module.
 */

import {EventEmitter} from 'node:events';
import {ControllableConsensusPort} from
  '../test-helpers/controllable-consensus-port.js';
import {LIFECYCLE_PHASE} from '../../src/bootstrap/lifecycle-controller-constants.js';
import {
  evaluateLearnerPromotionProof,
} from '../../src/raft/learner-promotion-progress.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {handlerIdentityApi} from
  '../test-helpers/replica-handler-identity-fixture.js';

const PROOF_STUB_TERM = 1;
const PROOF_STUB_COMMITTED_INDEX = 0;
const PROOF_STUB_MATCH_INDEX = 0;

export {
  ControllableConsensusPort,
  applyCommandThroughApplicationOwner,
} from '../test-helpers/controllable-consensus-port.js';

// The test seam for a controllable consensus port. Production construction
// names no implementation; a suite that drives roles and proposals by hand
// subclasses the service and builds its port from the controllable port
// instead.
class ControllablePartitionService extends PartitionService {
  constructor(options, controllablePort) {
    super(options);
    this.controllablePort = controllablePort;
  }

  createOperationPort(request) {
    return this.controllablePort.createOperationPort(request);
  }
}

/**
 * Construct a PartitionService whose operation port the given controllable
 * port builds.
 * @param {Object} options - PartitionService construction options.
 * @param {ControllableConsensusPort} [controllablePort] - The port double.
 * @return {PartitionService} The service.
 */
export function createControllablePartitionService(
  options,
  controllablePort = new ControllableConsensusPort(),
) {
  return new ControllablePartitionService(options, controllablePort);
}

/**
 * Stub ONLY the transport hop of the learner-promotion proof: the
 * leader-side evaluator and the learner-side validator both run for real,
 * so quorum-gate unit tests still exercise the full proof grammar with a
 * trivially caught-up learner (empty committed prefix).
 * @param {Object} partition service under test
 * @return {Promise<void>} resolves when the promotion check completes
 */
export function stubGrantedLearnerPromotionProof(partition) {
  partition.requestLearnerPromotionProofFromLeader = async () => {
    const membershipEpoch =
      partition.resolveLearnerPromotionMembershipEpoch();
    return evaluateLearnerPromotionProof({
      raftIsLeader: true,
      currentTerm: PROOF_STUB_TERM,
      committedIndex: PROOF_STUB_COMMITTED_INDEX,
      learnerMatchIndex: PROOF_STUB_MATCH_INDEX,
      leaderMembershipEpoch: membershipEpoch,
      learnerMembershipEpoch: membershipEpoch,
    });
  };
}

export async function checkLearnerPromotionWithGrantedProof(partition) {
  stubGrantedLearnerPromotionProof(partition);
  await partition.checkLearnerPromotion();
}

export function createLoopbackTransport() {
  const handlers = new Map();
  return {
    register(address, handler) {
      handlers.set(address, handler);
    },
    unregister(address) {
      handlers.delete(address);
    },
    ...handlerIdentityApi(handlers),
    async deliver(address, payload) {
      const handler = handlers.get(address);
      if (!handler) {
        throw new Error(`No handler registered for ${address}`);
      }
      return handler({payload});
    },
  };
}

export async function waitForCondition(
  predicate,
  timeoutMs = 1000,
  intervalMs = 10,
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await Promise.resolve(predicate())) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

export function createTrafficReadinessState() {
  const emitter = new EventEmitter();
  let snapshot = {
    phase: LIFECYCLE_PHASE.INIT,
    ready: false,
    reasons: [],
  };

  return {
    getSnapshot() {
      return {...snapshot};
    },
    on(eventName, listener) {
      emitter.on(eventName, listener);
    },
    off(eventName, listener) {
      emitter.off(eventName, listener);
    },
    transitionTo(phase, options = {}) {
      snapshot = {
        phase,
        ready: options.ready === true,
        reasons: Array.isArray(options.reasons) ? [...options.reasons] : [],
      };
      emitter.emit('transition', {...snapshot});
      return {...snapshot};
    },
  };
}

import {LEDGER_PARTITION_ID} from './partition-placement-admission-decision.js';

class PartitionServiceRebalancerMethods {
  /**
   * Build the dependency bundle the shared coordinator's owners consume from
   * the current PartitionService state (setSqlQueryEngine hands it to
   * RebalanceCoordinator.syncOwnerDependencies).
   *
   * Requirements: 7.1 (explicit dependency bundles)
   * Design: D8.1
   * @return {Object|null} Bundle object, or null when any required
   *   dependency is missing.
   * @private
   */
  buildRebalancerDependencyBundle() {
    const systemTableCache = this.systemTableCache;
    const cdcIntegrationService = this.cdcIntegrationService;
    const tablePolicyService = this.tablePolicyService;
    const messageRouter = this.messageRouter;
    const sqlQueryEngine = this.sqlQueryEngine;
    const rebalanceCoordinator = this.rebalanceCoordinator;
    if (
      !systemTableCache ||
      !cdcIntegrationService ||
      !tablePolicyService ||
      !messageRouter ||
      !sqlQueryEngine ||
      !rebalanceCoordinator
    ) {
      return null;
    }
    return {
      systemTableCache,
      cdcIntegrationService,
      tablePolicyService,
      messageRouter,
      sqlQueryEngine,
      rebalanceCoordinator,
    };
  }

  // The node's one scheduler of partition placement: the placement owner on
  // the replica_operations-p1 replica, attached by the coordinator. Each
  // precondition becomes true only through an event that re-runs this attach:
  // initialize (the replica opened: its database, then its consensus port),
  // setSystemTableCache (cache), setRebalanceCoordinator /
  // rebindCoordinator (coordinator); the coordinator's factory binding attaches
  // every registered ledger still waiting. The attachment, once made, is kept
  // until quiesce: no order attaches twice.
  ensureReplicaPlacementOwnerAttached() {
    if (
      this.partitionId !== LEDGER_PARTITION_ID ||
      this.isShutdown ||
      this.replicaPlacementOwnerAttachment ||
      !this.raft ||
      !this.systemTableCache ||
      !this.rebalanceCoordinator
    ) {
      return;
    }
    this.replicaPlacementOwnerAttachment =
      this.rebalanceCoordinator.attachLedgerReplicaPlacementOwner(this);
  }

  // Every dependency, leadership and readiness event of a partition reaches
  // here. A partition never constructs a scheduler of its own (partition
  // placement is the placement owner's alone): this attaches the ledger's
  // owner and drives the leadership sink.
  maybeInitializeRebalancer() {
    this.ensureReplicaPlacementOwnerAttached();
    this.driveRebalancerLeadershipSink();
  }
}

function createPartitionServiceRebalancerMethods() {
  const methods = {};
  for (const name of Object.getOwnPropertyNames(PartitionServiceRebalancerMethods.prototype)) {
    if (name !== 'constructor') {
      methods[name] = PartitionServiceRebalancerMethods.prototype[name];
    }
  }
  return methods;
}

export {createPartitionServiceRebalancerMethods};

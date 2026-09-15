// The repository's deadlines are its OWNER's time, not the process's.
//
// The defect this seals, traced from the first divergence in a deterministic
// five-node scenario: the incomplete-operation read defers while
// `nextIncompleteOperationSqlRetryAtMs > now`, and `now` was the ambient
// `Date.now()`. A cold process executes the same logical work more slowly
// than a warm one, so the predicate evaluated differently between two runs of
// one seed - one extra authoritative read, 29 extra charged rebalancer
// segments, a virtual instant 3 ms apart, and from there a divergent
// transcript. Host execution speed must not be able to decide which
// authoritative read happens.
//
// The default stays RealTimeSource, so production behaviour is unchanged;
// what changes is that a deterministic owner can supply its own clock.
import {test} from '../../src/test-helpers/tap.js';

import {ReplicaOperationRepository} from
  '../../src/rebalancer/replica-operation-repository.js';

const TEST_NODE_ID = 'node-a';
const RETRY_BACKOFF_MS = 5000;
const START_MS = 1789295948000;

function virtualTimeSource(startMs) {
  let nowMs = startMs;
  return {
    now: () => nowMs,
    advance(deltaMs) {
      nowMs += deltaMs;
    },
    setTimeout: () => null,
    clearTimeout: () => undefined,
    setInterval: () => null,
    clearInterval: () => undefined,
  };
}

function createRepository(timeSource, reads) {
  return new ReplicaOperationRepository({
    nodeId: TEST_NODE_ID,
    timeSource,
    systemTableCache: {get: () => null, getAll: () => [], filter: () => []},
    cdcIntegrationService: {waitForCacheUpdate: async () => {}},
    controlPlaneSystemTableGateway: {
      readAuthoritativeRows: async () => {
        reads.push('authoritative');
        return {success: true, rows: []};
      },
      executeQuery: async () => ({success: true, changes: 1}),
    },
    logger: {info() {}, warn() {}, error() {}, debug() {}},
  });
}

test('the incomplete-read backoff deadline is measured on the owner\'s clock',
  async (t) => {
    const timeSource = virtualTimeSource(START_MS);
    const reads = [];
    const repository = createRepository(timeSource, reads);
    // A backoff already armed on the OWNER's clock, as a retryable failure
    // would leave it.
    repository.nextIncompleteOperationSqlRetryAtMs =
      timeSource.now() + RETRY_BACKOFF_MS;

    await repository.queryIncompleteOperations();
    t.equal(reads.length, 0,
      'below the deadline on the owner clock, no authoritative read happens');

    // Logical time crosses the deadline. Nothing about the host changed.
    timeSource.advance(RETRY_BACKOFF_MS + 1);
    await repository.queryIncompleteOperations();
    t.equal(reads.length, 1,
      'crossing the deadline on the owner clock is what admits the read');
    t.end();
  });

test('MUTATION: reading the ambient clock for that deadline breaks it',
  async (t) => {
    // The falsifier. With the predicate back on ambient time, an owner clock
    // parked below its own deadline no longer defers, because the process
    // clock is years past the virtual instant - which is exactly how host
    // speed reached the decision in the first place.
    const timeSource = virtualTimeSource(START_MS);
    const reads = [];
    const repository = createRepository(timeSource, reads);
    repository.nextIncompleteOperationSqlRetryAtMs =
      timeSource.now() + RETRY_BACKOFF_MS;
    // The mutation, applied as a capability swap rather than a source edit:
    // the repository's clock becomes the ambient one.
    repository.timeSource = {now: () => Date.now()};

    await repository.queryIncompleteOperations();
    t.equal(reads.length, 1,
      'on ambient time the deferral is decided by the process clock, so the ' +
      'owner-clock witness above goes red');
    t.end();
  });

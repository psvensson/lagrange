import fs from 'node:fs';
import {test} from '../../src/test-helpers/tap.js';

const SOURCE = Object.freeze({
  COORDINATOR:
    'src/query/distributed/distributed-transaction-coordinator.js',
  PROTOCOL:
    'src/query/distributed/distributed-transaction-protocol.js',
  RECOVERY:
    'src/query/distributed/distributed-transaction-recovery.js',
  SQL_WRITE: 'src/query/sql-query-engine-write-execution.js',
  TRANSITION:
    'src/rebalancer/operation-workflow-transition-orchestration.js',
  TRANSITION_OPTIONS:
    'src/rebalancer/operation-workflow-owner-execution-lane.js',
  CDC: 'src/cdc/cdc-routed-mutation-readiness.js',
});

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

test('transaction commit mode remains owned after the final participant plan',
  (t) => {
    const coordinator = read(SOURCE.COORDINATOR);
    const protocol = read(SOURCE.PROTOCOL);
    const recovery = read(SOURCE.RECOVERY);
    const sqlWrite = read(SOURCE.SQL_WRITE);
    const transition = read(SOURCE.TRANSITION);
    const transitionOptions = read(SOURCE.TRANSITION_OPTIONS);
    const cdc = read(SOURCE.CDC);
    const ownerPath = [
      coordinator,
      protocol,
      recovery,
      sqlWrite,
      transition,
      transitionOptions,
      cdc,
    ].join('\n');

    t.notMatch(ownerPath, /bypassSingleParticipantSystemWrite/u);
    t.notMatch(transition, /transactionCoordinator/u,
      'rebalancer transition persistence is an independent mutation');
    t.match(transitionOptions, /disableSystemWriteSession: true/u);
    t.match(sqlWrite, /addTransitionMirrorParticipants[\s\S]*openWriteTransaction/u,
      'SQL classifies only after adding the transition mirror');
    t.match(coordinator, /runTransactionOperation/u,
      'session operations use FIFO serialization, not single-flight sharing');
    t.match(coordinator, /buildFrozenTransactionDecision/u);
    t.match(coordinator,
      /Object\.assign\(tx, decision\)[\s\S]*persistTransactionRecord\(tx\)[\s\S]*runCommitProtocol/u,
      'freeze and mode selection persist before protocol dispatch');
    t.match(recovery, /frozenParticipantCount === tx\.participants\.size/u);
    t.match(protocol, /resolveParticipantCommitOutcome/u);
    t.notMatch(sqlWrite, /queryOptions\?\.(transactionMode|commitMode)/u,
      'caller-provided modes do not participate in owner selection');
    t.end();
  });

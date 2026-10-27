// Real native mixed-command application under a selective iterator fault.
// Test input is not a source SQL occurrence; source ledger/ACK proof is separate.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {CDC_OPERATION, TABLES} from '../../src/constants/index.js';
import {HLCTimestamp} from '../../src/hlc/hlc-timestamp.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {isCommittedCdcOutcome} from '../../src/cdc/cdc-delivery-outcome.js';
import {MESSAGE_GROUP_COMMAND_TYPE} from '../../src/message-group/constants.js';
import {replacePrototypeProperty, withHostileIntrinsics} from '../helpers/hostile-intrinsics.js';
import {GROUP_ID, NODE_ID, pump, recipientFixture} from './message-group-native-custody-fixture.js';

const KEY = 'membership-durable';
const ORDINARY_KEY = 'membership-ordinary';

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: NODE_ID}, logging: {level: 'fatal'},
    raft: {heartbeatIntervalMs: 20, electionTimeoutMinMs: 150, electionTimeoutMaxMs: 300}});
  LoggingService.getInstance().initialize({level: 'fatal'});
});
afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

function mixedInput() {
  const timestamp = new HLCTimestamp(1000, 0, 'membership-source').toString();
  return [{tableName: TABLES.CONFIG, operation: CDC_OPERATION.INSERT,
    data: {config_key: KEY, config_value: 'durable-value'}, timestamp,
    sourcePartition: 'membership-config', sourceReplica: 'membership-config-r1',
    eventKey: 'membership-write', entryId: 'membership-write', sourceLogIndex: 5, sourceOrdinal: 0},
  {tableName: TABLES.CONFIG, operation: CDC_OPERATION.INSERT,
    data: {config_key: ORDINARY_KEY, config_value: 'ordinary-value'}, timestamp}];
}

function observeCommittedApplication(t, service, attacked) {
  const original = service.applyCommittedEntry;
  const originalIterator = Array.prototype[Symbol.iterator];
  const observations = [];
  let intercepted = 0;
  let faultInstallations = 0;
  service.applyCommittedEntry = function(committed, lifetime) {
    if (committed.command?.type !== MESSAGE_GROUP_COMMAND_TYPE.CDC_BATCH ||
        committed.command.events[0]?.eventKey !== 'membership-write') {
      return Reflect.apply(original, this, [committed, lifetime]);
    }
    assert.equal(lifetime, this.cdcCommitLifetime, 'native owner passes its actual live lifetime');
    const before = structuredClone(committed.command);
    const replace = () => replacePrototypeProperty(Array.prototype, Symbol.iterator, function() {
      if (this[0]?.eventKey === 'membership-write') {
        intercepted += 1;
        // If the application asks the public iterator, its ordinary sibling
        // disappears. Unrelated scheduler/effect arrays keep their own members.
        return Reflect.apply(originalIterator, [this[0]], []);
      }
      return Reflect.apply(originalIterator, this, []);
    });
    const result = withHostileIntrinsics(attacked ? [replace()] : [], () => {
      if (attacked) {
        faultInstallations += 1;
        const probe = committed.command.events[Symbol.iterator]();
        assert.equal(probe.next().value, committed.command.events[0]);
        assert.equal(probe.next().done, true, 'the installed fault omits the ordinary sibling');
      }
      return Reflect.apply(original, this, [committed, lifetime]);
    });
    assert.deepEqual(committed.command, before, 'instrumentation preserves actual native command');
    observations.push({index: committed.index, term: committed.term, command: before,
      inTransaction: this.db.inTransaction,
      durable: this.systemTableCache.get(TABLES.CONFIG, KEY)?.config_value,
      ordinary: this.systemTableCache.get(TABLES.CONFIG, ORDINARY_KEY)?.config_value});
    return result;
  };
  t.after(() => {
    service.applyCommittedEntry = original;
  });
  return {observations, intercepted: () => intercepted, installed: () => faultInstallations};
}

for (const attacked of [false, true]) {
  test(`native committed batch applies every indexed member with iterator fault=${attacked}`,
    async (t) => {
      const f = await recipientFixture(t, KEY, {replicaCount: 1});
      const service = f.services[0];
      const expected = mixedInput();
      const input = structuredClone(expected);
      const observed = observeCommittedApplication(t, service, attacked);
      let answer;
      let failure;
      let returned = false;
      let stateAtReturn;
      const operation = service.applyCDCBatch(input).then((value) => {
        answer = value;
        returned = true;
        stateAtReturn = {record: RaftRsDurableStore.readDurableRecordIn(service.db, GROUP_ID),
          durable: service.systemTableCache.get(TABLES.CONFIG, KEY)?.config_value,
          ordinary: service.systemTableCache.get(TABLES.CONFIG, ORDINARY_KEY)?.config_value};
      }, (error) => {
        failure = error; returned = true;
      });
      await pump(f);
      assert.equal(returned, true, 'the existing bounded native packet schedule completed');
      await operation;
      assert.equal(failure, undefined, failure?.stack);
      assert.deepEqual(input, expected, 'the complete caller vector remains unchanged');
      assert.equal(observed.observations.length, 1, 'the actual native application was engaged once');
      const applied = observed.observations[0];
      assert.equal(applied.inTransaction, true, 'the observation is inside the real application txn');
      assert.deepEqual(applied.command.events, expected, 'native member order and stamps are exact');
      assert.equal(applied.durable, 'durable-value');
      assert.equal(applied.ordinary, 'ordinary-value', 'ordinary sibling was applied before receipt');
      assert.equal(observed.installed(), attacked ? 1 : 0, 'the selected fault reaches actual apply');
      assert.equal(observed.intercepted(), attacked ? 1 : 0,
        'only the deliberate probe consults the replaced iterator; application uses actual indices');
      assert.equal(isCommittedCdcOutcome(answer, expected, GROUP_ID), true);
      const receipt = answer.cdcCommitted[0];
      assert.equal(answer.cdcCommitted.length, 1);
      assert.equal(BigInt(receipt.logIndex), BigInt(applied.index));
      assert.equal(BigInt(receipt.term), BigInt(applied.term));
      const retained = stateAtReturn.record.entries.find((item) =>
        BigInt(item.index) === BigInt(receipt.logIndex));
      assert.ok(retained, 'actual receipt names retained native history at return');
      assert.deepEqual(JSON.parse(Buffer.from(retained.data, 'base64').toString()), applied.command);
      assert.ok(BigInt(stateAtReturn.record.hardState.commit) >= BigInt(receipt.logIndex));
      assert.ok(BigInt(stateAtReturn.record.appliedIndex) >= BigInt(receipt.logIndex));
      assert.equal(stateAtReturn.durable, 'durable-value');
      assert.equal(stateAtReturn.ordinary, 'ordinary-value');
    });
}

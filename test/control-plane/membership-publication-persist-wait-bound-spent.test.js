/**
 * Spent-wait witness for the publication row write: when every upsert is
 * answered but no readback within PUBLICATION_WRITE_MAX_ATTEMPTS satisfies
 * the desired row, the write logs exactly one wait_bound_spent ERROR and
 * refuses with a retryable unconfirmed result. A write confirmed by its
 * readback logs none.
 */

import {test} from '../../src/test-helpers/tap.js';
import {MembershipPublicationCoordinatorPersist} from
  '../../src/control-plane/membership-publication-coordinator-persist.js';
import {PUBLICATION_WRITE_MAX_ATTEMPTS} from
  '../../src/control-plane/membership-publication-row-contract.js';
import {captureLogger} from '../test-helpers/wait-bound-spent-capture.js';

const PUBLICATION_ROW = Object.freeze({
  publication_id: 'pub-7',
  publication_epoch: 7,
  status: 'pending',
  published_active_node_ids: ['n1', 'n2'],
  required_ack_node_ids: ['n1', 'n2'],
  acknowledged_node_ids: [],
});

function createPersistHost({readback, loseReply = false}) {
  const host = Object.create(MembershipPublicationCoordinatorPersist.prototype);
  const capture = captureLogger();
  const calls = {upserts: 0, reads: 0};
  let stored = null;
  host.logger = capture.logger;
  host.nodeId = 'n1';
  host.buildOwnerKey = () => 'membership-publication-owner';
  host.controlPlanePublicationsOwner = {
    async upsertPublication(row) {
      calls.upserts += 1;
      stored = row;
      if (loseReply) throw Object.assign(new Error('the write reply was lost'), {deferRetry: true});
    },
    async getPublication() {
      calls.reads += 1;
      return readback === 'stored' ? stored : null;
    },
  };
  return {host, capture, calls};
}

test('an unconfirmed publication write logs one wait_bound_spent ERROR and ' +
  'refuses with retryable debt', async (t) => {
  const {host, capture, calls} = createPersistHost({readback: 'never'});

  await t.rejects(host.persistPublicationBirth(PUBLICATION_ROW), {
    code: 'PUBLICATION_WRITE_UNCONFIRMED', deferRetry: true,
  }, 'an untyped write never proves that the desired row persisted');
  t.equal(calls.upserts, PUBLICATION_WRITE_MAX_ATTEMPTS,
    'every attempt is still taken');
  const spent = capture.spent();
  t.equal(spent.length, 1, 'exactly one wait_bound_spent');
  t.equal(spent[0].context.wait, 'PUBLICATION_WRITE_MAX_ATTEMPTS');
  t.equal(spent[0].context.lastObserved.attempts,
    PUBLICATION_WRITE_MAX_ATTEMPTS);
  t.equal(spent[0].context.lastObserved.outcome,
    'durable_publication_unconfirmed');
  t.equal(spent[0].context.scope.publicationId, 'pub-7');
});

test('a publication write confirmed by its readback logs no ' +
  'wait_bound_spent ERROR', async (t) => {
  const {host, capture, calls} = createPersistHost({readback: 'stored'});

  const returned = await host.persistPublicationBirth(PUBLICATION_ROW);

  t.equal(calls.upserts, 1);
  t.equal(returned.publication_id, 'pub-7');
  t.equal(capture.spent().length, 0);
});

test('a lost reply on the final attempt still reads authoritative completion', async (t) => {
  const {host, capture, calls} = createPersistHost({readback: 'stored', loseReply: true});
  const returned = await host.persistPublicationBirth(PUBLICATION_ROW, {
    publicationWriteMaxAttempts: 1, skipPublicationWriteReadback: true,
  });
  t.equal(returned.publication_id, 'pub-7', 'readback confirms the committed row');
  t.same(calls, {upserts: 1, reads: 2}, 'there is no second write attempt');
  t.equal(capture.spent().length, 0);
});

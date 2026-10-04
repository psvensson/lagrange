/**
 * Witnesses of the verifier's liveness findings on the group-retirement
 * re-drive (2026-10-04): every path that ended with no exit, or only a timer,
 * now ends by an event, or stays listed with a visible alarm.
 *
 * L1  the workflow owner restarts with a lone member left: its durable
 *     resume (owner start / record change, ownership claimed on the record)
 *     re-drives it and the record leaves cutover-active.
 * L1b the previous owner's lease is still live at the restart: one re-scan
 *     at the lease's expiry, visible as a WARN when it drives.
 * L2  an aborted teardown + owner restart is resumed the same way.
 * L3  a departed or deleted node re-checks; a deleted member services row
 *     only re-runs the step (owner ruling 2026-10-04: never proof the member
 *     is gone) - the member stays required and listed, nothing completes;
 *     the exhaustion ERROR is logged once across heartbeats and the entry
 *     stays re-drivable.
 * L4  a re-run that returns early arms the fallback with a WARN; the
 *     merge-source, aborted-child and aborted-target lost REMOVEs recover.
 * L5  a replica opened with its record unreadable WARNs once.
 * H-A evidence naming another table's valid record is refused typed.
 * H-B a null target epoch is a malformed record, never epoch 0.
 * F4  the cleanup tombstone row proposes no RemoveNode.
 * F5  NOT_FOUND is not an acknowledgement.
 *
 * Same world as group-retirement-redrive.test.js (real ports, PRODUCTION
 * handlers, reconcile, dissolution/teardown, coordinator, re-drive and
 * resume, the PRODUCTION committed-membership read the member set is frozen
 * from, and - for a restarted owner - the PRODUCTION recovery of its
 * family; injected owner clock).
 * A merge's sibling source is recorded already dissolved, and an aborted
 * split's sibling child was never provisioned - its durable provisioning
 * mark says so (target-provisioning-mark.js) - so it is retired with an
 * empty member set on that fact, never on its unreadable membership.
 */


import {test} from '../../src/test-helpers/tap.js';
import {
  TABLE_ID,
  driveUntilRemoved,
  openGroupWorld,
  readyNodeRow,
} from './group-retirement-as-a-unit-fixture.js';
import {
  assertQuiet,
  drive,
  FENCE,
  install,
  logsOf,
  openOwner,
  recordState,
  retired,
  settle,
  WORKFLOW_ID,
} from './group-retirement-liveness-world.js';

for (const [label, aborted] of [['L1 split source', false],
  ['L2 aborted split child', true]]) {
  test(`${label}: the owner restarts with a lone member left; its durable ` +
    'resume re-drives it and the record leaves its retiring state',
  async (t) => {
    const world = openGroupWorld(t, {partitionId: `live-${aborted ? 'l2' :
      'l1'}`, voters: 3});
    const [, , lone] = world.members;
    const shape = install(world, {aborted});
    const first = await openOwner(world, shape);
    world.dropDeliveryTo.add(lone);
    await drive(first, shape);
    await settle(world);
    t.same(world.exitsOf(lone), [], 'setup: the lone member never retired');
    // The owner process ends; its in-memory re-drive ends with it.
    first.kill();
    world.dropDeliveryTo.delete(lone);
    // The restarted owner recovers the workflow from the durable record
    // through its family's PRODUCTION recovery (no stubbed state).
    const restarted = await openOwner(world, shape, {resume: true,
      recover: true});
    t.equal(await driveUntilRemoved(world, world.members), true,
      'every member completed its removal');
    t.ok(retired(world, lone), 'the lone member retired as group-retired');
    if (aborted) {
      t.equal(world.partitionRows.has(world.partitionId), false,
        'the aborted child\'s row is gone: the record retires nothing more');
    } else {
      t.not(recordState(world), shape.state,
        'the record left cutover-active');
    }
    t.ok(logsOf(restarted, 'warn', /resumed from the durable record/u)
      .length >= 1, 'the resume is visible');
    const metadata = JSON.parse(JSON.stringify(world.deliveries.at(-1)));
    t.ok(metadata.fenceToken > FENCE,
      'it drove on the fence its ownership claim took');
    t.equal(world.scheduler.fired, 0, 'no timer ended it');
    assertQuiet(t, world, label);
  });
}

test('L1b the previous owner\'s lease is still live: one re-scan at its ' +
  'expiry drives it', async (t) => {
  const world = openGroupWorld(t, {partitionId: 'live-l1b', voters: 3});
  const [, , lone] = world.members;
  const shape = install(world);
  const first = await openOwner(world, shape);
  world.dropDeliveryTo.add(lone);
  await drive(first, shape);
  await settle(world);
  first.kill();
  world.dropDeliveryTo.delete(lone);
  // The dead incarnation's live lease, on the durable record.
  const record = world.tablesRows.get(TABLE_ID);
  world.tablesRows.set(TABLE_ID, {...record, partition_transition_metadata:
    JSON.stringify({...JSON.parse(record.partition_transition_metadata),
      workflowOwnerId: 'owner-dead-incarnation',
      workflowLeaseExpiresAt: 50000})});
  const restarted = await openOwner(world, shape, {resume: true,
    recover: true});
  await settle(world);
  t.same(world.exitsOf(lone), [], 'a live foreign lease: nothing drives yet');
  t.equal(world.scheduler.pending().length >= 1, true,
    'one re-scan is armed at the lease expiry');
  restarted.now = () => 60000;
  world.scheduler.fireAll();
  t.equal(await driveUntilRemoved(world, world.members), true,
    'after the lease ended the owner drove it');
  t.ok(retired(world, lone), 'the lone member retired');
  t.ok(logsOf(restarted, 'warn', /resumed from the durable record/u)
    .some((line) => line.fields?.trigger === 'lease-expired'),
  'the lease-expiry resume is a WARN naming its trigger');
});

test('L1c a running owner resumes on the record change that makes it ' +
  'retiring', async (t) => {
  const world = openGroupWorld(t, {partitionId: 'live-l1c', voters: 3});
  const shape = install(world);
  // The cutover epoch is not promoted yet: nothing retires at owner start.
  const promoted = world.tablesRows.get(TABLE_ID);
  world.setTablesRow({...promoted, active_partition_version: 1});
  const owner = await openOwner(world, shape, {resume: true});
  await settle(world, 3);
  t.same(world.deliveries, [], 'setup: nothing driven at owner start');
  // The record changes (the cutover's epoch promotion lands in the view).
  world.setTablesRow(promoted);
  t.equal(await driveUntilRemoved(world, world.members), true,
    'the record change resumed the dissolution');
  t.ok(logsOf(owner, 'warn', /resumed from the durable record/u)
    .some((line) => line.fields?.trigger === 'record-changed'),
  'triggered by the record change');
  t.not(recordState(world), shape.state, 'the record left cutover-active');
});

test('L3 a departed node re-checks; the member\'s deleted services row ' +
  'only re-runs the step - it stays required and listed; exhaustion is one ' +
  'ERROR and stays re-drivable',
async (t) => {
  const world = openGroupWorld(t, {partitionId: 'live-l3', voters: 3});
  const [, away, gone] = world.members;
  const shape = install(world);
  const owner = await openOwner(world, shape);
  world.dropDeliveryTo.add(away).add(gone);
  await drive(owner, shape);
  await settle(world);
  // Exhaust the fallback.
  for (let run = 0; run < 12; run += 1) {
    world.scheduler.fireAll();
    await settle(world, 3);
  }
  t.equal(logsOf(owner, 'error', /exhausted/u).length, 1,
    'exhaustion is one ERROR');
  for (let beat = 0; beat < 5; beat += 1) {
    world.emitNodeRow(readyNodeRow(`${away}-node`));
    await settle(world, 3);
  }
  t.equal(logsOf(owner, 'error', /exhausted/u).length, 1,
    'five more heartbeats log no new ERROR');
  const before = world.deliveries.filter((d) => d.replicaId === gone).length;
  world.emitSystemRow('nodes', 'DELETE', {node_id: `${gone}-node`});
  await settle(world, 3);
  t.ok(world.deliveries.filter((d) => d.replicaId === gone).length > before,
    'a node DELETE re-checks the member');
  t.same(world.exitsOf(gone), [], 'it is never proof the member is gone');
  // The member's services row is deleted (any deleter: its node's cleanup,
  // an absence sweep, a lagging view): never proof the member is gone.
  const row = world.cache.get('services', gone);
  world.cache.delete('services', gone);
  world.emitSystemRow('services', 'DELETE', row);
  await settle(world, 3);
  t.same(owner.groupRetirementRedrive.unacknowledged().map((entry) =>
    [...entry.unacknowledgedReplicaIds].sort()), [[away, gone].sort()],
  'the member whose row was deleted stays required and listed');
  // The exhausted entry is still re-drivable by its node's ready event.
  world.dropDeliveryTo.delete(away);
  world.emitNodeRow(readyNodeRow(`${away}-node`));
  t.equal(await driveUntilRemoved(world, [away]), true,
    'the ready event re-drove the exhausted entry');
  t.ok(retired(world, away), 'it retired');
  t.same(world.terminals, [],
    'nothing completes while the frozen member gone never answered');
  t.ok(world.partitionRows.has(world.partitionId),
    'the group\'s partition row is kept');
  t.equal(recordState(world), shape.state, 'the record stays retiring');
  t.same(owner.groupRetirementRedrive.unacknowledged().map((entry) =>
    entry.unacknowledgedReplicaIds), [[gone]], 'gone is listed with its alarm');
  // Its row comes back (a re-registration, a hydrating view): an address.
  world.dropDeliveryTo.delete(gone);
  world.cache.upsert('services', row);
  world.emitSystemRow('services', 'INSERT', row);
  t.equal(await driveUntilRemoved(world, [gone]), true,
    'the row event re-drove it and it answered');
  t.same(world.terminals, [WORKFLOW_ID],
    'the split completed only after every frozen member answered');
});

test('L4 a re-run that returns early arms the fallback with a WARN',
  async (t) => {
    const world = openGroupWorld(t, {partitionId: 'live-l4', voters: 3});
    const [, away] = world.members;
    const shape = install(world);
    const owner = await openOwner(world, shape);
    world.dropDeliveryTo.add(away);
    const resolve = owner.resolveWorkflowState;
    let calls = 0;
    // The re-run finds no workflow state and returns early.
    owner.resolveWorkflowState = (id) => (++calls > 3 ? null : resolve(id));
    await drive(owner, shape);
    await settle(world);
    t.ok(logsOf(owner, 'warn', /returned without completing/u).some(
      (line) => line.fields?.unacknowledgedReplicaIds?.includes(away) &&
        line.fields?.workflowId === WORKFLOW_ID),
    'a WARN names the workflow and the unacknowledged member');
    t.ok(world.scheduler.pending().length >= 1, 'the fallback is armed');
  });

for (const [label, family, aborted] of [
  ['merge source', 'merge', false],
  ['aborted split child', 'split', true],
  ['aborted merge target', 'merge', true],
]) {
  test(`L4 ${label}: a lost REMOVE recovers end to end`, async (t) => {
    const world = openGroupWorld(t, {partitionId: `live-${family}-${aborted}`,
      voters: 3});
    const [, lost] = world.members;
    const shape = install(world, {family, aborted});
    const owner = await openOwner(world, shape);
    world.loseOnce.add(lost);
    await drive(owner, shape);
    t.equal(await driveUntilRemoved(world, world.members), true,
      'every member completed its removal');
    for (const replicaId of world.members) {
      t.ok(retired(world, replicaId), `${replicaId} retired as a unit`);
    }
    t.ok(world.partitionRowDeletes.includes(world.partitionId),
      'the group\'s partition row is deleted after the last member');
    t.same(owner.groupRetirementRedrive.unacknowledged().filter((entry) =>
      entry.partitionId === world.partitionId), [],
    'nothing of this group left unacknowledged');
    if (family === 'split' && aborted) {
      t.ok(world.partitionRowDeletes.includes(`${world.partitionId}-sib`),
        'the never-provisioned sibling child\'s row is deleted on its ' +
        'durable never-provisioned mark');
      t.same(JSON.parse(world.tablesRows.get(TABLE_ID)
        .partition_transition_metadata).participants['right-child']
        ?.checkpoint, {requiredReplicaIds: [], neverProvisioned: true},
      'its empty member set is frozen with the never-provisioned mark');
      t.same(owner.groupRetirementRedrive.unacknowledged(), [],
        'nothing is left listed');
    }
    t.equal(world.scheduler.fired, 0, 'no fallback fired');
    assertQuiet(t, world, label);
  });
}

test('L5 a replica opened with its record unreadable WARNs once',
  async (t) => {
    const world = openGroupWorld(t, {partitionId: 'live-l5', voters: 3});
    const [, member] = world.members;
    install(world);
    world.authoritativeTablesReadAvailable = false;
    const {handler, service} = world.sources.get(member);
    const warnings = [];
    const logger = handler.logger;
    handler.logger = Object.assign(Object.create(logger), {
      warn(message, fields) {
        if (/without reading its group/u.test(message)) warnings.push(fields);
        return logger.warn(message, fields);
      },
    });
    for (let reopen = 0; reopen < 3; reopen += 1) {
      handler.localReplicas.delete(member);
      handler.localServices.delete(member);
      handler.registerExistingReplica({replicaId: member,
        partitionId: world.partitionId, service});
      await settle(world, 3);
    }
    t.equal(warnings.length, 1, 'one WARN across three unreadable opens');
    t.equal(warnings[0]?.replicaId, member, 'it names the replica');
    t.same(world.exitsOf(member), [], 'it stays un-retired');
  });

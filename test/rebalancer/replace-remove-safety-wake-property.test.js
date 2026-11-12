/**
 * R-2 remove-safety readiness wake: properties from the owner directive
 * (2026-09-25, points 2-5 and 7), not from the implementation (quest
 * replace-source-removal-owner; record quest-records/
 * replace-source-removal-owner/evidence-remove-safety-wake.md), restated
 * 2026-11-11 for the committed-voter floor.
 *
 * W0 no circular wait: a remaining voter (or the replacement) whose node
 *    holds no ready lease but whose replica is a live committed voter - the
 *    lab's system-floor placeholder, a formation joiner behind its barrier -
 *    does not defer the removal at all. Superseded (R09): the 2026-09-25
 *    cells pinned a "below minimum 2/3" deferral on that placeholder.
 * W1 normal path: fallback frozen; the deferring voter recovers and the
 *    readiness owner publishes normally -> the REPLACE owner wakes and
 *    progresses (SAFE -> REMOVE_REPLICA -> STOPPING) with zero fallback
 *    advance.
 * W2 backstop: the publication suppressed -> no progress while frozen;
 *    advancing the fallback recovers progress through the same owner.
 * W3 lost-wakeup race: the level flips around waiter registration (during
 *    the deferring evaluation, with or without a publication that no waiter
 *    yet hears; under an unchanged planning identity, BR1) -> no sleep until
 *    the fallback.
 * W4 no lost edges: a wake into a lane held by another owner turn; a change
 *    during the wake's own run; a fallback fire into a held lane.
 * W5 a wake is not authority: a wake whose floor is still unsafe
 *    re-evaluates and defers with no removal; duplicate and stale wakes
 *    never remove twice.
 * W6 causal refinement: deciding while a relevant change is pending may
 *    WAIT, but never permits an unsafe removal - over every combination of
 *    the remaining voters' profiles: the source is removed iff every
 *    remaining voter is ready or a live committed voter.
 *
 * Every cell runs on both a priority control-plane partition and the
 * operation-ledger partition (replica_operations-p1). The deferring level in
 * W1-W5 is a remaining voter whose process is gone (no ready lease, a silent
 * replica): on a peer the floor defers "below minimum (2/3)"; on the
 * replacement's own node the replacement is "not voter-ready".
 */

import {test} from '../../src/test-helpers/tap.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  READINESS_PROFILE,
  WAKE_NODE,
  WAKE_OPERATION_ID,
  WAKE_PARTITIONS,
  createWakeScenario,
  settleWithoutFallback,
} from './replace-remove-safety-wake-harness.js';

// The fallback period the owner arms (the 1 s backstop), advanced only by
// the backstop cells.
const FALLBACK_ADVANCE_MS = 1_000;
// Nodes whose loss alone defers the removal: the remaining voters after the
// source leaves (a peer, and the owner itself - the replacement's node).
const DEFERRING_NODES = Object.freeze([WAKE_NODE.PEER, WAKE_NODE.OWNER]);
// What the deferral names, by the node whose voter is not live.
const DEFERRAL_BY_NODE = Object.freeze({
  [WAKE_NODE.PEER]: /below minimum \(2\/3\)$/,
  [WAKE_NODE.OWNER]: /replacement replica \S+ is not voter-ready/,
});

async function withScenario(options, body) {
  const scenario = createWakeScenario(options);
  try {
    return await body(scenario);
  } finally {
    await scenario.coordinator.shutdown();
  }
}

// The deferring level: the node's process is gone (no ready lease, and its
// replica does not answer for itself).
function deferredOn(nodeId) {
  return {[nodeId]: READINESS_PROFILE.UNSAFE};
}

async function readProgress(scenario) {
  return {
    step: await scenario.readStep(),
    removals: scenario.removals.length,
    fallbackAdvanceMs: scenario.clock.now() - scenario.startMs,
  };
}

const PROGRESSED = Object.freeze({
  step: WORKFLOW_STEP.STOPPING,
  removals: 1,
  fallbackAdvanceMs: 0,
});
// After the fallback clock moved, the STOPPING step's own re-drive may send
// the source removal again (idempotent); what matters is that the owner left
// ACTIVE by removing its source.
const REMOVAL_PROGRESSED = Object.freeze({
  step: WORKFLOW_STEP.STOPPING,
  removedSource: true,
  removedOther: false,
});

async function readRemovalProgress(scenario) {
  const sourceReplicaId = `${scenario.partitionId}-r1`;
  return {
    step: await scenario.readStep(),
    removedSource: scenario.removals.some((removal) =>
      removal.replicaId === sourceReplicaId),
    removedOther: scenario.removals.some((removal) =>
      removal.replicaId !== sourceReplicaId),
  };
}

const HELD = Object.freeze({
  step: WORKFLOW_STEP.ACTIVE,
  removals: 0,
  fallbackAdvanceMs: 0,
});

/**
 * Run the owner's EXECUTE and require the floor's deferral on the voter that
 * is not live.
 * @param {Object} t
 * @param {Object} scenario
 * @param {string} deferringNode
 */
async function executeAndRequireDeferral(t, scenario, deferringNode) {
  const result = await scenario.execute();
  t.same(
    {skipped: result?.skipped === true, removals: scenario.removals.length},
    {skipped: true, removals: 0},
    'the owner defers on the voter that is not live and removes nothing',
  );
  t.match(String(result?.error), DEFERRAL_BY_NODE[deferringNode],
    'the deferral names the missing voter fact');
}

function forEachCell(body) {
  for (const partitionId of WAKE_PARTITIONS) {
    for (const deferringNode of DEFERRING_NODES) {
      body(partitionId, deferringNode);
    }
  }
}

// ---------------------------------------------------------------------------
// W0 no circular wait: a live committed voter on a node without a ready
// lease is credited, so the placeholder never defers the removal.
// ---------------------------------------------------------------------------

forEachCell((partitionId, placeholderNode) => {
  test(`W0 no circular wait (${partitionId}, placeholder on ` +
    `${placeholderNode}): the removal proceeds on committed-voter evidence ` +
    'with no wake and zero fallback advance', async (t) => {
    await withScenario({
      partitionId,
      profiles: {[placeholderNode]: READINESS_PROFILE.SYSTEM_FLOOR},
    }, async (scenario) => {
      const result = await scenario.execute();
      t.same(
        {skipped: result?.skipped === true, error: result?.error ?? null},
        {skipped: false, error: null},
        'no deferral on a node whose ready lease is withheld',
      );
      t.same(await readProgress(scenario), PROGRESSED,
        'SAFE -> REMOVE_REPLICA -> STOPPING at once');
      t.same(scenario.removals[0]?.replicaId, `${partitionId}-r1`,
        'the removal is the REPLACE source');
      t.ok(scenario.group.reads.includes(`${partitionId}-r4`),
        'the group answered for itself (the credit is not a row)');
    });
  });
});

// ---------------------------------------------------------------------------
// W1 normal path and W2 backstop.
// ---------------------------------------------------------------------------

forEachCell((partitionId, deferringNode) => {
  test(`W1 normal path (${partitionId}, placeholder on ${deferringNode}): ` +
    'the readiness publication wakes the owner with zero fallback advance',
  async (t) => {
    await withScenario({partitionId, profiles: deferredOn(deferringNode)},
      async (scenario) => {
        await executeAndRequireDeferral(t, scenario, deferringNode);
        await settleWithoutFallback();
        t.same(await readProgress(scenario), HELD,
          'no progress before readiness changes (no other wake source)');
        scenario.readiness.setProfile(deferringNode, READINESS_PROFILE.READY);
        await scenario.readiness.publish(deferringNode);
        await settleWithoutFallback();
        t.same(await readProgress(scenario), PROGRESSED,
          'SAFE -> REMOVE_REPLICA -> STOPPING, fallback never advanced');
        t.same(scenario.removals[0]?.replicaId, `${partitionId}-r1`,
          'the removal is the REPLACE source');
      });
  });

  test(`W2 backstop (${partitionId}, placeholder on ${deferringNode}): ` +
    'with the publication suppressed the fallback recovers progress',
  async (t) => {
    await withScenario({partitionId, profiles: deferredOn(deferringNode)},
      async (scenario) => {
        await executeAndRequireDeferral(t, scenario, deferringNode);
        scenario.readiness.setProfile(deferringNode, READINESS_PROFILE.READY);
        await settleWithoutFallback();
        t.same(await readProgress(scenario), HELD,
          'no publication, clock frozen: the owner still waits');
        await scenario.clock.advance(FALLBACK_ADVANCE_MS);
        await settleWithoutFallback();
        t.same(await readRemovalProgress(scenario), REMOVAL_PROGRESSED,
          'the fallback re-drives the same owner to STOPPING');
      });
  });
});

for (const partitionId of WAKE_PARTITIONS) {
  test(`W2 backstop, group evidence only (${partitionId}): a silent voter ` +
    'on a node without a ready lease defers; when the voter answers again ' +
    '(no readiness level changes, nothing is published) the fallback ' +
    'recovers progress', async (t) => {
    await withScenario({
      partitionId,
      profiles: {[WAKE_NODE.PEER]: READINESS_PROFILE.SYSTEM_FLOOR},
    }, async (scenario) => {
      const peerReplicaId = `${partitionId}-r2`;
      scenario.silencedReplicaIds.add(peerReplicaId);
      await executeAndRequireDeferral(t, scenario, WAKE_NODE.PEER);
      scenario.silencedReplicaIds.delete(peerReplicaId);
      await settleWithoutFallback();
      t.same(await readProgress(scenario), HELD,
        'no level changed and nothing was published: the owner still waits');
      await scenario.clock.advance(FALLBACK_ADVANCE_MS);
      await settleWithoutFallback();
      t.same(await readRemovalProgress(scenario), REMOVAL_PROGRESSED,
        'the fallback re-evaluates the group and re-drives the owner');
    });
  });
}

// ---------------------------------------------------------------------------
// W3 lost-wakeup race around waiter registration.
// ---------------------------------------------------------------------------

/**
 * Flip the deferring node to READY while the deferring evaluation runs:
 * after the owner has read readiness (the evaluation already returned its
 * DEFER) and before the waiter is registered.
 * @param {Object} scenario
 * @param {string} nodeId
 * @param {Object} options - {publish: 'none'|'sync_unheard'|'after'}
 */
function flipDuringEvaluation(scenario, nodeId, options) {
  const owner = scenario.owner;
  const evaluate = owner.evaluateRemoveSafety.bind(owner);
  let flipped = false;
  owner.evaluateRemoveSafety = async (operation) => {
    const evaluation = await evaluate(operation);
    if (!flipped) {
      flipped = true;
      scenario.readiness.setProfile(nodeId, READINESS_PROFILE.READY);
      if (options.publish === 'sync_unheard') {
        // Emitted before any waiter exists: nobody may be listening yet.
        scenario.readiness.publishNow(nodeId);
      }
    }
    return evaluation;
  };
}

const RACE_PUBLICATIONS = Object.freeze(['none', 'sync_unheard']);

forEachCell((partitionId, deferringNode) => {
  for (const publish of RACE_PUBLICATIONS) {
    test(`W3 lost wakeup (${partitionId}, ${deferringNode}, publication ` +
      `${publish}): a flip inside the deferring evaluation does not sleep ` +
      'until the fallback', async (t) => {
      await withScenario({partitionId, profiles: deferredOn(deferringNode)},
        async (scenario) => {
          flipDuringEvaluation(scenario, deferringNode, {publish});
          await scenario.execute();
          await settleWithoutFallback();
          t.same(await readProgress(scenario), PROGRESSED,
            'the level recheck after registration wakes the owner');
        });
    });
  }

  test(`W3 BR1 (${partitionId}, ${deferringNode}): a republication under an ` +
    'unchanged planning identity that finally carries the flip still wakes',
  async (t) => {
    await withScenario({partitionId, profiles: deferredOn(deferringNode)},
      async (scenario) => {
        await executeAndRequireDeferral(t, scenario, deferringNode);
        // Same identity, level still the placeholder: a no-op wake.
        await scenario.readiness.publish(deferringNode);
        await settleWithoutFallback();
        t.same(await readProgress(scenario), HELD,
          'an unchanged level does not progress');
        scenario.readiness.setProfile(deferringNode, READINESS_PROFILE.READY);
        await scenario.readiness.publish(deferringNode);
        await settleWithoutFallback();
        t.same(await readProgress(scenario), PROGRESSED,
          'the same-identity publication carrying the flip wakes the owner');
      });
  });
});

// ---------------------------------------------------------------------------
// W4 no lost edges.
// ---------------------------------------------------------------------------

/**
 * Hold the REPLACE's owner lane exactly as checkTimeouts, the orphan
 * reconcile and the target-progress re-entry take it (the operation's
 * single-flight owner key), until release() is called.
 * @param {Object} scenario
 * @return {{release: Function, done: Promise}}
 */
function holdOwnerLane(scenario) {
  let release = null;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const done = scenario.owner.operationWorkflowRunExclusive(
    scenario.owner.getOperationOwnerSingleFlightKey(WAKE_OPERATION_ID),
    () => gate,
  );
  return {release, done};
}

forEachCell((partitionId, deferringNode) => {
  test(`W4 held lane (${partitionId}, ${deferringNode}): a wake that finds ` +
    'the owner lane held runs when the holder releases', async (t) => {
    await withScenario({partitionId, profiles: deferredOn(deferringNode)},
      async (scenario) => {
        await executeAndRequireDeferral(t, scenario, deferringNode);
        const holder = holdOwnerLane(scenario);
        scenario.readiness.setProfile(deferringNode, READINESS_PROFILE.READY);
        await scenario.readiness.publish(deferringNode);
        await settleWithoutFallback();
        t.same(await readProgress(scenario), HELD,
          'nothing runs while the lane is held');
        holder.release();
        await holder.done;
        await settleWithoutFallback();
        t.same(await readProgress(scenario), PROGRESSED,
          'the wake edge survives the held lane, no fallback advance');
      });
  });

  test(`W4 fallback into a held lane (${partitionId}, ${deferringNode}): ` +
    'the backstop fire is not dropped by a lane holder', async (t) => {
    await withScenario({partitionId, profiles: deferredOn(deferringNode)},
      async (scenario) => {
        await executeAndRequireDeferral(t, scenario, deferringNode);
        scenario.readiness.setProfile(deferringNode, READINESS_PROFILE.READY);
        const holder = holdOwnerLane(scenario);
        await scenario.clock.advance(FALLBACK_ADVANCE_MS);
        await settleWithoutFallback();
        holder.release();
        await holder.done;
        await settleWithoutFallback();
        t.same(await readRemovalProgress(scenario), REMOVAL_PROGRESSED,
          'the fire that met the held lane still re-drives the owner');
      });
  });
});

for (const partitionId of WAKE_PARTITIONS) {
  test(`W4 change during the wake's own run (${partitionId}): the second ` +
    'flip lands inside the woken evaluation and still wakes', async (t) => {
    await withScenario({
      partitionId,
      profiles: {
        [WAKE_NODE.PEER]: READINESS_PROFILE.UNSAFE,
        [WAKE_NODE.OWNER]: READINESS_PROFILE.UNSAFE,
      },
    }, async (scenario) => {
      await executeAndRequireDeferral(t, scenario, WAKE_NODE.OWNER);
      const owner = scenario.owner;
      const evaluate = owner.evaluateRemoveSafety.bind(owner);
      let wokenRuns = 0;
      owner.evaluateRemoveSafety = async (operation) => {
        const evaluation = await evaluate(operation);
        wokenRuns++;
        if (wokenRuns === 1) {
          // Inside the woken run, after its readiness reads: no publication.
          scenario.readiness.setProfile(
            WAKE_NODE.OWNER,
            READINESS_PROFILE.READY,
          );
        }
        return evaluation;
      };
      scenario.readiness.setProfile(WAKE_NODE.PEER, READINESS_PROFILE.READY);
      await scenario.readiness.publish(WAKE_NODE.PEER);
      await settleWithoutFallback();
      t.same(await readProgress(scenario), PROGRESSED,
        'the dirty level after the run re-runs the owner');
      t.ok(wokenRuns >= 2, 'the owner evaluated again after the woken run');
    });
  });
}

// ---------------------------------------------------------------------------
// W5 a wake is not authority.
// ---------------------------------------------------------------------------

forEachCell((partitionId, deferringNode) => {
  test(`W5 unsafe wake (${partitionId}, ${deferringNode}): a wake whose ` +
    'readiness is still unsafe re-evaluates and defers, never removes',
  async (t) => {
    await withScenario({partitionId, profiles: deferredOn(deferringNode)},
      async (scenario) => {
        await executeAndRequireDeferral(t, scenario, deferringNode);
        const owner = scenario.owner;
        const evaluate = owner.evaluateRemoveSafety.bind(owner);
        let evaluations = 0;
        owner.evaluateRemoveSafety = async (operation) => {
          evaluations++;
          return evaluate(operation);
        };
        // A remove-safety level changes (a wake is due) but the answer
        // stays unsafe: another remaining voter turns substantively unready.
        scenario.readiness.setProfile(
          WAKE_NODE.SECOND_PEER,
          READINESS_PROFILE.UNSAFE,
        );
        await scenario.readiness.publish(WAKE_NODE.SECOND_PEER);
        await settleWithoutFallback();
        t.same(await readProgress(scenario), HELD, 'no removal after the wake');
        t.ok(evaluations >= 1, 'the wake re-evaluated from authority');
        // Now the deferring node recovers while the other stays unsafe.
        scenario.readiness.setProfile(deferringNode, READINESS_PROFILE.READY);
        await scenario.readiness.publish(deferringNode);
        await scenario.readiness.publish(deferringNode);
        await settleWithoutFallback();
        t.same(await readProgress(scenario), HELD,
          'repeated wakes on a still-unsafe floor never remove');
      });
  });

  test(`W5 duplicate and stale wakes (${partitionId}, ${deferringNode}): ` +
    'one removal only', async (t) => {
    await withScenario({partitionId, profiles: deferredOn(deferringNode)},
      async (scenario) => {
        await executeAndRequireDeferral(t, scenario, deferringNode);
        scenario.readiness.setProfile(deferringNode, READINESS_PROFILE.READY);
        await Promise.all([
          scenario.readiness.publish(deferringNode),
          scenario.readiness.publish(deferringNode),
          scenario.readiness.publish(WAKE_NODE.SOURCE),
        ]);
        await settleWithoutFallback();
        t.same(await readProgress(scenario), PROGRESSED, 'progressed once');
        // Stale wakes after the operation left the deferral, including a
        // level change on a registered node.
        scenario.readiness.setProfile(
          WAKE_NODE.SECOND_PEER,
          READINESS_PROFILE.SYSTEM_FLOOR,
        );
        await scenario.readiness.publish(deferringNode);
        await scenario.readiness.publish(WAKE_NODE.SECOND_PEER);
        await settleWithoutFallback();
        t.same(await readProgress(scenario), PROGRESSED,
          'stale wakes never issue a second removal');
      });
  });
});

// ---------------------------------------------------------------------------
// W6 causal refinement: a pending readiness change may WAIT, never permit an
// unsafe removal. Every combination of the remaining voters' profiles.
// ---------------------------------------------------------------------------

const REMAINING_VOTERS = Object.freeze([
  WAKE_NODE.PEER,
  WAKE_NODE.SECOND_PEER,
  WAKE_NODE.OWNER,
]);

function enumerateProfileCombinations() {
  return REMAINING_VOTERS.reduce(
    (partials, nodeId) => partials.flatMap((partial) =>
      Object.values(READINESS_PROFILE).map((profile) =>
        ({...partial, [nodeId]: profile}))),
    [{}],
  );
}

for (const partitionId of WAKE_PARTITIONS) {
  test(`W6 (${partitionId}): the owner removes the source if and only if ` +
    'every remaining voter is ready or a live committed voter (the ' +
    'placeholder); one whose process is gone withholds it, with or without ' +
    'a wake', async (t) => {
    const violations = [];
    const combinations = enumerateProfileCombinations();
    for (const profiles of combinations) {
      const allLive = Object.values(profiles)
        .every((profile) => profile !== READINESS_PROFILE.UNSAFE);
      await withScenario({partitionId, profiles}, async (scenario) => {
        await scenario.execute();
        for (const nodeId of REMAINING_VOTERS) {
          await scenario.readiness.publish(nodeId);
        }
        await settleWithoutFallback();
        const progress = await readProgress(scenario);
        const removed = progress.removals > 0;
        if (removed !== allLive) {
          violations.push({profiles, progress});
        }
      });
    }
    t.same(violations, [], 'removal iff every remaining voter is live');
    t.equal(
      combinations.length,
      Object.values(READINESS_PROFILE).length ** REMAINING_VOTERS.length,
      'every profile combination ran',
    );
  });

  test(`W7 (${partitionId}): adverse readiness change during SAFE evaluation ` +
    'is caught by admitReplaceSourceRemovalEffect against the pre-evaluation ' +
    'readinessEntryLevel and withholds REMOVE_REPLICA', async (t) => {
    await withScenario({partitionId, profiles: {}}, async (scenario) => {
      const originalOwnerRead = scenario.readiness
        .getPriorityRecoveryPlanningAnswerForOwnerRead.bind(scenario.readiness);
      scenario.readiness.getPriorityRecoveryPlanningAnswerForOwnerRead =
        async (...args) => {
          const answer = await originalOwnerRead(...args);
          // After the initial floor check has already credited WAKE_NODE.PEER,
          // WAKE_NODE.PEER degrades during the async planning check.
          scenario.readiness.setProfile(WAKE_NODE.PEER, READINESS_PROFILE.UNSAFE);
          return answer;
        };
      const result = await scenario.execute();
      t.equal(Boolean(result?.skipped), true,
        'adverse change after floor read must withhold immediate send');
      t.equal(result?.deferReason, 'effect_revalidation_inputs_moved',
        'admitReplaceSourceRemovalEffect rejects the stale SAFE evaluation');
      t.equal(await scenario.readStep(), WORKFLOW_STEP.ACTIVE,
        'STOPPING intent is not persisted when inputs moved during evaluation');
      await settleWithoutFallback();
      t.equal(scenario.removals.length, 0,
        'redriven evaluation sees the degraded peer and never sends REMOVE_REPLICA');
    });
  });

  test(`W7 (${partitionId}): improving owner-read refresh during evaluation ` +
    'withholds the stale-baseline send at revalidation and progresses on the ' +
    'immediate wake redrive without fallback advance', async (t) => {
    await withScenario({
      partitionId,
      profiles: {[WAKE_NODE.SOURCE]: READINESS_PROFILE.SYSTEM_FLOOR},
    }, async (scenario) => {
      const originalOwnerRead = scenario.readiness
        .getPriorityRecoveryPlanningAnswerForOwnerRead.bind(scenario.readiness);
      scenario.readiness.getPriorityRecoveryPlanningAnswerForOwnerRead =
        async (...args) => {
          scenario.readiness.setProfile(WAKE_NODE.SOURCE, READINESS_PROFILE.READY);
          return originalOwnerRead(...args);
        };
      const result = await scenario.execute();
      t.equal(Boolean(result?.skipped), true,
        'changed level during evaluation withholds immediate send at revalidation');
      t.equal(result?.deferReason, 'effect_revalidation_inputs_moved',
        'admitReplaceSourceRemovalEffect catches the level change on run 1');
      await settleWithoutFallback();
      t.same(await readProgress(scenario), PROGRESSED,
        'subscribe-before-recheck redrives immediately and sends REMOVE_REPLICA');
    });
  });
}

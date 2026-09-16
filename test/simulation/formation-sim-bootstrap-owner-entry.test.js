// The seed phases enter production's own bootstrap owner, and the boundary is
// what makes that true.
//
// A phase is production's work. Production already owns the boundary it is
// entered through: StartupPipelineRunner.run() is the single place where
// runBootstrapActivity wraps a phase. Calling the phase objects directly ran
// exactly the same work one level BELOW that boundary, so every bootstrap
// continuation in the measured cone was unowned - not because production
// forgot a boundary, but because the cone entered underneath it.
//
// The mutation is the old shape: a pipeline runner that invokes phase.run()
// itself. It must remove the bootstrap OWNERSHIP while leaving the runtime
// population, the topology and the production effects exactly as they were.
// That is what proves the runner boundary matters specifically for
// attribution, and nothing else.
import {test} from '../../src/test-helpers/tap.js';
import {FORMATION_OWNER} from
  '../../src/diagnostics/formation-diagnostics-contract.js';
import {
  FormationTurnAttribution,
} from '../../src/diagnostics/formation-turn-attribution.js';
import {
  runSeedMessageGroupsScenario,
} from './formation-sim-production-seed-host.js';

const ZERO = 0;
const EXPECTED_PHASES = 2;
const SEED_HOST_URL = new URL(
  './formation-sim-production-seed-host.js', import.meta.url);
const PIPELINE_RUNNER_URL = new URL(
  '../../src/bootstrap/pipeline/startup-pipeline-runner.js', import.meta.url);

// Every explicit owner entry and handoff made while the window is open. The
// accounting owner records neither a dispatch nor a handoff for an entry made
// from a neutral parent, so the entry has to be observed, not inferred.
function observeOwnerEntries() {
  const owners = [];
  const realRun = FormationTurnAttribution.prototype.run;
  FormationTurnAttribution.prototype.run = function(owner, callback) {
    owners.push(owner);
    return realRun.call(this, owner, callback);
  };
  return {
    owners,
    restore() {
      FormationTurnAttribution.prototype.run = realRun;
    },
  };
}

async function measure(runScenario) {
  const attribution = new FormationTurnAttribution();
  const observed = observeOwnerEntries();
  attribution.start();
  let run = null;
  try {
    run = await runScenario();
  } finally {
    observed.restore();
    attribution.stop();
  }
  return {
    bootstrapEntries: observed.owners
      .filter((owner) => owner === FORMATION_OWNER.BOOTSTRAP).length,
    replicaCount: run.host.bootstrap.messageGroupServices.size,
    transcript: run.hostTranscript,
    strictReport: run.strictReport,
    pendingEventCount: run.pendingEventCount,
  };
}

test('the seed phases enter the production bootstrap owner, and reverting the runner boundary removes only that',
  async (t) => {
    const current = await measure(runSeedMessageGroupsScenario);
    t.equal(current.bootstrapEntries, EXPECTED_PHASES,
      'each seed phase the host runs crosses the production bootstrap entry');
    t.equal(current.strictReport,
      'mode=strict violations=0 substitutions=0 eligible=true ledger=0',
      'the deterministic substrate is untouched by the boundary');
    t.equal(current.pendingEventCount, ZERO,
      'teardown still reaches zero pending work');

    // The mutation: the pipeline runner without its owner entry.
    let directRuns = ZERO;
    class DirectPhaseRunner {
      async run(options = {}) {
        const phases = Array.isArray(options.phases) ? options.phases : [];
        const completedPhases = [];
        for (const phase of phases) {
          directRuns += 1;
          await phase.run();
          completedPhases.push(phase.name);
        }
        return {completedPhases};
      }
    }
    const loaded = await t.mockImport(SEED_HOST_URL.href, {
      [PIPELINE_RUNNER_URL.href]: {StartupPipelineRunner: DirectPhaseRunner},
    });
    const reverted = await measure(loaded.runSeedMessageGroupsScenario);

    // Mutation integrity first: an unsubstituted runner would leave this at
    // zero and every claim below would be measuring the unmutated path.
    t.equal(directRuns, EXPECTED_PHASES,
      'the reverted runner is the one the host used for both phases');

    t.equal(reverted.bootstrapEntries, ZERO,
      'without the runner boundary the bootstrap owner is never entered');
    t.equal(reverted.replicaCount, current.replicaCount,
      'the same production message-group runtimes exist either way');
    t.equal(reverted.transcript, current.transcript,
      'and the same production boundaries happen in the same causal order');
    t.equal(reverted.strictReport, current.strictReport,
      'the substrate is identical in both arms');
    t.equal(reverted.pendingEventCount, ZERO,
      'teardown reaches zero pending work in both arms');
    t.end();
  });

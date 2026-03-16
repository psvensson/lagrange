import {runPostgresBaseline} from './run-postgres-baseline.js';
import {runLagrangeDemo} from './run-lagrange-demo.js';

function parseArgs(argv) {
  const args = new Set(argv);
  return {
    noStart: args.has('--no-start'),
    target: process.env.LAGRANGE_TARGET,
    dataDir: process.env.LAGRANGE_DATA_DIR,
  };
}

function buildComparison(baseline, lagrange) {
  const baselineQueryMs = Number(baseline?.queryDurationMs || 0);
  const lagrangeCallbackMs = Number(lagrange?.callbackDurationMs || 0);
  const speedup =
    baselineQueryMs > 0 && lagrangeCallbackMs > 0 ?
      baselineQueryMs / lagrangeCallbackMs :
      null;
  return {
    baselineQueryMs,
    lagrangeCallbackMs,
    speedup,
  };
}

async function runComparison() {
  const options = parseArgs(process.argv.slice(2));
  const baseline = await runPostgresBaseline();
  const lagrange = await runLagrangeDemo({
    noStart: options.noStart,
    target: options.target,
    dataDir: options.dataDir,
  });
  const comparison = buildComparison(baseline, lagrange);
  return {baseline, lagrange, comparison};
}

if (process.argv[1]?.includes('run-comparison.js')) {
  runComparison()
    .then((payload) => {
      console.log('MovieLens baseline vs Lagrange comparison:');
      console.log(JSON.stringify(payload, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

export {runComparison};

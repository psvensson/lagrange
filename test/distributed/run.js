/**
 * CLI runner for the distributed testing framework.
 *
 * Usage:
 *   node test/distributed/run.js --config local.json
 *   node test/distributed/run.js --config local.json --scenario node-failure
 *   node test/distributed/run.js --config gcp-small.json --output results.json
 *
 * Requirements: 9.3, 9.4, 9.5, 9.6, 12.1
 */

import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {parseConfig} from './harness/config-parser.js';
import {
  discoverScenarios,
  filterScenarios,
} from './harness/scenario-discovery.js';
import {createCluster} from './harness/cluster.js';
import {DockerProvider} from './harness/docker-provider.js';
import {ReportWriter} from './harness/report-writer.js';
import {CLI, EXIT_CODES} from './harness/constants.js';

/**
 * Parse CLI arguments from argv.
 * @param {Array<string>} argv - process.argv.slice(2)
 * @returns {{config: string, scenario: string|null,
 *   output: string, verbose: boolean}}
 */
function parseArgs(argv) {
  let config = CLI.DEFAULT_CONFIG;
  let scenario = null;
  let output = CLI.DEFAULT_OUTPUT;
  let verbose = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === CLI.ARG_CONFIG && i + 1 < argv.length) {
      config = argv[++i];
    } else if (arg === CLI.ARG_SCENARIO && i + 1 < argv.length) {
      scenario = argv[++i];
    } else if (arg === CLI.ARG_OUTPUT && i + 1 < argv.length) {
      output = argv[++i];
    } else if (arg === CLI.ARG_VERBOSE) {
      verbose = true;
    }
  }

  return {config, scenario, output, verbose};
}

/**
 * Build the Docker image before running scenarios.
 * @param {Object} config - Parsed cluster configuration
 * @param {boolean} verbose
 */
async function buildImage(config, verbose) {
  const provider = new DockerProvider({
    socketPath: config.docker.socketPath,
  });
  if (verbose) {
    process.stdout.write('Building Docker image...\n');
  }
  await provider.buildImage({
    tag: config.image,
    dockerfile: config.dockerfile || 'Dockerfile',
    context: '.',
  });
  if (verbose) {
    process.stdout.write('Image built: ' + config.image + '\n');
  }
}

/**
 * Run discovered scenarios sequentially.
 * Each scenario runs in isolation: createCluster → run → teardown.
 * Unhandled errors are caught, marked failed, and execution continues.
 *
 * @param {Object} config - Parsed cluster configuration
 * @param {Array<{name: string, path: string}>} scenarios
 * @param {{output: string, verbose: boolean}} options
 * @returns {Promise<{report: ReportWriter, hasFailures: boolean}>}
 */
async function runScenarios(config, scenarios, options) {
  const report = new ReportWriter(options.output);
  let hasFailures = false;

  for (const scenario of scenarios) {
    const startedAt = new Date().toISOString();
    const startMs = Date.now();

    if (options.verbose) {
      process.stdout.write(
        'Running scenario: ' + scenario.name + '\n'
      );
    }

    let cluster = null;
    try {
      cluster = createCluster(config);
      await cluster.start();

      const scenarioModule = await import(scenario.path);
      await scenarioModule.run(cluster);

      // Run log analysis before teardown
      const analyzer = cluster.getLogAnalyzer();
      const collector = cluster.getLogCollector();
      let analysisSummary = null;
      try {
        const seedNode = cluster.getNodes()[0];
        const queryResults =
          await analyzer.runAnalyticalQueries(seedNode);
        const logEntries = collector.getBuffer();
        const analysis = analyzer.analyze(
          logEntries,
          queryResults,
          config.partitionCount || 0,
        );
        analysisSummary = analysis.summary || null;
        await analyzer.writeAnalysis(
          scenario.name, analysis,
        );
        const nodeIds = cluster.getNodes().map((n) => n.id);
        await collector.writeOutput(
          scenario.name, logEntries, nodeIds,
        );
      } catch (_analysisErr) {
        // Analysis is best-effort
      }

      const duration = Date.now() - startMs;
      report.addResult(scenario.name, {
        passed: true,
        duration,
        startedAt,
        analysisSummary,
      });

      if (options.verbose) {
        process.stdout.write(
          'Scenario passed: ' + scenario.name +
          ' (' + duration + 'ms)\n'
        );
      }
    } catch (err) {
      const duration = Date.now() - startMs;
      hasFailures = true;

      // Attempt fallback log collection on failure
      let analysisSummary = null;
      if (cluster) {
        try {
          const collector = cluster.getLogCollector();
          const provider =
            cluster._providers[cluster._hostAssignment[0]];
          const nodes = cluster.getNodes();
          await collector.collectContainerFallback(
            provider, nodes,
          );
          const nodeIds = nodes.map((n) => n.id);
          await collector.writeOutput(
            scenario.name,
            collector.getBuffer(),
            nodeIds,
          );
        } catch (_fallbackErr) {
          // Best-effort fallback
        }
      }

      report.addResult(scenario.name, {
        passed: false,
        duration,
        startedAt,
        error: err.message,
        stackTrace: err.stack || null,
        analysisSummary,
      });

      if (options.verbose) {
        process.stderr.write(
          'Scenario failed: ' + scenario.name +
          ' — ' + err.message + '\n'
        );
      }
    } finally {
      if (cluster) {
        try {
          await cluster.stop();
        } catch (_stopErr) {
          // Best-effort teardown
        }
      }
    }
  }

  return {report, hasFailures};
}

/**
 * Main entry point. Parses args, loads config, discovers
 * scenarios, runs them, writes report, and exits.
 */
async function main() {
  const args = parseArgs(process.argv.slice(2));

  const config = await parseConfig(args.config);

  // Build Docker image before running scenarios
  try {
    await buildImage(config, args.verbose);
  } catch (err) {
    process.stderr.write(
      'Failed to build image: ' + err.message + '\n',
    );
    process.exit(EXIT_CODES.FAILURE);
  }

  const allScenarios = await discoverScenarios();
  const scenarios = args.scenario
    ? filterScenarios(allScenarios, args.scenario)
    : allScenarios;

  if (scenarios.length === 0) {
    process.stderr.write('No scenarios found.\n');
    process.exit(EXIT_CODES.FAILURE);
  }

  if (args.verbose) {
    process.stdout.write(
      'Found ' + scenarios.length + ' scenario(s)\n'
    );
  }

  const {report, hasFailures} = await runScenarios(
    config,
    scenarios,
    {output: args.output, verbose: args.verbose},
  );

  await report.write();

  if (args.verbose) {
    process.stdout.write(
      'Report written to ' + args.output + '\n'
    );
  }

  process.exit(
    hasFailures ? EXIT_CODES.FAILURE : EXIT_CODES.SUCCESS
  );
}

// Run main only when executed directly (not when imported by tests)
const __filename = fileURLToPath(import.meta.url);
const isDirectRun = resolve(process.argv[1] || '') === __filename;

if (isDirectRun) {
  main().catch((err) => {
    process.stderr.write('Fatal error: ' + err.message + '\n');
    process.exit(EXIT_CODES.FAILURE);
  });
}

export {parseArgs, runScenarios, buildImage};

/**
 * Distributed SQL examples runner entrypoint.
 *
 * This file intentionally stays thin and re-exports the public API from
 * focused modules under `scripts/examples/`.
 */

import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {AdminWsClient} from './admin-ws-client.js';
import {parseArgs} from './cli-args.js';
import {executeExample, uploadExample} from './example-execution.js';
import {
  discoverExampleDirectories,
  packageExample,
  packageExamples,
} from './package-examples.js';
import {
  runExamplesCatalog,
  summarizeExamples,
} from './run-examples-catalog.js';
import {validateExampleOutput} from './validate-output.js';


/**
 * CLI entrypoint for local examples execution.
 *
 * @return {Promise<void>}
 */
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const artifact = await runExamplesCatalog({
    target: args.target,
    examplesDir: args.examplesDir,
    include: args.include,
    exclude: args.exclude,
    outputPath: args.outputPath,
    failOnRequired: true,
  });

  process.stdout.write(
    `Examples complete: ${artifact.summary.passed}/${artifact.summary.total} passed\n`,
  );
  process.stdout.write(`Artifact: ${artifact.artifactPath}\n`);
}

const __filename = fileURLToPath(import.meta.url);
const isDirectRun = resolve(process.argv[1] || '') === __filename;

if (isDirectRun) {
  main().catch((error) => {
    process.stderr.write(`Examples failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

export {
  AdminWsClient,
  parseArgs,
  discoverExampleDirectories,
  packageExample,
  packageExamples,
  uploadExample,
  executeExample,
  validateExampleOutput,
  summarizeExamples,
  runExamplesCatalog,
};

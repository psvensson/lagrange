#!/usr/bin/env node
/**
 * Job generator for C1b/B2 process-cluster execution in Lagrange lab.
 *
 * Emits the exact driver: "process-cluster" job envelope and accompanying fixture
 * report metadata for release-0.2.6-smoke and scenario-a-dev-formation profiles.
 */

import fs from 'node:fs';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {
  PROFILE,
  generateClusterSpec,
} from './cluster-config.js';

/**
 * Build the full process-cluster job envelope and fixture metadata.
 * @param {Object} options
 * @return {{driver: string, timeoutSeconds: number, source: null, spec: Object, fixtureMetadata: Object}}
 */
function buildLabJob(options = {}) {
  const {spec, fixtureMetadata} = generateClusterSpec(options);
  const timeoutSeconds = spec.startWindowSeconds + spec.maxRunSeconds + spec.stopGraceSeconds + 60;

  return {
    driver: 'process-cluster',
    timeoutSeconds,
    source: null,
    spec,
    fixtureMetadata,
  };
}

/**
 * Parse CLI arguments for build-lab-job.js.
 * @param {string[]} argv
 * @return {Object}
 */
function parseCliArgs(argv) {
  const options = {};
  let outputPath = null;
  let pretty = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--profile' && i + 1 < argv.length) {
      options.profile = argv[i + 1];
      i += 1;
    } else if (arg === '--nodes' && i + 1 < argv.length) {
      options.memberCount = Number(argv[i + 1]);
      i += 1;
    } else if (arg === '--base-port' && i + 1 < argv.length) {
      options.basePort = Number(argv[i + 1]);
      i += 1;
    } else if (arg === '--pg-port' && i + 1 < argv.length) {
      options.pgPort = Number(argv[i + 1]);
      i += 1;
    } else if (arg === '--enable-pg') {
      options.enablePg = true;
    } else if (arg === '--allow-wildcard-rest-bind') {
      options.allowWildcardRestBind = true;
    } else if (arg === '--output' && i + 1 < argv.length) {
      outputPath = argv[i + 1];
      i += 1;
    } else if (arg === '--pretty') {
      pretty = true;
    }
  }

  return {options, outputPath, pretty};
}

function main() {
  const {options, outputPath, pretty} = parseCliArgs(process.argv.slice(2));

  // Default allowWildcardRestBind to true for release-0.2.6-smoke CLI invocation unless negated
  if (options.profile === undefined || options.profile === PROFILE.RELEASE_0_2_6_SMOKE) {
    if (options.allowWildcardRestBind === undefined) {
      options.allowWildcardRestBind = true;
    }
  }

  const job = buildLabJob(options);
  const jsonOutput = pretty ? JSON.stringify(job, null, 2) : JSON.stringify(job);

  if (outputPath) {
    fs.writeFileSync(outputPath, jsonOutput + '\n', 'utf8');
  } else {
    process.stdout.write(jsonOutput + '\n');
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`build-lab-job error: ${err.message}\n`);
    process.exit(1);
  }
}

export {
  buildLabJob,
  parseCliArgs,
};

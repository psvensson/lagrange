#!/usr/bin/env node
/**
 * Job generator for C1b/B2 process-cluster execution in Lagrange lab.
 *
 * Emits the exact driver: "process-cluster" job envelope and accompanying fixture
 * report metadata for release-0.2.6-smoke and scenario-a-dev-formation profiles.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {
  PROFILE,
  generateClusterSpec,
} from './cluster-config.js';

/**
 * Build the full process-cluster job envelope and fixture metadata.
 * @param {Object} options
 * @return {Object}
 */
function buildLabJob(options = {}) {
  const {spec, fixtureMetadata} = generateClusterSpec(options);
  const timeoutSeconds = spec.startWindowSeconds + spec.maxRunSeconds + spec.stopGraceSeconds + 60;
  const source = options.source !== undefined ? options.source : null;

  if (options.clientWorkOnly === true) {
    return {
      driver: 'process-cluster',
      ...(options.host !== undefined ? {host: options.host} : {}),
      source,
      spec,
      timeoutSeconds,
    };
  }

  return {
    driver: 'process-cluster',
    ...(options.host !== undefined ? {host: options.host} : {}),
    timeoutSeconds,
    source,
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
  let metadataOutputPath = null;
  let pretty = false;
  let sourceRepo = null;
  let sourceRef = null;
  let sourceSha = null;

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
    } else if (arg === '--oltp-comparison') {
      options.oltpComparison = true;
    } else if (arg === '--allow-wildcard-rest-bind') {
      options.allowWildcardRestBind = true;
    } else if (arg === '--output' && i + 1 < argv.length) {
      outputPath = argv[i + 1];
      i += 1;
    } else if (arg === '--pretty') {
      pretty = true;
    } else if (arg === '--host' && i + 1 < argv.length) {
      options.host = argv[i + 1];
      i += 1;
    } else if (arg === '--source-repo' && i + 1 < argv.length) {
      sourceRepo = argv[i + 1];
      i += 1;
    } else if (arg === '--source-ref' && i + 1 < argv.length) {
      sourceRef = argv[i + 1];
      i += 1;
    } else if (arg === '--source-sha' && i + 1 < argv.length) {
      sourceSha = argv[i + 1];
      i += 1;
    } else if (arg === '--client-work') {
      options.clientWorkOnly = true;
    } else if (arg === '--metadata-output' && i + 1 < argv.length) {
      metadataOutputPath = argv[i + 1];
      i += 1;
    }
  }

  if (sourceRepo && sourceRef && sourceSha) {
    options.source = {
      repo: sourceRepo,
      ref: sourceRef,
      sha: sourceSha,
    };
  }

  return {options, outputPath, metadataOutputPath, pretty};
}

function main() {
  const {options, outputPath, metadataOutputPath, pretty} = parseCliArgs(process.argv.slice(2));

  // Default allowWildcardRestBind to true for release-0.2.6-smoke CLI invocation unless negated
  if (options.profile === undefined || options.profile === PROFILE.RELEASE_0_2_6_SMOKE) {
    if (options.allowWildcardRestBind === undefined) {
      options.allowWildcardRestBind = true;
    }
  }

  const {fixtureMetadata} = generateClusterSpec(options);
  const job = buildLabJob(options);
  const jsonOutput = pretty ? JSON.stringify(job, null, 2) : JSON.stringify(job);

  if (outputPath) {
    fs.writeFileSync(outputPath, jsonOutput + '\n', 'utf8');
  } else {
    process.stdout.write(jsonOutput + '\n');
  }

  if (metadataOutputPath) {
    fs.writeFileSync(metadataOutputPath, JSON.stringify(fixtureMetadata, null, 2) + '\n', 'utf8');
  }
}

/**
 * Determine whether the given module URL corresponds to the entrypoint script,
 * resolving real paths so symlinked entrypoint invocations execute main().
 *
 * @param {string} importMetaUrl
 * @param {string|undefined} argv1
 * @return {boolean}
 */
function isMainModule(importMetaUrl, argv1) {
  if (!argv1) {
    return false;
  }
  try {
    const scriptPath = fileURLToPath(importMetaUrl);
    let realScriptPath;
    try {
      realScriptPath = fs.realpathSync(scriptPath);
    } catch {
      realScriptPath = path.resolve(scriptPath);
    }
    let realArgv1;
    try {
      realArgv1 = fs.realpathSync(argv1);
    } catch {
      realArgv1 = path.resolve(argv1);
    }
    return realScriptPath === realArgv1;
  } catch {
    return false;
  }
}

if (isMainModule(import.meta.url, process.argv[1])) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`build-lab-job error: ${err.message}\n`);
    process.exit(1);
  }
}

export {
  buildLabJob,
  isMainModule,
  parseCliArgs,
};

#!/usr/bin/env node

import process from 'node:process';
import {
  buildRollingRestartLivenessVerdict,
} from './rolling-restart-liveness-classifier.js';
import {
  readArtifactWithSidecarsSync,
} from './artifact-sidecar-loader.js';

const ARG_HELP_SHORT = '-h';
const ARG_HELP_LONG = '--help';
const ARGUMENT_ARTIFACT_INDEX = 2;
const EXIT_SUCCESS = 0;
const EXIT_USAGE = 1;
const EXIT_FAILURE = 2;
const JSON_INDENT_SPACES = 2;
const NEWLINE = '\n';
const EMPTY_TEXT = '';

const HELP_TEXT = [
  'Usage: node scripts/analyze-rolling-restart-liveness.js <artifact.json>',
  '',
  'Classifies a rolling-restart failed sample with deterministic liveness',
  'evidence: owner wake/queue admission, queue drain, publication visibility,',
  'and downstream operation workflow progress.',
].join(NEWLINE);

function main(argv) {
  const artifactPath = argv[ARGUMENT_ARTIFACT_INDEX] || EMPTY_TEXT;
  if (artifactPath === ARG_HELP_SHORT || artifactPath === ARG_HELP_LONG) {
    process.stdout.write(`${HELP_TEXT}${NEWLINE}`);
    return EXIT_SUCCESS;
  }
  if (!artifactPath) {
    process.stderr.write(`${HELP_TEXT}${NEWLINE}`);
    return EXIT_USAGE;
  }
  try {
    const artifact = readArtifactWithSidecarsSync(artifactPath);
    const verdict = buildRollingRestartLivenessVerdict(artifact, {
      sourceArtifact: artifactPath,
    });
    process.stdout.write(
      `${JSON.stringify(verdict, null, JSON_INDENT_SPACES)}${NEWLINE}`,
    );
    return EXIT_SUCCESS;
  } catch (error) {
    process.stderr.write(`${error.message}${NEWLINE}`);
    return EXIT_FAILURE;
  }
}

process.exitCode = main(process.argv);

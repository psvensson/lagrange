#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  buildTopologyConvergenceGraph,
  buildTopologyConvergenceGraphFromArtifacts,
} from '../src/diagnostics/topology-convergence-graph.js';

const ARG_HELP_SHORT = '-h';
const ARG_HELP_LONG = '--help';
const ENCODING_UTF8 = 'utf8';
const JSON_INDENT_SPACES = 2;
const EXIT_SUCCESS = 0;
const EXIT_USAGE = 1;
const EXIT_FAILURE = 2;
const FILE_FAILURE_BUNDLE = 'failure-bundle.json';
const FILE_TRIAGE_SUMMARY = 'triage-summary.json';
const FILE_REPORT_SUFFIX = '.report.json';
const PROPERTY_FAILURE_BUNDLE = 'failureBundle';
const PROPERTY_PUBLICATION_CONVERGENCE = 'publicationConvergence';
const PROPERTY_SUMMARY = 'summary';
const STDOUT_NEWLINE = '\n';
const HELP_TEXT = [
  'Usage: node scripts/analyze-topology-convergence.js <artifact.json>',
  '',
  'Reads a failure-bundle.json, triage-summary.json, or report JSON artifact',
  'and prints a TopologyConvergenceGraph JSON summary with frontier projection.',
  '',
  'Examples:',
  '  npm run analyze:topology-convergence -- test-output/reports/.playback/run/rolling-restart/failure-bundle.json',
  '  node scripts/analyze-topology-convergence.js test-output/reports/run.report.json',
].join(STDOUT_NEWLINE);

function main(argv) {
  const artifactPath = argv[ARGUMENT_ARTIFACT_INDEX];
  if (argv.includes(ARG_HELP_SHORT) || argv.includes(ARG_HELP_LONG)) {
    process.stdout.write(`${HELP_TEXT}${STDOUT_NEWLINE}`);
    return EXIT_SUCCESS;
  }
  if (!artifactPath) {
    process.stderr.write(`${HELP_TEXT}${STDOUT_NEWLINE}`);
    return EXIT_USAGE;
  }

  try {
    const artifact = readJsonFile(artifactPath);
    const graph = buildGraphForArtifact(artifactPath, artifact);
    process.stdout.write(`${JSON.stringify(selectCliOutput(graph), null, JSON_INDENT_SPACES)}\n`);
    return EXIT_SUCCESS;
  } catch (error) {
    process.stderr.write(`${error.message}${STDOUT_NEWLINE}`);
    return EXIT_FAILURE;
  }
}

const ARGUMENT_ARTIFACT_INDEX = 2;

function buildGraphForArtifact(artifactPath, artifact) {
  const baseName = path.basename(artifactPath);
  if (baseName === FILE_FAILURE_BUNDLE) {
    return buildTopologyConvergenceGraphFromArtifacts({failureBundle: artifact});
  }
  if (baseName === FILE_TRIAGE_SUMMARY) {
    return buildTopologyConvergenceGraphFromArtifacts({triageSummary: artifact});
  }
  if (baseName.endsWith(FILE_REPORT_SUFFIX) || artifact[PROPERTY_FAILURE_BUNDLE]) {
    return buildTopologyConvergenceGraph(artifact);
  }
  if (artifact[PROPERTY_PUBLICATION_CONVERGENCE] || artifact[PROPERTY_SUMMARY]) {
    return buildTopologyConvergenceGraphFromArtifacts({triageSummary: artifact});
  }
  return buildTopologyConvergenceGraph(artifact);
}

function selectCliOutput(graph) {
  return {
    schemaVersion: graph.schemaVersion,
    scenario: graph.scenario,
    summary: graph.summary,
    frontier: graph.frontier,
    nextExpectedFrontier: graph.nextExpectedFrontier,
  };
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, ENCODING_UTF8));
}

process.exitCode = main(process.argv);

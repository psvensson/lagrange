/**
 * Distributed scenario that executes the shared examples catalog
 * runner against a live cluster.
 */

import {join, resolve} from 'node:path';
import {runExamplesCatalog} from '../../../scripts/examples/build-upload-run.js';

const SCENARIO_OUTPUT_SUBDIR = 'examples';

function buildOutputPath(cluster) {
  const outputRoot = cluster?._config?.outputDir || 'test-output';
  const runId = `examples-catalog-${Date.now()}`;
  return resolve(join(outputRoot, SCENARIO_OUTPUT_SUBDIR, `${runId}.json`));
}

function createClusterClient(seedNode) {
  return {
    query: (sql, params) => seedNode.query(sql, params),
    partitionCallback: (payload) => seedNode.partitionCallback(payload),
  };
}

export async function run(cluster) {
  const nodes = cluster.getNodes();
  if (!Array.isArray(nodes) || nodes.length === 0) {
    throw new Error('examples-catalog requires at least one active node');
  }

  const seedNode = nodes[0];
  const outputPath = buildOutputPath(cluster);
  const artifact = await runExamplesCatalog({
    client: createClusterClient(seedNode),
    outputPath,
    failOnRequired: true,
  });

  return {
    exampleResults: artifact.summary,
    artifactPath: artifact.artifactPath,
    examples: artifact.examples,
  };
}

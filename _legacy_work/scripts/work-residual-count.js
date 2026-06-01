#!/usr/bin/env node

// Binds a package's representative residual count to a real evidence artifact.
// The residual count is the number of edges on the topology-convergence frontier
// of the representative report. R14 gates observablePrediction.metricDelta
// against the residualCount chain, and work:close auto-fills residualCount from
// the artifact so the recorded number cannot drift from the evidence.

import fs from 'node:fs';
import path from 'node:path';
import {buildTopologyConvergenceGraph} from '../src/diagnostics/topology-convergence-graph.js';

// Returns the frontier (residual) count derived from a representative evidence
// artifact, or null when it cannot be determined. Defensive by design: a missing
// or unparseable artifact returns null rather than throwing, so closure tooling
// degrades gracefully when the artifact is absent.
export function computeResidualCountFromArtifact(artifactPath) {
  if (!artifactPath || typeof artifactPath !== 'string') return null;
  const resolved = path.resolve(artifactPath);
  let raw;
  try {
    raw = fs.readFileSync(resolved, 'utf8');
  } catch (_error) {
    return null;
  }
  let artifact;
  try {
    artifact = JSON.parse(raw);
  } catch (_error) {
    return null;
  }
  return residualCountFromArtifactObject(artifact);
}

// Extracts a frontier/residual count from an already-parsed artifact object.
// Accepts either a raw representative report (built into a topology graph) or a
// pre-summarized artifact that already exposes a frontier array or frontierCount.
export function residualCountFromArtifactObject(artifact) {
  if (!artifact || typeof artifact !== 'object') return null;
  if (artifact.modelReport === true ||
      artifact.schemaVersion === 'active-gate-model-report-v1') {
    if (Number.isInteger(artifact.frontierCount) && artifact.frontierCount >= 0) {
      return artifact.frontierCount;
    }
    if (Number.isInteger(artifact.residual) && artifact.residual >= 0) {
      return artifact.residual;
    }
    return artifact.converged === true ? 0 : null;
  }
  if (Array.isArray(artifact.frontier)) return artifact.frontier.length;
  const summaryCount = artifact.summary?.frontierCount ??
    artifact.topology?.frontierCount;
  if (Number.isInteger(summaryCount) && summaryCount >= 0) return summaryCount;
  try {
    const graph = buildTopologyConvergenceGraph(artifact);
    if (graph && Array.isArray(graph.frontier)) return graph.frontier.length;
  } catch (_error) {
    return null;
  }
  return null;
}

#!/usr/bin/env node
/**
 * Finite cluster readiness and diagnostics observer for Lagrange cluster formations.
 *
 * Implements strict alignment with lagrange-server@0.2.6 schemas, sustained stability
 * window verification, verbatim diagnostic retention, and bounded byte budgets.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {runPgSmoke} from './pg-smoke.js';

const STDOUT_MAX_BYTES = 65536; // 64 KiB
const DIAGNOSTIC_MAX_BYTES = 65536; // 64 KiB
const AGGREGATE_DIAGNOSTIC_MAX_BYTES = 4194304; // 4 MiB

const HTTP_STATUS_OK = 200;

const DEFAULT_OPTIONS = Object.freeze({
  WINDOW_MS: 10000,
  MIN_SAMPLES: 6,
  CADENCE_MS: 2000,
  MAX_INTER_SAMPLE_GAP_MS: 3000,
  OVERALL_TIMEOUT_MS: 420000,
});

/**
 * Truncate or omit diagnostics that exceed individual or aggregate byte limits.
 * Emits an explicit omission record instead of forging truncated JSON.
 * @param {Object} data
 * @param {Object} budgetState
 * @param {number} [maxBytes]
 * @return {Object}
 */
function sanitizeDiagnostic(data, budgetState, maxBytes = DIAGNOSTIC_MAX_BYTES) {
  if (data === null || data === undefined) {
    return 'unknown';
  }

  let serialized;
  try {
    serialized = JSON.stringify(data);
  } catch (err) {
    return {
      omitted: true,
      reason: 'SERIALIZATION_FAILED',
      error: err.message,
    };
  }

  const byteLength = Buffer.byteLength(serialized, 'utf8');
  if (byteLength > maxBytes) {
    return {
      omitted: true,
      reason: 'BYTE_BUDGET_EXCEEDED',
      byteLength,
      limit: maxBytes,
    };
  }

  if (budgetState.spentBytes + byteLength > budgetState.maxAggregateBytes) {
    return {
      omitted: true,
      reason: 'AGGREGATE_BYTE_BUDGET_EXCEEDED',
      byteLength,
      spentBytes: budgetState.spentBytes,
      maxAggregateBytes: budgetState.maxAggregateBytes,
    };
  }

  budgetState.spentBytes += byteLength;
  return data;
}

/**
 * Safe fetch with JSON parsing and error retention.
 * @param {string} url
 * @param {Function} fetchFn
 * @return {Promise<{ok: boolean, status: number|null, body: any, error: string|null}>}
 */
async function fetchEndpoint(url, fetchFn) {
  try {
    const response = await fetchFn(url);
    const status = response?.status || null;
    let body = null;
    try {
      body = typeof response?.json === 'function' ? await response.json() : null;
    } catch (parseError) {
      return {ok: false, status, body: null, error: `JSON_PARSE_ERROR: ${parseError.message}`};
    }
    return {ok: status === HTTP_STATUS_OK, status, body, error: null};
  } catch (netError) {
    return {ok: false, status: null, body: null, error: `NETWORK_ERROR: ${netError.message}`};
  }
}

/**
 * Evaluate readiness predicates on one sample across all N members.
 * @param {Array<Object>} memberResults
 * @param {Map<string, string>} knownNodeIdentities
 * @return {{passing: boolean, refusals: string[], nodeIds: string[]}}
 */
function evaluateReadinessSample(memberResults, knownNodeIdentities) {
  const refusals = [];
  const observedNodeIds = [];

  for (let i = 0; i < memberResults.length; i += 1) {
    const {member, livez, startupz, readyz} = memberResults[i];
    const memberName = member.name;

    // 1. /livez check
    if (!livez.ok || !livez.body || livez.body.alive !== true) {
      refusals.push(`${memberName}: livez not alive (status: ${livez.status}, error: ${livez.error})`);
    } else {
      const nodeId = livez.body.nodeId;
      if (typeof nodeId !== 'string' || nodeId.trim().length === 0) {
        refusals.push(`${memberName}: livez missing or empty nodeId`);
      } else {
        observedNodeIds.push(nodeId);
        if (knownNodeIdentities.has(memberName)) {
          const expected = knownNodeIdentities.get(memberName);
          if (expected !== nodeId) {
            refusals.push(`${memberName}: nodeId drifted from ${expected} to ${nodeId}`);
          }
        } else {
          knownNodeIdentities.set(memberName, nodeId);
        }
      }
    }

    // 2. /startupz check
    if (!startupz.ok || !startupz.body || startupz.body.started !== true) {
      refusals.push(`${memberName}: startupz not started (status: ${startupz.status})`);
    }

    // 3. /readyz check
    if (!readyz.ok || !readyz.body || readyz.body.ready !== true) {
      refusals.push(`${memberName}: readyz not ready (status: ${readyz.status})`);
    } else {
      if (readyz.body.phase !== 'TRAFFIC_READY') {
        refusals.push(`${memberName}: readyz phase '${readyz.body.phase}' !== 'TRAFFIC_READY'`);
      }
      if (readyz.body.state !== 'join_ready') {
        refusals.push(`${memberName}: readyz state '${readyz.body.state}' !== 'join_ready'`);
      }
    }
  }

  // Ensure all nodeIds are distinct
  if (observedNodeIds.length === memberResults.length) {
    const uniqueIds = new Set(observedNodeIds);
    if (uniqueIds.size !== memberResults.length) {
      refusals.push(`Duplicate nodeIds observed across members: ${observedNodeIds.join(', ')}`);
    }
  }

  return {
    passing: refusals.length === 0,
    refusals,
    nodeIds: observedNodeIds,
  };
}

/**
 * Extract normalized admin control-snapshot fields according to 0.2.6 schema.
 * @param {Object} body
 * @return {Object}
 */
function normalizeControlSnapshot(body) {
  if (!body || typeof body !== 'object') {
    return 'unknown';
  }
  return {
    nodes: Array.isArray(body.nodes) ? body.nodes : 'unknown',
    publishedNodes: Array.isArray(body.publishedNodes) ? body.publishedNodes : 'unknown',
    projectedNodes: Array.isArray(body.projectedNodes) ? body.projectedNodes : 'unknown',
    partitions: Array.isArray(body.partitions) ? body.partitions : 'unknown',
    leaders: body.leaders && typeof body.leaders === 'object' ? body.leaders : 'unknown',
    voterCounts: body.voterCounts && typeof body.voterCounts === 'object' ?
      body.voterCounts :
      'unknown',
    replicaRoles: body.replicaRoles && typeof body.replicaRoles === 'object' ?
      body.replicaRoles :
      'unknown',
    replicaOperations: body.replicaOperations !== undefined ? body.replicaOperations : 'unknown',
    controlPlaneDiagnostics: body.controlPlaneDiagnostics !== undefined ?
      body.controlPlaneDiagnostics :
      'unknown',
    observationMode: body.observationMode !== undefined ? body.observationMode : 'unknown',
    adminObservation: body.adminObservation !== undefined ? body.adminObservation : 'unknown',
  };
}

/**
 * Extract normalized preflight critical path snapshot fields according to 0.2.6 schema.
 * @param {Object} body
 * @return {Object}
 */
function normalizePreflightSnapshot(body) {
  if (!body || typeof body !== 'object') {
    return 'unknown';
  }
  return {
    schemaVersion: body.schemaVersion !== undefined ? body.schemaVersion : 'unknown',
    capturedAtMs: body.capturedAtMs !== undefined ? body.capturedAtMs : 'unknown',
    nodeId: body.nodeId !== undefined ? body.nodeId : 'unknown',
    address: body.address !== undefined ? body.address : 'unknown',
    routerConnectivity: body.routerConnectivity !== undefined ?
      body.routerConnectivity :
      'unknown',
    controlPlanePartitions: body.controlPlanePartitions !== undefined ?
      body.controlPlanePartitions :
      'unknown',
    cdcHealth: body.cdcHealth !== undefined ? body.cdcHealth : 'unknown',
    cacheFreshness: body.cacheFreshness !== undefined ? body.cacheFreshness : 'unknown',
    rowCounts: body.rowCounts !== undefined ? body.rowCounts : 'unknown',
    discovery: body.discovery !== undefined ? body.discovery : 'unknown',
    controlPlaneDiagnostics: body.controlPlaneDiagnostics !== undefined ?
      body.controlPlaneDiagnostics :
      'unknown',
  };
}

/**
 * Extract normalized partition diagnostics fields according to 0.2.6 schema.
 * @param {Object} body
 * @return {Object}
 */
function normalizePartitionDiagnostics(body) {
  if (!body || typeof body !== 'object') {
    return 'unknown';
  }
  return {
    schemaVersion: body.schemaVersion !== undefined ? body.schemaVersion : 'unknown',
    nodeId: body.nodeId !== undefined ? body.nodeId : 'unknown',
    capturedAt: body.capturedAt !== undefined ? body.capturedAt : 'unknown',
    partitionCount: body.partitionCount !== undefined ? body.partitionCount : 'unknown',
    leaders: body.leaders && typeof body.leaders === 'object' ? body.leaders : 'unknown',
    voterCounts: body.voterCounts && typeof body.voterCounts === 'object' ?
      body.voterCounts :
      'unknown',
    replicaRoleDiagnostics: body.replicaRoleDiagnostics !== undefined ?
      body.replicaRoleDiagnostics :
      'unknown',
    replicaOperations: body.replicaOperations !== undefined ? body.replicaOperations : 'unknown',
    partitionsById: body.partitionsById && typeof body.partitionsById === 'object' ?
      body.partitionsById :
      'unknown',
  };
}

/**
 * Main observation routine for the cluster.
 * @param {Object} options
 * @return {Promise<Object>}
 */
async function observeCluster(options = {}) {
  const members = options.members || [];
  if (!Array.isArray(members) || members.length === 0) {
    throw new Error('members array is required and must not be empty');
  }

  const windowMs = options.windowMs || DEFAULT_OPTIONS.WINDOW_MS;
  const minSamples = options.minSamples || DEFAULT_OPTIONS.MIN_SAMPLES;
  const cadenceMs = options.cadenceMs || DEFAULT_OPTIONS.CADENCE_MS;
  const maxInterSampleGapMs = options.maxInterSampleGapMs ||
    DEFAULT_OPTIONS.MAX_INTER_SAMPLE_GAP_MS;
  const overallTimeoutMs = options.overallTimeoutMs || DEFAULT_OPTIONS.OVERALL_TIMEOUT_MS;

  const nowFn = options.nowFn || Date.now;
  const fetchFn = options.fetchFn || fetch;
  const sleepFn = options.sleepFn || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));

  const budgetState = {
    spentBytes: 0,
    maxAggregateBytes: AGGREGATE_DIAGNOSTIC_MAX_BYTES,
  };

  const startTime = nowFn();
  const knownNodeIdentities = new Map();

  let consecutivePassingSamples = 0;
  let windowStartTimestamp = null;
  let lastSampleTimestamp = null;
  let lastRefusals = [];
  const passingSamples = [];

  const seedMember = members[0];
  let seedBootstrapReadyDiagnostic = null;
  let finalAdminDiagnostics = null;

  while (nowFn() - startTime < overallTimeoutMs) {
    const sampleTimestamp = nowFn();

    // Check inter-sample gap
    if (lastSampleTimestamp !== null) {
      const gap = sampleTimestamp - lastSampleTimestamp;
      if (gap > maxInterSampleGapMs) {
        consecutivePassingSamples = 0;
        windowStartTimestamp = null;
        passingSamples.length = 0;
        lastRefusals = [`Inter-sample gap of ${gap}ms exceeded maxInterSampleGapMs (${maxInterSampleGapMs}ms)`];
      }
    }
    lastSampleTimestamp = sampleTimestamp;

    // Sample all members in parallel for core readiness probes
    const memberProbes = await Promise.all(
      members.map(async (member) => {
        const restBase = `http://127.0.0.1:${member.restPort}`;
        const [livez, startupz, readyz] = await Promise.all([
          fetchEndpoint(`${restBase}/livez`, fetchFn),
          fetchEndpoint(`${restBase}/startupz`, fetchFn),
          fetchEndpoint(`${restBase}/readyz`, fetchFn),
        ]);
        return {member, livez, startupz, readyz};
      }),
    );

    // Optional seed /bootstrap/ready diagnostic probe
    if (seedMember) {
      const bootstrapReadyRes = await fetchEndpoint(
        `http://127.0.0.1:${seedMember.restPort}/bootstrap/ready`,
        fetchFn,
      );
      if (bootstrapReadyRes.ok && bootstrapReadyRes.body) {
        seedBootstrapReadyDiagnostic = bootstrapReadyRes.body;
      }
    }

    const evaluation = evaluateReadinessSample(memberProbes, knownNodeIdentities);

    if (evaluation.passing) {
      if (consecutivePassingSamples === 0) {
        windowStartTimestamp = sampleTimestamp;
      }
      consecutivePassingSamples += 1;
      passingSamples.push({
        sampleIndex: consecutivePassingSamples,
        timestamp: sampleTimestamp,
        nodeIds: [...evaluation.nodeIds],
        probes: memberProbes.map((p) => ({
          member: p.member.name,
          startupz: {
            started: p.startupz.body?.started,
            phase: p.startupz.body?.phase,
            state: p.startupz.body?.state,
            reasons: p.startupz.body?.reasons,
            blockingDependencies: p.startupz.body?.blockingDependencies,
            joinProjection: p.startupz.body?.joinProjection,
            partitionReadiness: p.startupz.body?.partitionReadiness,
            replicationFactor: p.startupz.body?.replicationFactor,
            routingReadiness: p.startupz.body?.routingReadiness,
          },
          readyz: {
            ready: p.readyz.body?.ready,
            phase: p.readyz.body?.phase,
            state: p.readyz.body?.state,
            reasons: p.readyz.body?.reasons,
            blockingDependencies: p.readyz.body?.blockingDependencies,
            joinProjection: p.readyz.body?.joinProjection,
            partitionReadiness: p.readyz.body?.partitionReadiness,
            replicationFactor: p.readyz.body?.replicationFactor,
            routingReadiness: p.readyz.body?.routingReadiness,
          },
        })),
      });

      const windowDuration = sampleTimestamp - windowStartTimestamp;
      if (consecutivePassingSamples >= minSamples && windowDuration >= windowMs) {
        // Collect admin diagnostics from all members
        const adminDiagnostics = await Promise.all(
          members.map(async (member) => {
            const adminBase = `http://127.0.0.1:${member.adminWsPort}`;
            const [
              controlSnapshotRes,
              preflightRes,
              partitionsRes,
              servicesRes,
              discoveryPgRes,
            ] = await Promise.all([
              fetchEndpoint(`${adminBase}/api/admin/control-snapshot?scope=local`, fetchFn),
              fetchEndpoint(`${adminBase}/api/admin/diagnostics/preflight-critical-path-snapshot`, fetchFn),
              fetchEndpoint(`${adminBase}/api/admin/diagnostics/partitions`, fetchFn),
              fetchEndpoint(`${adminBase}/api/admin/diagnostics/services`, fetchFn),
              fetchEndpoint(`${adminBase}/api/admin/discovery/services?serviceId=sys-postgres-wire`, fetchFn),
            ]);

            return {
              member: member.name,
              controlSnapshot: sanitizeDiagnostic(
                normalizeControlSnapshot(controlSnapshotRes.body),
                budgetState,
              ),
              preflightSnapshot: sanitizeDiagnostic(
                normalizePreflightSnapshot(preflightRes.body),
                budgetState,
              ),
              partitionDiagnostics: sanitizeDiagnostic(
                normalizePartitionDiagnostics(partitionsRes.body),
                budgetState,
              ),
              servicesDiagnostics: sanitizeDiagnostic(
                servicesRes.body ?
                  {
                    nodeId: servicesRes.body.nodeId,
                    timestamp: servicesRes.body.timestamp,
                    diagnostics: servicesRes.body.diagnostics,
                  } :
                  'unknown',
                budgetState,
              ),
              discoveryPg: sanitizeDiagnostic(discoveryPgRes.body, budgetState),
            };
          }),
        );

        finalAdminDiagnostics = adminDiagnostics;

        const runPgSmokeFn = options.runPgSmokeFn || runPgSmoke;
        let pgSmoke = null;
        try {
          pgSmoke = await runPgSmokeFn({
            enablePg: Boolean(options.enablePg),
            seedAdminWsPort: seedMember.adminWsPort,
            seedRestPort: seedMember.restPort,
            pgPort: options.pgPort,
            activeNodeIds: new Set(knownNodeIdentities.values()),
            ...(options.pgOptions || {}),
          });
        } catch (pgError) {
          if (options.enablePg) {
            return {
              status: 'NOT_READY',
              ok: false,
              reason: `PG_SMOKE_FAILED: ${pgError.message}`,
              error: `PG_SMOKE_FAILED: ${pgError.message}`,
              consecutivePassingSamples,
              nodeIdentities: Object.fromEntries(knownNodeIdentities.entries()),
              pgSmoke: {
                status: 'FAILED',
                ok: false,
                error: pgError.message,
              },
            };
          }
        }

        if (options.enablePg && pgSmoke && (pgSmoke.status !== 'PASSED' || !pgSmoke.ok)) {
          return {
            status: 'NOT_READY',
            ok: false,
            reason: `PG_SMOKE_FAILED: ${pgSmoke.error || pgSmoke.status}`,
            error: `PG_SMOKE_FAILED: ${pgSmoke.error || pgSmoke.status}`,
            consecutivePassingSamples,
            nodeIdentities: Object.fromEntries(knownNodeIdentities.entries()),
            pgSmoke,
          };
        }

        const summary = {
          status: 'READY',
          ok: true,
          consecutivePassingSamples,
          windowDurationMs: windowDuration,
          nodeIdentities: Object.fromEntries(knownNodeIdentities.entries()),
          seedBootstrapReady: seedBootstrapReadyDiagnostic,
          pgSmoke,
          stabilityWindow: {
            requiredMinSamples: minSamples,
            requiredWindowMs: windowMs,
            observedSamples: consecutivePassingSamples,
            observedWindowMs: windowDuration,
          },
          samplesSummary: passingSamples.map((s) => ({
            sampleIndex: s.sampleIndex,
            timestamp: s.timestamp,
            nodeIds: s.nodeIds,
          })),
          adminDiagnostics: finalAdminDiagnostics,
          diagnosticBudget: {
            spentBytes: budgetState.spentBytes,
            maxAggregateBytes: budgetState.maxAggregateBytes,
          },
        };

        return summary;
      }
    } else {
      // Predicate failed: reset stability window
      consecutivePassingSamples = 0;
      windowStartTimestamp = null;
      passingSamples.length = 0;
      lastRefusals = evaluation.refusals;
    }

    const elapsed = nowFn() - startTime;
    if (elapsed + cadenceMs >= overallTimeoutMs) {
      break;
    }
    await sleepFn(cadenceMs);
  }

  const totalSpentMs = nowFn() - startTime;
  return {
    status: 'NOT_READY',
    ok: false,
    error: `Timed out after ${totalSpentMs}ms without sustaining stability window`,
    consecutivePassingSamples,
    lastRefusals,
    nodeIdentities: Object.fromEntries(knownNodeIdentities.entries()),
    totalSpentMs,
    diagnosticBudget: {
      spentBytes: budgetState.spentBytes,
      maxAggregateBytes: budgetState.maxAggregateBytes,
    },
  };
}

/**
 * Parse CLI arguments for observe-cluster.js.
 * @param {string[]} argv
 * @return {Object}
 */
function parseCliArgs(argv) {
  let members = null;
  let windowMs = DEFAULT_OPTIONS.WINDOW_MS;
  let minSamples = DEFAULT_OPTIONS.MIN_SAMPLES;
  let cadenceMs = DEFAULT_OPTIONS.CADENCE_MS;
  let maxInterSampleGapMs = DEFAULT_OPTIONS.MAX_INTER_SAMPLE_GAP_MS;
  let overallTimeoutMs = DEFAULT_OPTIONS.OVERALL_TIMEOUT_MS;
  let enablePg = false;
  let pgPort = null;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--members-json' && i + 1 < argv.length) {
      try {
        members = JSON.parse(argv[i + 1]);
      } catch (err) {
        throw new Error(`Failed to parse --members-json: ${err.message}`);
      }
      i += 1;
    } else if (arg === '--window-ms' && i + 1 < argv.length) {
      windowMs = Number(argv[i + 1]);
      i += 1;
    } else if (arg === '--min-samples' && i + 1 < argv.length) {
      minSamples = Number(argv[i + 1]);
      i += 1;
    } else if (arg === '--cadence-ms' && i + 1 < argv.length) {
      cadenceMs = Number(argv[i + 1]);
      i += 1;
    } else if (arg === '--max-inter-sample-gap-ms' && i + 1 < argv.length) {
      maxInterSampleGapMs = Number(argv[i + 1]);
      i += 1;
    } else if (arg === '--overall-timeout-ms' && i + 1 < argv.length) {
      overallTimeoutMs = Number(argv[i + 1]);
      i += 1;
    } else if (arg === '--enable-pg') {
      enablePg = true;
    } else if (arg === '--pg-port' && i + 1 < argv.length) {
      pgPort = Number(argv[i + 1]);
      i += 1;
    }
  }

  return {
    members,
    windowMs,
    minSamples,
    cadenceMs,
    maxInterSampleGapMs,
    overallTimeoutMs,
    enablePg,
    pgPort,
  };
}

/**
 * CLI runner for observe-cluster.js
 */
async function main() {
  const parsed = parseCliArgs(process.argv.slice(2));

  if (!parsed.members) {
    process.stderr.write('observe-cluster: --members-json argument is required\n');
    process.exit(1);
  }

  const result = await observeCluster({
    members: parsed.members,
    windowMs: parsed.windowMs,
    minSamples: parsed.minSamples,
    cadenceMs: parsed.cadenceMs,
    maxInterSampleGapMs: parsed.maxInterSampleGapMs,
    overallTimeoutMs: parsed.overallTimeoutMs,
    enablePg: parsed.enablePg,
    pgPort: parsed.pgPort,
  });

  const outputJson = JSON.stringify(result, null, 2);
  const outputBytes = Buffer.byteLength(outputJson, 'utf8');

  let reportJson;
  if (outputBytes > STDOUT_MAX_BYTES) {
    const boundedSummary = {
      status: result.status,
      ok: result.ok,
      error: result.error || null,
      consecutivePassingSamples: result.consecutivePassingSamples,
      nodeIdentities: result.nodeIdentities,
      omitted: true,
      reason: 'STDOUT_BUDGET_EXCEEDED',
      byteLength: outputBytes,
      limit: STDOUT_MAX_BYTES,
    };
    reportJson = JSON.stringify(boundedSummary, null, 2);
  } else {
    reportJson = outputJson;
  }

  process.stdout.write(reportJson + '\n');

  if (process.env.LAB3_OUTPUT_DIR) {
    fs.writeFileSync(
      path.join(process.env.LAB3_OUTPUT_DIR, 'observer-report.json'),
      reportJson + '\n',
      'utf8',
    );
  }

  process.exit(result.ok ? 0 : 1);
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
  main().catch((fatalError) => {
    process.stderr.write(`observe-cluster fatal: ${fatalError.message}\n`);
    process.exit(1);
  });
}

export {
  AGGREGATE_DIAGNOSTIC_MAX_BYTES,
  DEFAULT_OPTIONS,
  DIAGNOSTIC_MAX_BYTES,
  STDOUT_MAX_BYTES,
  evaluateReadinessSample,
  isMainModule,
  normalizeControlSnapshot,
  normalizePartitionDiagnostics,
  normalizePreflightSnapshot,
  observeCluster,
  parseCliArgs,
  sanitizeDiagnostic,
};

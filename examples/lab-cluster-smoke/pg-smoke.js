#!/usr/bin/env node
/**
 * PostgreSQL wire activation and query smoke verifier for Lagrange cluster formations.
 *
 * Implements explicit opt-in activation, service_definitions state retention,
 * pgwire descriptor validation, discovery endpoint polling with active member attribution,
 * workload readiness tracking, and bounded pg.Client query verification.
 */

import pg from 'pg';
import process from 'node:process';
import {AdminWsClient} from '../../scripts/examples/admin-ws-client.js';
import {validatePgwireRuntimeConfig} from '../../src/runtime/pgwire-descriptor.js';
import {createLagrangeOltpAdapter} from '../../test/distributed/reference-client/lagrange-oltp-adapter.js';
import {createPairedRetryingOltpAdapter} from '../../test/distributed/harness/oltp-paired-retry-owner.js';
import {runOltpBaselineWorkload} from '../../test/distributed/harness/oltp-baseline-workload.js';
import {runLagrangeVisibilityProbe} from '../../test/distributed/reference-client/lagrange-visibility-probe.js';
import {induceLagrangeRetryableConflict} from '../../test/distributed/reference-client/lagrange-retryable-conflict-probe.js';

const DEFAULT_USER = 'postgres';
const DEFAULT_DATABASE = 'postgres';
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_DISCOVERY_TIMEOUT_MS = 30000;
const DEFAULT_DISCOVERY_INTERVAL_MS = 500;

const DEFAULT_OLTP_WORKLOAD_OPTIONS = Object.freeze({
  seed: 20260911,
  workers: 2,
  warmupOperationsPerWorker: 100,
  measurementOperationsPerWorker: 100,
  warehouseCount: 2,
  districtsPerWarehouse: 4,
  customersPerDistrict: 50,
  itemCount: 200,
});

/**
 * Run live Scenario A OLTP comparison workload and semantic probes against Lagrange PostgreSQL wire.
 *
 * @param {Object} options
 * @param {number} options.pgPort
 * @param {string} [options.user]
 * @param {string} [options.database]
 * @param {Object} [options.workloadOptions]
 * @param {Function} [options.createLagrangeOltpAdapterFn]
 * @param {Function} [options.createPairedRetryingOltpAdapterFn]
 * @param {Function} [options.runOltpBaselineWorkloadFn]
 * @param {Function} [options.runLagrangeVisibilityProbeFn]
 * @param {Function} [options.induceLagrangeRetryableConflictFn]
 * @return {Promise<Object>}
 */
async function runLiveLagrangeScenarioAComparison(options = {}) {
  const pgPort = options.pgPort;
  const user = options.user || DEFAULT_USER;
  const database = options.database || DEFAULT_DATABASE;
  const endpoint = {host: '127.0.0.1', port: pgPort};
  const connection = {user, password: '', database, ssl: false};
  const workloadOptions = {
    ...DEFAULT_OLTP_WORKLOAD_OPTIONS,
    ...(options.workloadOptions || {}),
  };

  const createAdapterFn = options.createLagrangeOltpAdapterFn || createLagrangeOltpAdapter;
  const createPairedAdapterFn =
    options.createPairedRetryingOltpAdapterFn || createPairedRetryingOltpAdapter;
  const runWorkloadFn = options.runOltpBaselineWorkloadFn || runOltpBaselineWorkload;
  const runVisibilityFn = options.runLagrangeVisibilityProbeFn || runLagrangeVisibilityProbe;
  const induceConflictFn =
    options.induceLagrangeRetryableConflictFn || induceLagrangeRetryableConflict;

  const adapter = await createAdapterFn({
    endpoint,
    connection,
    workload: workloadOptions,
  });

  try {
    const retryingAdapter = createPairedAdapterFn(adapter);
    const workloadResult = await runWorkloadFn(retryingAdapter, workloadOptions);
    const evidence = await adapter.getEvidence();
    const retryEvidence = retryingAdapter.getRetryEvidence();
    const visibilityProbe = await runVisibilityFn({
      endpoint,
      connection,
      warehouseId: 1,
      writeDeltaCents: 100,
    });
    const retryableConflictProbe = await induceConflictFn({
      endpoint,
      connection,
      warehouseId: 1,
      writeDeltaCents: 100,
    });

    return {
      workloadOptions,
      datasetSha256: adapter.datasetSha256,
      datasetSummary: adapter.datasetSummary,
      workloadResult,
      retryEvidence,
      stateCounts: evidence.stateCounts,
      semanticProbes: {
        visibility: visibilityProbe,
        retryableConflict: retryableConflictProbe,
      },
    };
  } finally {
    await adapter.close({dropTables: false});
  }
}

/**
 * Escape a string for inclusion in a SQL string literal.
 * @param {string} str
 * @return {string}
 */
function escapeSqlStringLiteral(str) {
  return `'${String(str).replace(/'/g, '\'\'')}'`;
}

/**
 * Execute the PostgreSQL wire activation and query smoke sequence.
 * @param {Object} options
 * @param {boolean} [options.enablePg]
 * @param {number} [options.pgPort]
 * @param {number} [options.seedAdminWsPort]
 * @param {number} [options.seedRestPort]
 * @param {Set<string>|Array<string>} [options.activeNodeIds]
 * @param {string} [options.user]
 * @param {string} [options.database]
 * @param {number} [options.connectionTimeoutMs]
 * @param {number} [options.queryTimeoutMs]
 * @param {number} [options.discoveryTimeoutMs]
 * @param {number} [options.discoveryIntervalMs]
 * @param {Function} [options.fetchFn]
 * @param {Function} [options.sleepFn]
 * @param {Function} [options.nowFn]
 * @param {typeof AdminWsClient} [options.AdminWsClientClass]
 * @param {typeof pg.Client} [options.PgClientClass]
 * @param {Function} [options.validatePgwireRuntimeConfigFn]
 * @return {Promise<Object>}
 */
async function runPgSmoke(options = {}) {
  // 1. Opt-in verification: if enablePg is not strictly true, return NOT_REQUESTED
  if (options.enablePg !== true) {
    return {
      status: 'NOT_REQUESTED',
      ok: true,
      reason: 'enablePg was not set to true; PostgreSQL wire smoke skipped',
    };
  }

  const pgPort = options.pgPort;
  if (!Number.isInteger(pgPort) || pgPort < 1024 || pgPort > 65535) {
    throw new Error(`Valid pgPort (1024..65535) is required when enablePg=true, received: ${pgPort}`);
  }

  const seedAdminWsPort = options.seedAdminWsPort;
  if (!Number.isInteger(seedAdminWsPort) || seedAdminWsPort <= 0) {
    throw new Error(`seedAdminWsPort is required when enablePg=true, received: ${seedAdminWsPort}`);
  }

  const seedRestPort = options.seedRestPort;
  if (seedRestPort !== undefined && (!Number.isInteger(seedRestPort) || seedRestPort <= 0)) {
    throw new Error(`seedRestPort must be a positive integer if provided, received: ${seedRestPort}`);
  }

  const activeNodeIdSet = new Set(
    Array.isArray(options.activeNodeIds) ?
      options.activeNodeIds :
      (options.activeNodeIds instanceof Set ? Array.from(options.activeNodeIds) : []),
  );

  const AdminClientCtor = options.AdminWsClientClass || AdminWsClient;
  const PgClientCtor = options.PgClientClass || pg.Client;
  const validateConfigFn = options.validatePgwireRuntimeConfigFn || validatePgwireRuntimeConfig;
  const runOltpComparisonFn = options.runOltpComparisonFn || runLiveLagrangeScenarioAComparison;
  const fetchFn = options.fetchFn || fetch;
  const nowFn = options.nowFn || Date.now;
  const sleepFn = options.sleepFn || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));

  const discoveryTimeoutMs = options.discoveryTimeoutMs || DEFAULT_DISCOVERY_TIMEOUT_MS;
  const discoveryIntervalMs = options.discoveryIntervalMs || DEFAULT_DISCOVERY_INTERVAL_MS;
  const connectionTimeoutMs = options.connectionTimeoutMs || DEFAULT_TIMEOUT_MS;
  const queryTimeoutMs = options.queryTimeoutMs || DEFAULT_TIMEOUT_MS;

  const adminTarget = `ws://127.0.0.1:${seedAdminWsPort}/api/admin/stream`;
  const adminClient = new AdminClientCtor({
    target: adminTarget,
    timeoutMs: options.queryTimeoutMs || DEFAULT_TIMEOUT_MS,
  });

  let originalServiceDefinition = null;
  let desiredStateMutation = null;
  let matchingReplica = null;
  let pgClient = null;

  try {
    // 2. Connect to seed admin websocket and query original sys-postgres-wire definition
    await adminClient.connect();

    const selectOriginalSql =
      'SELECT service_id, service_name, replica_count, status, runtime_config, updated_at ' +
      'FROM service_definitions WHERE service_id = \'sys-postgres-wire\'';
    const originalResult = await adminClient.query(selectOriginalSql);
    originalServiceDefinition = originalResult?.rows?.[0] || originalResult || null;

    // 3. Validate desired runtime_config against pgwire descriptor
    const runtimeConfigObj = {
      host: '127.0.0.1',
      port: pgPort,
      authMode: 'trust',
      tlsMode: 'disable',
    };
    const runtimeConfigJson = JSON.stringify(runtimeConfigObj);
    const validation = validateConfigFn(runtimeConfigJson);
    if (!validation.valid) {
      throw new Error(
        `Desired pgwire runtime_config failed validation: ${(validation.errors || []).join('; ')}`,
      );
    }

    // 4. Execute escaped SQL mutations
    const escapedConfig = escapeSqlStringLiteral(runtimeConfigJson);
    const updateConfigSql =
      `UPDATE service_definitions SET runtime_config = ${escapedConfig} WHERE service_id = 'sys-postgres-wire'`;
    const updateReplicasSql =
      'UPDATE service_definitions SET replica_count = 1 WHERE service_id = \'sys-postgres-wire\'';

    const configUpdateRes = await adminClient.query(updateConfigSql);
    const replicaUpdateRes = await adminClient.query(updateReplicasSql);

    desiredStateMutation = {
      runtimeConfig: runtimeConfigObj,
      replicaCount: 1,
      configUpdateResult: configUpdateRes,
      replicaUpdateResult: replicaUpdateRes,
      appliedAtMs: nowFn(),
    };

    // 5. Poll discovery endpoint for placed, healthy sys-postgres-wire replica
    const discoveryUrl =
      `http://127.0.0.1:${seedAdminWsPort}/api/admin/discovery/services?serviceId=sys-postgres-wire`;
    const discoveryStart = nowFn();

    while (nowFn() - discoveryStart < discoveryTimeoutMs) {
      let discoveryBody = null;
      try {
        const response = await fetchFn(discoveryUrl);
        if (response && response.status === 200) {
          discoveryBody = typeof response.json === 'function' ? await response.json() : null;
        }
      } catch (pollError) {
        // Retain last poll error on discovery failure
        discoveryBody = {error: pollError.message};
      }

      if (discoveryBody && Array.isArray(discoveryBody.services)) {
        for (const service of discoveryBody.services) {
          const serviceIds = Array.isArray(service.serviceIds) ?
            service.serviceIds :
            [service.serviceId];
          if (serviceIds.includes('sys-postgres-wire') && Array.isArray(service.replicas)) {
            for (const replica of service.replicas) {
              const isMatch =
                replica.serviceId === 'sys-postgres-wire' &&
                replica.address === '127.0.0.1' &&
                replica.port === pgPort &&
                replica.healthStatus === 'healthy';

              if (isMatch) {
                // Verify attribution to an active product node
                if (activeNodeIdSet.size > 0 && !activeNodeIdSet.has(replica.nodeId)) {
                  throw new Error(
                    `PostgreSQL wire endpoint placed on unexpected/unowned nodeId: ${replica.nodeId}; ` +
                    `expected one of: ${Array.from(activeNodeIdSet).join(', ')}`,
                  );
                }
                matchingReplica = replica;
                break;
              }
            }
          }
          if (matchingReplica) {
            break;
          }
        }
      }

      if (matchingReplica) {
        break;
      }

      const elapsed = nowFn() - discoveryStart;
      if (elapsed + discoveryIntervalMs >= discoveryTimeoutMs) {
        break;
      }
      await sleepFn(discoveryIntervalMs);
    }

    if (!matchingReplica) {
      throw new Error(
        `Timed out after ${nowFn() - discoveryStart}ms waiting for healthy sys-postgres-wire ` +
        `endpoint at 127.0.0.1:${pgPort}`,
      );
    }

    // Retain readiness and benchmark admission verbatim
    let replicaReadiness = matchingReplica.readiness || {};
    let replicaBenchmarkAdmission = matchingReplica.benchmarkAdmission || {};
    let workloadReady = replicaReadiness.workloadReady === true;

    if (options.oltpComparison === true && !workloadReady) {
      const workloadReadyStart = nowFn();
      const workloadReadyTimeoutMs = options.workloadReadyTimeoutMs || 60000;
      while (nowFn() - workloadReadyStart < workloadReadyTimeoutMs) {
        await sleepFn(discoveryIntervalMs);
        try {
          const response = await fetchFn(discoveryUrl);
          if (response && response.status === 200) {
            const body = typeof response.json === 'function' ? await response.json() : null;
            if (body && Array.isArray(body.services)) {
              for (const service of body.services) {
                const serviceIds = Array.isArray(service.serviceIds) ?
                  service.serviceIds :
                  [service.serviceId];
                if (serviceIds.includes('sys-postgres-wire') && Array.isArray(service.replicas)) {
                  for (const replica of service.replicas) {
                    if (replica.serviceId === 'sys-postgres-wire' &&
                        replica.address === '127.0.0.1' &&
                        replica.port === pgPort &&
                        replica.healthStatus === 'healthy') {
                      matchingReplica = replica;
                      replicaReadiness = matchingReplica.readiness || {};
                      replicaBenchmarkAdmission = matchingReplica.benchmarkAdmission || {};
                      if (replicaReadiness.workloadReady === true) {
                        workloadReady = true;
                        break;
                      }
                    }
                  }
                }
                if (workloadReady) {
                  break;
                }
              }
            }
          }
        } catch {
          // ignore transient poll error while polling for workloadReady
        }
        if (workloadReady) {
          break;
        }
      }

      if (!workloadReady) {
        throw new Error(
          `Timed out after ${nowFn() - workloadReadyStart}ms waiting for sys-postgres-wire workloadReady=true`,
        );
      }
    }

    const workloadReadinessStatus = workloadReady ? 'READY' : 'NOT_READY';

    // 6. Connect via pg.Client and verify SELECT 1
    pgClient = new PgClientCtor({
      host: '127.0.0.1',
      port: pgPort,
      user: options.user || DEFAULT_USER,
      database: options.database || DEFAULT_DATABASE,
      ssl: false,
      connectionTimeoutMillis: connectionTimeoutMs,
      query_timeout: queryTimeoutMs,
    });

    await pgClient.connect();
    const queryResult = await pgClient.query('SELECT 1 AS ok');
    const returnedOk = queryResult?.rows?.[0]?.ok;

    if (returnedOk !== 1 && returnedOk !== '1') {
      throw new Error(
        `SELECT 1 returned unexpected result: ${JSON.stringify(queryResult?.rows)}`,
      );
    }

    let oltpComparison = null;
    if (options.oltpComparison === true) {
      oltpComparison = await runOltpComparisonFn({
        pgPort,
        user: options.user || DEFAULT_USER,
        database: options.database || DEFAULT_DATABASE,
      });
    }

    return {
      status: 'PASSED',
      ok: true,
      originalServiceDefinition,
      desiredStateMutation,
      discoveredReplica: {
        nodeId: matchingReplica.nodeId,
        address: matchingReplica.address,
        port: matchingReplica.port,
        healthStatus: matchingReplica.healthStatus,
        readiness: replicaReadiness,
        benchmarkAdmission: replicaBenchmarkAdmission,
        workloadReadinessStatus,
      },
      queryResult: {ok: 1},
      ...(oltpComparison ? {oltpComparison} : {}),
    };
  } finally {
    // Bounded cleanup for both clients
    if (pgClient) {
      try {
        await pgClient.end();
      } catch (pgEndError) {
        process.stderr.write(`pgClient cleanup error: ${pgEndError.message}\n`);
      }
    }
    try {
      await adminClient.close();
    } catch (adminCloseError) {
      process.stderr.write(`adminClient cleanup error: ${adminCloseError.message}\n`);
    }
  }
}

export {
  DEFAULT_DATABASE,
  DEFAULT_DISCOVERY_INTERVAL_MS,
  DEFAULT_DISCOVERY_TIMEOUT_MS,
  DEFAULT_OLTP_WORKLOAD_OPTIONS,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_USER,
  escapeSqlStringLiteral,
  runLiveLagrangeScenarioAComparison,
  runPgSmoke,
};

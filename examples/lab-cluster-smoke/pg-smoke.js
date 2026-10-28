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

const DEFAULT_USER = 'postgres';
const DEFAULT_DATABASE = 'postgres';
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_DISCOVERY_TIMEOUT_MS = 30000;
const DEFAULT_DISCOVERY_INTERVAL_MS = 500;

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
    const replicaReadiness = matchingReplica.readiness || {};
    const replicaBenchmarkAdmission = matchingReplica.benchmarkAdmission || {};
    const workloadReady = replicaReadiness.workloadReady === true;
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
  DEFAULT_TIMEOUT_MS,
  DEFAULT_USER,
  escapeSqlStringLiteral,
  runPgSmoke,
};

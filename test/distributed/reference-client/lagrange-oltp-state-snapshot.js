import pg from 'pg';

import {
  TABLES,
  buildTableQuery,
  canonicalRows,
  collectOltpStateSnapshot,
  normalizeEndpoint,
} from './oltp-state-snapshot-shared.js';

const {Client} = pg;

function normalizeConnection(value = {}) {
  const user = String(value.user || '').trim();
  const database = String(value.database || '').trim();
  if (!user) throw new Error('Lagrange OLTP state snapshot requires connection.user');
  if (!database) {
    throw new Error('Lagrange OLTP state snapshot requires connection.database');
  }
  return Object.freeze({
    user,
    database,
    ...(value.password === undefined ? {} : {password: value.password}),
    ...(value.ssl === undefined ? {} : {ssl: value.ssl}),
  });
}

function clientOptions(endpoint, connection) {
  return {
    host: endpoint.host,
    port: endpoint.port,
    user: connection.user,
    database: connection.database,
    ...(connection.password === undefined ? {} : {password: connection.password}),
    ...(connection.ssl === undefined ? {} : {ssl: connection.ssl}),
    connectionTimeoutMillis: 10000,
  };
}

async function observeLagrangeOltpStateSnapshot(options = {}) {
  const endpoint = normalizeEndpoint(options.endpoint, 'Lagrange OLTP');
  const connection = normalizeConnection(options.connection);
  const createClient = options.createClient || ((config) => new Client(config));
  const client = createClient(clientOptions(endpoint, connection));
  await client.connect();
  try {
    return await collectOltpStateSnapshot({
      tables: TABLES,
      queryRowsForTable: async (table) => {
        const result = await client.query(buildTableQuery(table));
        return canonicalRows(result?.rows || [], table.columns, 'Lagrange OLTP');
      },
    });
  } finally {
    await client.end();
  }
}

export {
  TABLES as LAGRANGE_OLTP_SNAPSHOT_TABLES,
  observeLagrangeOltpStateSnapshot,
};

import {loadMysql2Promise} from './native-clients.js';
import {
  TABLES,
  buildTableQuery,
  canonicalRows,
  collectOltpStateSnapshot,
  normalizeEndpoint,
} from './oltp-state-snapshot-shared.js';

function connectionOptions(endpoint, databaseName) {
  return {
    host: endpoint.host,
    port: endpoint.port,
    user: 'root',
    password: '',
    database: databaseName,
    decimalNumbers: true,
    multipleStatements: false,
  };
}

async function defaultCreateConnection(options) {
  const mysql = await loadMysql2Promise();
  return mysql.createConnection(options);
}

async function observeTiDbOltpStateSnapshot(options = {}) {
  const endpoint = normalizeEndpoint(options.endpoint, 'TiDB OLTP');
  const databaseName = String(options.databaseName || '').trim();
  if (!databaseName) {
    throw new Error('TiDB OLTP state snapshot requires databaseName');
  }
  const connect = options.createConnection || defaultCreateConnection;
  const connection = await connect(connectionOptions(endpoint, databaseName));
  try {
    return await collectOltpStateSnapshot({
      tables: TABLES,
      queryRowsForTable: async (table) => {
        const [rows] = await connection.query(buildTableQuery(table));
        return canonicalRows(rows, table.columns, 'TiDB OLTP');
      },
    });
  } finally {
    await connection.end();
  }
}

export {
  TABLES as TIDB_OLTP_SNAPSHOT_TABLES,
  observeTiDbOltpStateSnapshot,
};

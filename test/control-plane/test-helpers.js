function normalizeReadResult(result) {
  if (Array.isArray(result)) {
    return {
      success: true,
      rows: result,
    };
  }
  if (result && typeof result === 'object' && Array.isArray(result.rows)) {
    return result;
  }
  return {
    success: true,
    rows: result ? [result] : [],
  };
}

function createMockControlPlaneSystemTableGateway(overrides = {}) {
  const executeQuery = typeof overrides.executeQuery === 'function' ?
    overrides.executeQuery :
    null;

  const readRows = typeof overrides.readRows === 'function' ?
    overrides.readRows :
    async (tableName, sql, params, options) => {
      if (!executeQuery) {
        return {success: true, rows: []};
      }
      return normalizeReadResult(
        await executeQuery(tableName, sql, params, options),
      );
    };

  const readAuthoritativeRows = typeof overrides.readAuthoritativeRows ===
      'function' ?
    overrides.readAuthoritativeRows :
    readRows;

  return {
    readRows,
    readAuthoritativeRows,
    insertSystemTableRow: overrides.insertSystemTableRow ||
      (async () => ({
        success: true,
        partitionResult: {
          affectedRows: 1,
        },
      })),
    upsertSystemTableRow: overrides.upsertSystemTableRow ||
      (async () => ({
        success: true,
        partitionResult: {
          affectedRows: 1,
        },
      })),
    updateSystemTableRow: overrides.updateSystemTableRow ||
      (async () => ({
        success: true,
        partitionResult: {
          affectedRows: 1,
        },
      })),
    deleteSystemTableRow: overrides.deleteSystemTableRow ||
      (async () => ({
        success: true,
        partitionResult: {
          affectedRows: 1,
        },
      })),
  };
}

function createQueryBackedControlPlaneSystemTableGateway(
  sqlQueryEngine,
  overrides = {},
) {
  return createMockControlPlaneSystemTableGateway({
    executeQuery: (_tableName, sql, params) =>
      sqlQueryEngine.executeQuery(sql, params),
    ...overrides,
  });
}

export {
  createMockControlPlaneSystemTableGateway,
  createQueryBackedControlPlaneSystemTableGateway,
};

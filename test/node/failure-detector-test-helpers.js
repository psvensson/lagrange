function createMockMutationGateway(sqlQueryEngine = null, cdcIntegrationService = null) {
  const operations = [];
  const gateway = {
    operations,
    async submitMutation(mutation, options = {}) {
      operations.push({...mutation, options});
      if (cdcIntegrationService) {
        switch (mutation?.operation) {
        case 'update':
          return cdcIntegrationService.updateSystemTableRow(
            mutation.tableName,
            mutation.whereClause,
            mutation.data,
          );
        case 'insert':
          return cdcIntegrationService.insertSystemTableRow(
            mutation.tableName,
            mutation.row,
          );
        case 'delete':
          return cdcIntegrationService.deleteSystemTableRow(
            mutation.tableName,
            mutation.whereClause,
          );
        default:
          break;
        }
      }
      return {
        success: true,
        partitionResult: {affectedRows: 1},
        mutation,
        options,
      };
    },
  };
  if (sqlQueryEngine) {
    gateway.readAuthoritativeRows = async (_tableName, sql, params = []) => {
      return sqlQueryEngine.executeQuery(sql, params);
    };
    gateway.readRows = async (_tableName, sql, params = []) => {
      return sqlQueryEngine.executeQuery(sql, params);
    };
  }
  return gateway;
}

export {createMockMutationGateway};

function normalizeBootstrapMutationEffect(result) {
  const affectedRows = result?.partitionResult?.affectedRows ??
    result?.partitionResult?.changes ??
    result?.affectedRows ??
    result?.changes;
  if (!Number.isSafeInteger(affectedRows) || affectedRows < 0) return result;
  return {
    ...result,
    affectedRows,
    partitionResult: {...result.partitionResult, affectedRows},
  };
}

class BootstrapSystemTableWriter {
  constructor(cdcIntegrationService, partitionServices) {
    this.cdcIntegrationService = cdcIntegrationService;
    this.partitionServices = partitionServices;
  }

  enable() {
    this.cdcIntegrationService.setBootstrapMode(true, this.partitionServices);
  }

  disable() {
    this.cdcIntegrationService.setBootstrapMode(false, null);
  }

  async insertSystemTableRow(tableName, data, options = {}) {
    const result = await this.cdcIntegrationService.insertSystemTableRow(
      tableName, data, options,
    );
    return normalizeBootstrapMutationEffect(result);
  }

  upsertSystemTableRow(tableName, data, options = {}) {
    return this.cdcIntegrationService.upsertSystemTableRow(
      tableName, data, options,
    );
  }

  async updateSystemTableRow(tableName, keyData, updateData, options = {}) {
    const result = await this.cdcIntegrationService.updateSystemTableRow(
      tableName,
      keyData,
      updateData,
      options,
    );
    return normalizeBootstrapMutationEffect(result);
  }

  readAuthoritativeRows(tableName, sql, params = [], options = {}) {
    return this.cdcIntegrationService.readAuthoritativeRows(
      tableName, sql, params, options,
    );
  }
}

class RoutedSqlSystemTableWriter {
  constructor(cdcIntegrationService) {
    this.cdcIntegrationService = cdcIntegrationService;
  }

  enable() {
    this.cdcIntegrationService.setBootstrapMode(false, null);
  }

  disable() {}

  insertSystemTableRow(tableName, data, options = {}) {
    return this.cdcIntegrationService.insertSystemTableRow(
      tableName, data, options,
    );
  }

  upsertSystemTableRow(tableName, data, options = {}) {
    return this.cdcIntegrationService.upsertSystemTableRow(
      tableName, data, options,
    );
  }

  updateSystemTableRow(tableName, keyData, updateData, options = {}) {
    return this.cdcIntegrationService.updateSystemTableRow(
      tableName,
      keyData,
      updateData,
      options,
    );
  }

  readAuthoritativeRows(tableName, sql, params = [], options = {}) {
    return this.cdcIntegrationService.readAuthoritativeRows(
      tableName, sql, params, options,
    );
  }
}

export {BootstrapSystemTableWriter, RoutedSqlSystemTableWriter};

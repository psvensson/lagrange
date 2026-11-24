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

  upsertSystemTableRows(tableName, rows, options = {}) {
    return this.cdcIntegrationService.upsertSystemTableRows(
      tableName, rows, options,
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

  upsertSystemTableRows(tableName, rows, options = {}) {
    return this.cdcIntegrationService.upsertSystemTableRows(
      tableName, rows, options,
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

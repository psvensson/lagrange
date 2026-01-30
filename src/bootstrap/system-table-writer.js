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

  upsertSystemTableRow(tableName, data) {
    return this.cdcIntegrationService.upsertSystemTableRow(tableName, data);
  }

  updateSystemTableRow(tableName, keyData, updateData) {
    return this.cdcIntegrationService.updateSystemTableRow(
      tableName,
      keyData,
      updateData,
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

  upsertSystemTableRow(tableName, data) {
    return this.cdcIntegrationService.upsertSystemTableRow(tableName, data);
  }

  updateSystemTableRow(tableName, keyData, updateData) {
    return this.cdcIntegrationService.updateSystemTableRow(
      tableName,
      keyData,
      updateData,
    );
  }
}

export {BootstrapSystemTableWriter, RoutedSqlSystemTableWriter};

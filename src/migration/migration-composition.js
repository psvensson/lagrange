import {MigrationCoordinator} from './migration-coordinator.js';
import {MigrationPipeline} from './migration-pipeline.js';

/**
 * Build migration workflow owners for one SQL query engine.
 * @param {Object} options
 * @param {Object} options.sqlCore - SQL query engine instance.
 * @param {Object} options.systemTableCache - System cache.
 * @param {Object|null} [options.transactionCoordinator]
 * @param {Object|null} [options.logger]
 * @param {Function|null} [options.now]
 * @return {Object}
 */
function createMigrationWorkflowOwners(options = {}) {
  const migrationCoordinator = new MigrationCoordinator({
    sqlCore: options.sqlCore,
    systemTableCache: options.systemTableCache,
    transactionCoordinator: options.transactionCoordinator || null,
    logger: options.logger || console,
    now: options.now || (() => Date.now()),
  });
  const migrationPipeline = new MigrationPipeline({
    migrationCoordinator,
    logger: options.logger || console,
  });
  return {
    migrationCoordinator,
    migrationPipeline,
  };
}

/**
 * Attach migration workflow owners to one SQL query engine.
 * @param {Object} options
 * @param {Object} options.sqlCore - SQL query engine instance.
 * @param {Object} options.systemTableCache - System cache.
 * @param {Object|null} [options.transactionCoordinator]
 * @param {Object|null} [options.logger]
 * @param {Function|null} [options.now]
 * @return {Object}
 */
function wireMigrationWorkflowOwners(options = {}) {
  const owners = createMigrationWorkflowOwners(options);
  options.sqlCore.setMigrationCoordinator(owners.migrationCoordinator);
  options.sqlCore.setMigrationPipeline(owners.migrationPipeline);
  return owners;
}

export {
  createMigrationWorkflowOwners,
  wireMigrationWorkflowOwners,
};

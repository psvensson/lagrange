/**
 * CREATE TABLE enters provisioning only as a durable schema job: the one
 * production entry is `executeDurableSchemaProvisioningJob(ast, job)`, which
 * `SchemaProvisioningJobOwner` calls with the canonical intent of the
 * statement plus its ownership fence. Tests that exercise table creation
 * below the job owner enter there with that same job shape.
 */

import {canonicalizeSchemaProvisioningIntent} from
  '../../src/query/schema-provisioning-intent.js';

const OWNED_JOB_FENCE_TOKEN = 1;

/**
 * The job the schema-job owner hands its executor for this statement.
 * @param {Object} ast - CREATE TABLE AST.
 * @param {Object} [overrides] - Job fields to pin (e.g. tableId).
 * @return {Object}
 */
function durableSchemaJob(ast, overrides = {}) {
  return {
    ...canonicalizeSchemaProvisioningIntent(ast),
    ownerFenceToken: OWNED_JOB_FENCE_TOKEN,
    assertOwnership: async () => {},
    ...overrides,
  };
}

/**
 * Run CREATE TABLE provisioning through the durable job entry.
 * @param {Object} service - TableCreationService.
 * @param {Object} ast - CREATE TABLE AST.
 * @param {Object} [overrides] - Job fields to pin.
 * @return {Promise<Object>}
 */
function createTableThroughDurableJob(service, ast, overrides = {}) {
  return service.executeDurableSchemaProvisioningJob(
    ast,
    durableSchemaJob(ast, overrides),
  );
}

export {createTableThroughDurableJob};

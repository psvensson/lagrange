// This isolated process runs the ordinary embedded runtime. The barrier delays
// one table after the catalog commits, before its real partition provisioner.
import {TableCreationService} from '../../../src/query/table-creation-service-class.js';
import {SchemaProvisioningJobOwner} from '../../../src/query/schema-provisioning-job-owner.js';
import {registerEmbeddedWorkerOperations} from './embedded-node-worker.js';

const entered = Promise.withResolvers();
const release = Promise.withResolvers();
const terminal = Promise.withResolvers();
let heldTable;

const provision = TableCreationService.prototype.provisionInitialPartition;
TableCreationService.prototype.provisionInitialPartition = async function(context) {
  if (context.tableName === heldTable) {
    entered.resolve({jobId: context.schemaJobId, tableId: context.tableId});
    await release.promise;
  }
  return provision.call(this, context);
};

const transition = SchemaProvisioningJobOwner.prototype.transitionTerminal;
SchemaProvisioningJobOwner.prototype.transitionTerminal = async function(intent, workflow,
  options) {
  const result = await transition.call(this, intent, workflow, options);
  if (intent.tableName === heldTable) {
    terminal.resolve({jobId: intent.workflowId, status: options.updates.status});
  }
  return result;
};

registerEmbeddedWorkerOperations({
  holdProvisioning: ({tableName}) => {
    heldTable = tableName;
  },
  catalogCommitted: () => entered.promise,
  releaseProvisioning: () => release.resolve(),
  terminalProvisioning: () => terminal.promise,
});

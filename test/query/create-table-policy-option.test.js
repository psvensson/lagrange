import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {
  CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE,
} from '../../src/control-plane/control-plane-system-table-visibility-constants.js';
import {SQLParser} from '../../src/query/sql-parser.js';
import {canonicalizeSchemaProvisioningIntent} from
  '../../src/query/schema-provisioning-intent.js';
import {TableCreationService} from
  '../../src/query/table-creation-service.js';

const SPLIT_STORAGE_THRESHOLD_BYTES = 1048576;
const CREATE_WITH_POLICY_SQL =
  'CREATE TABLE ratings (rating_id INTEGER PRIMARY KEY) ' +
  `WITH (split_storage_threshold = ${SPLIT_STORAGE_THRESHOLD_BYTES});`;

const config = ConfigurationManager.getInstance();
if (!config.isInitialized()) {
  config.initialize();
}

function createService(submittedMutations) {
  return new TableCreationService({
    systemCache: {
      find() {
        return null;
      },
    },
    cdcIntegrationService: {},
    controlPlaneSystemTableGateway: {
      async submitMutation(mutation, options) {
        submittedMutations.push({mutation, options});
        return {
          success: true,
          visibilityState:
            CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE.VISIBLE,
        };
      },
    },
    partitionProvisioner: async () => ({
      resolvedReplicaCount: 3,
      routableReplicaCount: 3,
      fullReplicaCountConverged: true,
      contractState: 'ready',
      nextAction: 'proceed',
    }),
  });
}

test('CREATE TABLE parses a sparse split policy into durable intent options',
  (t) => {
    const ast = new SQLParser(CREATE_WITH_POLICY_SQL).parse();

    t.equal(ast.type, 'CREATE_TABLE');
    t.same(ast.options, {
      tablePolicy: {
        splitStorageThreshold: SPLIT_STORAGE_THRESHOLD_BYTES,
      },
    });
    t.equal(ast.rawSql, CREATE_WITH_POLICY_SQL,
      'the original statement remains available for diagnostics');
    t.end();
  });

test('CREATE TABLE split policy participates in durable idempotency identity',
  (t) => {
    const policyAst = new SQLParser(CREATE_WITH_POLICY_SQL).parse();
    const defaultAst = new SQLParser(
      'CREATE TABLE ratings (rating_id INTEGER PRIMARY KEY)',
    ).parse();
    const policyIntent = canonicalizeSchemaProvisioningIntent(policyAst);
    const defaultIntent = canonicalizeSchemaProvisioningIntent(defaultAst);

    t.same(policyIntent.intent.options, policyAst.options,
      'the durable schema job records the sparse policy as intent');
    t.not(policyIntent.intentHash, defaultIntent.intentHash,
      'policy-bearing CREATE cannot attach to an empty-policy job');
    t.end();
  });

test('CREATE TABLE projects its sparse split policy in the table insert',
  async (t) => {
    const submittedMutations = [];
    const service = createService(submittedMutations);

    const result = await service.executeCreateTableProvisioning(
      new SQLParser(CREATE_WITH_POLICY_SQL).parse(),
    );

    t.equal(result.success, true);
    t.equal(submittedMutations.length, 2);
    t.equal(submittedMutations[0].mutation.tableName, 'tables');
    t.same(
      JSON.parse(submittedMutations[0].mutation.row.table_policies),
      {splitStorageThreshold: SPLIT_STORAGE_THRESHOLD_BYTES},
      'the schema owner persists policy in the initial metadata mutation',
    );
    t.same(
      Object.keys(
        JSON.parse(submittedMutations[0].mutation.row.table_policies),
      ),
      ['splitStorageThreshold'],
      'inherited production policy defaults are not materialized',
    );
    await service.shutdown();
    t.end();
  });

test('CREATE TABLE validates programmatic table-policy options before writes',
  async (t) => {
    const submittedMutations = [];
    const service = createService(submittedMutations);
    const ast = new SQLParser(
      'CREATE TABLE ratings (rating_id INTEGER PRIMARY KEY)',
    ).parse();
    ast.options = {
      tablePolicy: {splitStorageThreshold: -1},
    };

    await t.rejects(
      service.executeCreateTableProvisioning(ast),
      /Invalid CREATE TABLE policy/,
    );
    t.equal(submittedMutations.length, 0,
      'invalid policy cannot partially persist table or partition metadata');
    await service.shutdown();
    t.end();
  });

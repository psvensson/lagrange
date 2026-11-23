/**
 * PostgreSQL wire-protocol type OID catalog and static column descriptors
 * for service lifecycle commands and EXPLAIN DISTRIBUTED.
 *
 * @module query/pg/postgres-wire-description-catalog
 */

import {PG_FORMAT_CODE} from '../../runtime/pgwire-protocol-constants.js';
import {SERVICE_LIFECYCLE_COMMAND} from '../../service/service-lifecycle-command-contract.js';

const PG_OID = Object.freeze({
  BOOL: 16,
  BYTEA: 17,
  INT8: 20,
  INT2: 21,
  INT4: 23,
  TEXT: 25,
  JSON: 114,
  FLOAT4: 700,
  FLOAT8: 701,
  DATE: 1082,
  TIMESTAMP: 1114,
  TIMESTAMPTZ: 1184,
  NUMERIC: 1700,
  UUID: 2950,
  JSONB: 3802,
});

const UNMODIFIED_TYPE = -1;
const VARIABLE_LENGTH = -1;
const PG_TYPE_SIZE = Object.freeze({
  ONE: 1,
  TWO: 2,
  FOUR: 4,
  EIGHT: 8,
  SIXTEEN: 16,
  VARIABLE: VARIABLE_LENGTH,
});

const PG_TYPE_SPEC_BY_NAME = Object.freeze(Object.assign(Object.create(null), {
  'BOOL': Object.freeze({oid: PG_OID.BOOL, typeSize: PG_TYPE_SIZE.ONE}),
  'BOOLEAN': Object.freeze({oid: PG_OID.BOOL, typeSize: PG_TYPE_SIZE.ONE}),
  'BYTEA': Object.freeze({oid: PG_OID.BYTEA, typeSize: PG_TYPE_SIZE.VARIABLE}),
  'BLOB': Object.freeze({oid: PG_OID.BYTEA, typeSize: PG_TYPE_SIZE.VARIABLE}),
  'INT8': Object.freeze({oid: PG_OID.INT8, typeSize: PG_TYPE_SIZE.EIGHT}),
  'BIGINT': Object.freeze({oid: PG_OID.INT8, typeSize: PG_TYPE_SIZE.EIGHT}),
  'BIGSERIAL': Object.freeze({oid: PG_OID.INT8, typeSize: PG_TYPE_SIZE.EIGHT}),
  'SERIAL8': Object.freeze({oid: PG_OID.INT8, typeSize: PG_TYPE_SIZE.EIGHT}),
  'INT2': Object.freeze({oid: PG_OID.INT2, typeSize: PG_TYPE_SIZE.TWO}),
  'SMALLINT': Object.freeze({oid: PG_OID.INT2, typeSize: PG_TYPE_SIZE.TWO}),
  'INT4': Object.freeze({oid: PG_OID.INT4, typeSize: PG_TYPE_SIZE.FOUR}),
  'INT': Object.freeze({oid: PG_OID.INT4, typeSize: PG_TYPE_SIZE.FOUR}),
  'INTEGER': Object.freeze({oid: PG_OID.INT4, typeSize: PG_TYPE_SIZE.FOUR}),
  'SERIAL': Object.freeze({oid: PG_OID.INT4, typeSize: PG_TYPE_SIZE.FOUR}),
  'SERIAL4': Object.freeze({oid: PG_OID.INT4, typeSize: PG_TYPE_SIZE.FOUR}),
  'TEXT': Object.freeze({oid: PG_OID.TEXT, typeSize: PG_TYPE_SIZE.VARIABLE}),
  'VARCHAR': Object.freeze({oid: PG_OID.TEXT, typeSize: PG_TYPE_SIZE.VARIABLE}),
  'CHARACTER VARYING': Object.freeze({oid: PG_OID.TEXT, typeSize: PG_TYPE_SIZE.VARIABLE}),
  'CHAR': Object.freeze({oid: PG_OID.TEXT, typeSize: PG_TYPE_SIZE.VARIABLE}),
  'CHARACTER': Object.freeze({oid: PG_OID.TEXT, typeSize: PG_TYPE_SIZE.VARIABLE}),
  'STRING': Object.freeze({oid: PG_OID.TEXT, typeSize: PG_TYPE_SIZE.VARIABLE}),
  'JSON': Object.freeze({oid: PG_OID.JSON, typeSize: PG_TYPE_SIZE.VARIABLE}),
  'JSONB': Object.freeze({oid: PG_OID.JSONB, typeSize: PG_TYPE_SIZE.VARIABLE}),
  'FLOAT4': Object.freeze({oid: PG_OID.FLOAT4, typeSize: PG_TYPE_SIZE.FOUR}),
  'REAL': Object.freeze({oid: PG_OID.FLOAT4, typeSize: PG_TYPE_SIZE.FOUR}),
  'FLOAT8': Object.freeze({oid: PG_OID.FLOAT8, typeSize: PG_TYPE_SIZE.EIGHT}),
  'DOUBLE PRECISION': Object.freeze({oid: PG_OID.FLOAT8, typeSize: PG_TYPE_SIZE.EIGHT}),
  'FLOAT': Object.freeze({oid: PG_OID.FLOAT8, typeSize: PG_TYPE_SIZE.EIGHT}),
  'DATE': Object.freeze({oid: PG_OID.DATE, typeSize: PG_TYPE_SIZE.FOUR}),
  'TIMESTAMP': Object.freeze({oid: PG_OID.TIMESTAMP, typeSize: PG_TYPE_SIZE.EIGHT}),
  'TIMESTAMP WITHOUT TIME ZONE': Object.freeze({
    oid: PG_OID.TIMESTAMP,
    typeSize: PG_TYPE_SIZE.EIGHT,
  }),
  'TIMESTAMPTZ': Object.freeze({oid: PG_OID.TIMESTAMPTZ, typeSize: PG_TYPE_SIZE.EIGHT}),
  'TIMESTAMP WITH TIME ZONE': Object.freeze({
    oid: PG_OID.TIMESTAMPTZ,
    typeSize: PG_TYPE_SIZE.EIGHT,
  }),
  'NUMERIC': Object.freeze({oid: PG_OID.NUMERIC, typeSize: PG_TYPE_SIZE.VARIABLE}),
  'DECIMAL': Object.freeze({oid: PG_OID.NUMERIC, typeSize: PG_TYPE_SIZE.VARIABLE}),
  'UUID': Object.freeze({oid: PG_OID.UUID, typeSize: PG_TYPE_SIZE.SIXTEEN}),
}));

const TYPE_SIZE_BY_OID = Object.freeze(new Map([
  [PG_OID.BOOL, PG_TYPE_SIZE.ONE],
  [PG_OID.BYTEA, PG_TYPE_SIZE.VARIABLE],
  [PG_OID.INT8, PG_TYPE_SIZE.EIGHT],
  [PG_OID.INT2, PG_TYPE_SIZE.TWO],
  [PG_OID.INT4, PG_TYPE_SIZE.FOUR],
  [PG_OID.TEXT, PG_TYPE_SIZE.VARIABLE],
  [PG_OID.JSON, PG_TYPE_SIZE.VARIABLE],
  [PG_OID.FLOAT4, PG_TYPE_SIZE.FOUR],
  [PG_OID.FLOAT8, PG_TYPE_SIZE.EIGHT],
  [PG_OID.DATE, PG_TYPE_SIZE.FOUR],
  [PG_OID.TIMESTAMP, PG_TYPE_SIZE.EIGHT],
  [PG_OID.TIMESTAMPTZ, PG_TYPE_SIZE.EIGHT],
  [PG_OID.NUMERIC, PG_TYPE_SIZE.VARIABLE],
  [PG_OID.UUID, PG_TYPE_SIZE.SIXTEEN],
  [PG_OID.JSONB, PG_TYPE_SIZE.VARIABLE],
]));

const TYPE_PARAM_SUFFIX_PATTERN = /\([^)]*\)/gu;

function buildColumnDescriptor(name, oid = PG_OID.TEXT, tableOid = 0, columnAttr = 0) {
  const typeSize = TYPE_SIZE_BY_OID.get(oid) ?? PG_TYPE_SIZE.VARIABLE;
  return Object.freeze({
    name,
    oid,
    typeSize,
    typeModifier: UNMODIFIED_TYPE,
    formatCode: PG_FORMAT_CODE.TEXT,
    tableOid,
    columnAttr,
  });
}

function normalizeSqlTypeSpec(rawType) {
  if (typeof rawType !== 'string' || rawType.trim().length === 0) {
    return PG_TYPE_SPEC_BY_NAME.TEXT;
  }
  const normalized = rawType.replace(TYPE_PARAM_SUFFIX_PATTERN, '').trim().toUpperCase();
  if (Object.hasOwn(PG_TYPE_SPEC_BY_NAME, normalized)) {
    return PG_TYPE_SPEC_BY_NAME[normalized];
  }
  return PG_TYPE_SPEC_BY_NAME.TEXT;
}

function buildColumns(entries) {
  return Object.freeze(entries.map(([name, oid]) => buildColumnDescriptor(name, oid)));
}

const LIFECYCLE_STATUS_COLUMNS = buildColumns([
  ['desired_state', PG_OID.TEXT],
  ['installation_id', PG_OID.TEXT],
  ['latest_failure_id', PG_OID.TEXT],
  ['operation_id', PG_OID.TEXT],
  ['readiness_reason', PG_OID.TEXT],
  ['readiness_state', PG_OID.TEXT],
  ['revision_id', PG_OID.TEXT],
  ['rollout_state', PG_OID.TEXT],
  ['service_definition_id', PG_OID.TEXT],
  ['service_name', PG_OID.TEXT],
  ['version', PG_OID.TEXT],
]);

const LIFECYCLE_OPERATION_COLUMNS = buildColumns([
  ['action', PG_OID.TEXT],
  ['desired_state', PG_OID.TEXT],
  ['installation_id', PG_OID.TEXT],
  ['operation_id', PG_OID.TEXT],
  ['operation_status', PG_OID.TEXT],
  ['package_id', PG_OID.TEXT],
  ['revision_id', PG_OID.TEXT],
  ['rollout_state', PG_OID.TEXT],
  ['service_definition_id', PG_OID.TEXT],
  ['service_name', PG_OID.TEXT],
]);

const LIFECYCLE_COLUMNS_BY_COMMAND = Object.freeze(new Map([
  [SERVICE_LIFECYCLE_COMMAND.CALL_BINDING, buildColumns([
    ['name', PG_OID.TEXT],
    ['result', PG_OID.TEXT],
  ])],
  [SERVICE_LIFECYCLE_COMMAND.CONFIGURE_ACCESS, buildColumns([
    ['binding_version_id', PG_OID.TEXT],
    ['call_targets', PG_OID.INT4],
    ['schema_version', PG_OID.INT4],
    ['service_id', PG_OID.TEXT],
    ['table_slots', PG_OID.INT4],
  ])],
  [SERVICE_LIFECYCLE_COMMAND.CREATE_BINDING, buildColumns([
    ['action', PG_OID.TEXT],
    ['binding_id', PG_OID.TEXT],
    ['binding_name', PG_OID.TEXT],
    ['binding_version_id', PG_OID.TEXT],
    ['export_name', PG_OID.TEXT],
    ['generation', PG_OID.INT4],
    ['manifest_digest', PG_OID.TEXT],
    ['operation_status', PG_OID.TEXT],
    ['package_id', PG_OID.TEXT],
    ['source_kind', PG_OID.TEXT],
  ])],
  [SERVICE_LIFECYCLE_COMMAND.PUBLISH_ARTIFACT, buildColumns([
    ['already_sealed', PG_OID.BOOL],
    ['artifact_digest', PG_OID.TEXT],
    ['chunk_count', PG_OID.INT4],
    ['media_type', PG_OID.TEXT],
    ['payload_digest', PG_OID.TEXT],
    ['sealed_at', PG_OID.TEXT],
    ['total_size', PG_OID.INT4],
  ])],
  [SERVICE_LIFECYCLE_COMMAND.INSTALL, LIFECYCLE_OPERATION_COLUMNS],
  [SERVICE_LIFECYCLE_COMMAND.UPGRADE, LIFECYCLE_OPERATION_COLUMNS],
  [SERVICE_LIFECYCLE_COMMAND.REMOVE, LIFECYCLE_OPERATION_COLUMNS],
  [SERVICE_LIFECYCLE_COMMAND.SHOW_ONE, LIFECYCLE_STATUS_COLUMNS],
  [SERVICE_LIFECYCLE_COMMAND.SHOW_ALL, LIFECYCLE_STATUS_COLUMNS],
]));

const EXPLAIN_DISTRIBUTED_COLUMNS = buildColumns([
  ['plan_id', PG_OID.TEXT],
  ['statement_type', PG_OID.TEXT],
  ['execution_policy', PG_OID.TEXT],
  ['table_plans', PG_OID.JSON],
  ['join_plan', PG_OID.JSON],
  ['merge_plan', PG_OID.JSON],
  ['diagnostics', PG_OID.JSON],
]);

export {
  EXPLAIN_DISTRIBUTED_COLUMNS,
  LIFECYCLE_COLUMNS_BY_COMMAND,
  PG_OID,
  PG_TYPE_SIZE,
  buildColumnDescriptor,
  normalizeSqlTypeSpec,
};

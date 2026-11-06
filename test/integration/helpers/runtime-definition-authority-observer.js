// Diagnostic-only observation branch. No read, retry, result or deadline is
// changed. This is not an acceptance witness and must not be merged.
import {ControlPlaneSystemTableGateway} from
  '../../../src/control-plane/control-plane-system-table-gateway.js';
import {RuntimeServiceHandler} from '../../../src/node/runtime-service-handler.js';

const LIMIT = 12;
let readCount = 0;
let resolutionCount = 0;

function dataField(value, key) {
  return value && typeof value === 'object' ?
    Object.getOwnPropertyDescriptor(value, key)?.value : undefined;
}

function shape(value) {
  if (value === null || typeof value !== 'object') return typeof value;
  return {
    prototype: Object.getPrototypeOf(value)?.constructor?.name ?? null,
    fields: Reflect.ownKeys(value).map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return {key: String(key), enumerable: descriptor.enumerable,
        kind: Object.hasOwn(descriptor, 'value') ? typeof descriptor.value : 'accessor'};
    }),
  };
}

function report(record) {
  console.error(JSON.stringify({diagnostic: 'runtime-definition-observation', ...record}));
}

const read = ControlPlaneSystemTableGateway.prototype.readAuthoritativeRows;
ControlPlaneSystemTableGateway.prototype.readAuthoritativeRows = async function(...args) {
  const observe = args[0] === 'service_definitions' &&
    args[2]?.[0] === 'sys-postgres-wire' && readCount++ < LIMIT;
  try {
    const result = await read.apply(this, args);
    if (observe) {
      const rows = dataField(result, 'rows');
      report({stage: 'gateway-answer', shape: shape(result),
        success: dataField(result, 'success'), error: dataField(result, 'error'),
        errorCode: dataField(result, 'errorCode'), outcome: dataField(result, 'outcome'),
        strategyUsed: dataField(result, 'strategyUsed'), rowCount: dataField(rows, 'length'),
        firstRowShape: shape(dataField(rows, '0'))});
    }
    return result;
  } catch (error) {
    if (observe) report({stage: 'gateway-throw', message: error.message, code: error.code});
    throw error;
  }
};

const resolve = RuntimeServiceHandler.prototype.resolveServiceDefinitionOutcomeForCreate;
RuntimeServiceHandler.prototype.resolveServiceDefinitionOutcomeForCreate = async function(...args) {
  const result = await resolve.apply(this, args);
  if (args[0] === 'sys-postgres-wire' && resolutionCount++ < LIMIT) {
    report({stage: 'create-resolution', hasGateway: Boolean(this.controlPlaneSystemTableGateway),
      readerType: typeof this.controlPlaneSystemTableGateway?.readAuthoritativeRows,
      outcome: result.outcome, errorMessage: result.errorMessage});
  }
  return result;
};

/**
 * Property Tests: Service Endpoint Metadata Completeness
 *
 * **Property 6: Service endpoint metadata completeness**
 * **Validates: Requirements 11.4**
 *
 * *For any* service endpoint record, the metadata field SHALL
 * contain the service name, version, and protocol fields
 * required for service discovery.
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  EP_COL,
  EP_META,
  EP_ID_SEPARATOR,
  DEFAULT_VERSION,
  buildEndpointRecord,
} from '../../src/wasm-service/service-endpoint-builder.js';
import {
  WASM_SERVICE_PROTOCOL,
  WASM_SERVICE_HEALTH_STATUS,
} from '../../src/wasm-service/wasm-service-constants.js';

/** Generates a non-empty alphanumeric service ID. */
const serviceIdArb = fc.stringMatching(
  /^[a-zA-Z][a-zA-Z0-9_-]{0,29}$/,
);

/** Generates a non-empty service name. */
const serviceNameArb = fc.stringMatching(
  /^[a-zA-Z][a-zA-Z0-9_ -]{0,29}$/,
);

/** Generates a protocol string from valid values. */
const protocolArb = fc.constantFrom(
  WASM_SERVICE_PROTOCOL.WEBSOCKET,
);

/** Generates a node ID string. */
const nodeIdArb = fc.stringMatching(
  /^[a-zA-Z][a-zA-Z0-9_-]{0,19}$/,
);

/** Generates an IP-like address string. */
const addressArb = fc.tuple(
  fc.integer({min: 1, max: 255}),
  fc.integer({min: 0, max: 255}),
  fc.integer({min: 0, max: 255}),
  fc.integer({min: 1, max: 254}),
).map(([a, b, c, d]) => `${a}.${b}.${c}.${d}`);

/** Generates a valid port number. */
const portArb = fc.integer({min: 1024, max: 65535});

/** Generates an optional version string. */
const versionArb = fc.option(
  fc.tuple(
    fc.integer({min: 0, max: 99}),
    fc.integer({min: 0, max: 99}),
    fc.integer({min: 0, max: 99}),
  ).map(([major, minor, patch]) => `${major}.${minor}.${patch}`),
  {nil: undefined},
);

test(
  'Feature: replicated-wasm-services, ' +
  'Property 6: Service endpoint metadata completeness',
  async (t) => {
    /**
     * **Validates: Requirements 11.4**
     */
    t.test(
      'metadata contains service_name, version, and protocol ' +
      'for any generated endpoint record',
      async () => {
        await fc.assert(
          fc.property(
            serviceIdArb,
            serviceNameArb,
            protocolArb,
            nodeIdArb,
            addressArb,
            portArb,
            versionArb,
            (
              serviceId,
              serviceName,
              protocol,
              nodeId,
              address,
              port,
              version,
            ) => {
              const serviceDefinition = {
                serviceId,
                serviceName,
                protocol,
              };

              const options = {
                serviceDefinition,
                nodeId,
                address,
                port,
              };
              if (version !== undefined) {
                options.version = version;
              }

              const record = buildEndpointRecord(options);

              // 1. Metadata field is valid JSON
              const raw = record[EP_COL.METADATA];
              if (typeof raw !== 'string') return false;

              let metadata;
              try {
                metadata = JSON.parse(raw);
              } catch (_e) {
                return false;
              }

              // 2. service_name is a non-empty string
              const name = metadata[EP_META.SERVICE_NAME];
              if (typeof name !== 'string' || name.length === 0) {
                return false;
              }

              // 3. version is a non-empty string
              const ver = metadata[EP_META.VERSION];
              if (typeof ver !== 'string' || ver.length === 0) {
                return false;
              }

              // 4. protocol is a non-empty string
              const proto = metadata[EP_META.PROTOCOL];
              if (typeof proto !== 'string' || proto.length === 0) {
                return false;
              }

              // 5. All required endpoint record fields present
              if (!record[EP_COL.ENDPOINT_ID]) return false;
              if (!record[EP_COL.SERVICE_ID]) return false;
              if (!record[EP_COL.NODE_ID]) return false;
              if (!record[EP_COL.PROTOCOL]) return false;
              if (!record[EP_COL.ADDRESS]) return false;
              if (typeof record[EP_COL.PORT] !== 'number') {
                return false;
              }
              if (!record[EP_COL.HEALTH_STATUS]) return false;
              if (typeof record[EP_COL.CREATED_AT] !== 'number') {
                return false;
              }
              if (typeof record[EP_COL.UPDATED_AT] !== 'number') {
                return false;
              }

              return true;
            },
          ),
          {numRuns: 10},
        );
      },
    );

    t.test(
      'metadata values match the inputs provided to ' +
      'buildEndpointRecord',
      async () => {
        await fc.assert(
          fc.property(
            serviceIdArb,
            serviceNameArb,
            protocolArb,
            nodeIdArb,
            addressArb,
            portArb,
            versionArb,
            (
              serviceId,
              serviceName,
              protocol,
              nodeId,
              address,
              port,
              version,
            ) => {
              const serviceDefinition = {
                serviceId,
                serviceName,
                protocol,
              };

              const options = {
                serviceDefinition,
                nodeId,
                address,
                port,
              };
              if (version !== undefined) {
                options.version = version;
              }

              const record = buildEndpointRecord(options);
              const metadata = JSON.parse(
                record[EP_COL.METADATA],
              );

              // service_name matches input
              if (metadata[EP_META.SERVICE_NAME] !== serviceName) {
                return false;
              }

              // version matches input or defaults
              const expectedVersion = version ?? DEFAULT_VERSION;
              if (metadata[EP_META.VERSION] !== expectedVersion) {
                return false;
              }

              // protocol matches input
              if (metadata[EP_META.PROTOCOL] !== protocol) {
                return false;
              }

              // endpoint_id follows expected format
              const expectedId =
                `${serviceId}${EP_ID_SEPARATOR}${nodeId}`;
              if (record[EP_COL.ENDPOINT_ID] !== expectedId) {
                return false;
              }

              // health_status defaults to HEALTHY
              if (record[EP_COL.HEALTH_STATUS] !==
                WASM_SERVICE_HEALTH_STATUS.HEALTHY) {
                return false;
              }

              return true;
            },
          ),
          {numRuns: 10},
        );
      },
    );
  },
);

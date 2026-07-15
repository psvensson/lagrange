import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {
  OCI_HOST_AGENT_PROTOCOL_ERROR,
  canonicalizeOciHostAgentJson,
  decodeOciHostAgentRequestFrame,
  decodeOciHostAgentResponseFrame,
  encodeOciHostAgentRequestFrame,
  encodeOciHostAgentResponseFrame,
  parseExactOciHostAgentJson,
} from '../../src/runtime/oci-host-agent-protocol.js';

const DIGEST = `sha256:${'a'.repeat(64)}`;
const OTHER_DIGEST = `sha256:${'b'.repeat(64)}`;
const KEY = Buffer.alloc(32, 7);
const IDENTITY = Object.freeze({
  clusterIncarnation: 'cluster-1',
  nodeId: 'node-1',
  serviceId: 'service-1',
  revisionId: 'revision-1',
  instanceId: 'instance-1',
});

function enrolledKeyRecord(overrides = {}) {
  return {
    key: KEY,
    clusterIncarnation: IDENTITY.clusterIncarnation,
    nodeId: IDENTITY.nodeId,
    ...overrides,
  };
}

function requestDecodeOptions(overrides = {}) {
  return {
    resolveKey: (keyId) => keyId === 'node-key-1' ?
      enrolledKeyRecord() : null,
    nowMs: 2_000,
    ...overrides,
  };
}

function requestEnvelope(overrides = {}) {
  return {
    protocolVersion: 1,
    requestId: '00000000-0000-4000-8000-000000000001',
    operationId: `oci-v1:${'b'.repeat(64)}`,
    keyId: 'node-key-1',
    issuedAtMs: 1_000,
    deadlineAtMs: 10_000,
    nonce: Buffer.alloc(32, 3).toString('base64'),
    ...IDENTITY,
    operation: 'pull',
    payload: {
      artifactRef: `registry.example/fixture@${DIGEST}`,
      expectedDigest: DIGEST,
    },
    ...overrides,
  };
}

function completedPullResult() {
  return {
    status: 'completed',
    operation: 'pull',
    intentDigest: DIGEST,
    identity: IDENTITY,
    cleanup: {state: 'not_required', residualResources: []},
    observation: {kind: 'image', imageDigest: DIGEST},
  };
}

function stableLabels() {
  return {
    'io.lagrange.managed': 'true',
    'io.lagrange.cluster_incarnation': IDENTITY.clusterIncarnation,
    'io.lagrange.node_id': IDENTITY.nodeId,
    'io.lagrange.service_id': IDENTITY.serviceId,
    'io.lagrange.revision_id': IDENTITY.revisionId,
    'io.lagrange.instance_id': IDENTITY.instanceId,
    'io.lagrange.image_digest': DIGEST,
    'io.lagrange.runtime_config_digest': DIGEST,
    'io.lagrange.create_operation_id': `oci-v1:${'c'.repeat(64)}`,
    'io.lagrange.create_intent_digest': DIGEST,
  };
}

function containerObservation(state = 'running') {
  return {
    kind: 'container',
    containerId: 'd'.repeat(64),
    state,
    labels: stableLabels(),
    imageDigest: DIGEST,
    runtimeConfigDigest: DIGEST,
  };
}

function resultFor(status, operation, extra = {}) {
  return {
    status,
    operation,
    intentDigest: DIGEST,
    identity: IDENTITY,
    cleanup: {state: 'not_required', residualResources: []},
    ...extra,
  };
}

function responseEnvelope(request, overrides = {}) {
  return {
    protocolVersion: 1,
    requestId: request.requestId,
    operationId: request.operationId,
    keyId: request.keyId,
    agentId: 'agent-1',
    completedAtMs: 2_000,
    result: completedPullResult(),
    ...overrides,
  };
}

function replaceAuthenticationSignature(frame, signature) {
  const decoded = JSON.parse(frame.subarray(4).toString('utf8'));
  decoded.authentication.signature = signature;
  const body = Buffer.from(canonicalizeOciHostAgentJson(decoded), 'utf8');
  const prefix = Buffer.alloc(4);
  prefix.writeUInt32BE(body.length);
  return Buffer.concat([prefix, body]);
}

function reframeBody(body) {
  const bytes = Buffer.from(body, 'utf8');
  const prefix = Buffer.alloc(4);
  prefix.writeUInt32BE(bytes.length);
  return Buffer.concat([prefix, bytes]);
}

describe('OCI host-agent protocol admission', () => {
  it('uses deterministic RFC-8785-compatible canonical bytes', () => {
    assert.equal(
      canonicalizeOciHostAgentJson({z: 2, a: {y: true, x: 'ok'}}),
      '{"a":{"x":"ok","y":true},"z":2}',
    );
    assert.throws(
      () => canonicalizeOciHostAgentJson({unsafe: Number.MAX_SAFE_INTEGER + 1}),
      (error) => error.code ===
        OCI_HOST_AGENT_PROTOCOL_ERROR.INVALID_JSON_NUMBER,
    );
    assert.throws(
      () => canonicalizeOciHostAgentJson({secret: null}),
      (error) => error.code ===
        OCI_HOST_AGENT_PROTOCOL_ERROR.NULL_NOT_ALLOWED,
    );
  });

  it('rejects duplicate raw object keys before JSON loses them', () => {
    assert.throws(
      () => parseExactOciHostAgentJson('{"a":1,"a":2}'),
      (error) => error.code ===
        OCI_HOST_AGENT_PROTOCOL_ERROR.DUPLICATE_OBJECT_KEY,
    );
    assert.throws(
      () => parseExactOciHostAgentJson('{"a":1,"\\u0061":2}'),
      (error) => error.code ===
        OCI_HOST_AGENT_PROTOCOL_ERROR.DUPLICATE_OBJECT_KEY,
    );
    assert.throws(
      () => parseExactOciHostAgentJson(Buffer.from([0xc3, 0x28])),
      (error) => error.code ===
        OCI_HOST_AGENT_PROTOCOL_ERROR.INVALID_UNICODE,
    );
  });

  it('round-trips one signed, identity-bound pull request', () => {
    const envelope = requestEnvelope();
    const frame = encodeOciHostAgentRequestFrame(envelope, KEY);
    assert.equal(frame.readUInt32BE(0), frame.length - 4);

    const decoded = decodeOciHostAgentRequestFrame(
      frame,
      requestDecodeOptions(),
    );
    assert.deepEqual(decoded, envelope);
  });

  it('binds keyId to its enrolled cluster and node identity', () => {
    const envelope = requestEnvelope({
      clusterIncarnation: 'cluster-forged',
      nodeId: 'node-forged',
    });
    const frame = encodeOciHostAgentRequestFrame(envelope, KEY);

    assert.throws(
      () => decodeOciHostAgentRequestFrame(
        frame,
        requestDecodeOptions(),
      ),
      (error) => error.code ===
        OCI_HOST_AGENT_PROTOCOL_ERROR.AUTHENTICATION_FAILED,
    );
  });

  it('collapses malformed enrolled key access to key_unavailable', () => {
    const envelope = requestEnvelope();
    const frame = encodeOciHostAgentRequestFrame(envelope, KEY);
    const malformedRecord = Object.defineProperties({}, {
      clusterIncarnation: {
        enumerable: true,
        value: IDENTITY.clusterIncarnation,
      },
      key: {
        enumerable: true,
        get() {
          throw new Error('sensitive-key-record-detail');
        },
      },
      nodeId: {
        enumerable: true,
        value: IDENTITY.nodeId,
      },
    });

    assert.throws(
      () => decodeOciHostAgentRequestFrame(
        frame,
        requestDecodeOptions({resolveKey: () => malformedRecord}),
      ),
      (error) => error.code === OCI_HOST_AGENT_PROTOCOL_ERROR.KEY_UNAVAILABLE &&
        error.message === OCI_HOST_AGENT_PROTOCOL_ERROR.KEY_UNAVAILABLE,
    );
  });

  it('rejects executable or hidden enrolled key records', () => {
    const frame = encodeOciHostAgentRequestFrame(requestEnvelope(), KEY);
    const accesses = [];
    const observe = (value) => () => {
      accesses.push(value);
      return value;
    };
    const proxy = new Proxy(
      enrolledKeyRecord(),
      new Proxy({}, {get: (_, method) => observe(Reflect[method])}),
    );
    const accessor = (value) => ({enumerable: true, get: observe(value)});
    const accessorRecord = Object.defineProperties({}, {
      clusterIncarnation: accessor(IDENTITY.clusterIncarnation),
      key: accessor(KEY),
      nodeId: accessor(IDENTITY.nodeId),
    });
    const hiddenRecord = (field) => Object.defineProperty(
      enrolledKeyRecord(), field, {value: true},
    );
    const revocable = Proxy.revocable(enrolledKeyRecord(), {});
    revocable.revoke();
    const decode = (record) => decodeOciHostAgentRequestFrame(
      frame,
      requestDecodeOptions({resolveKey: () => record}),
    );
    const unavailable = (error) =>
      error.code === OCI_HOST_AGENT_PROTOCOL_ERROR.KEY_UNAVAILABLE &&
      error.message === OCI_HOST_AGENT_PROTOCOL_ERROR.KEY_UNAVAILABLE;

    for (const record of [
      proxy,
      revocable.proxy,
      accessorRecord,
      hiddenRecord(Symbol('hidden-enrollment-state')),
      hiddenRecord('hiddenEnrollmentState'),
    ]) {
      assert.throws(() => decode(record), unavailable);
    }
    assert.deepEqual(accesses, []);
  });

  it('rejects malformed enrolled identities as stable key_unavailable', () => {
    const envelope = requestEnvelope();
    const frame = encodeOciHostAgentRequestFrame(envelope, KEY);
    const malformedIdentities = [
      ['clusterIncarnation', ''],
      ['clusterIncarnation', 'cluster/invalid'],
      ['clusterIncarnation', 'cluster\u0000invalid'],
      ['clusterIncarnation', 'c'.repeat(256)],
      ['nodeId', ''],
      ['nodeId', 'node/invalid'],
      ['nodeId', 'node\u0000invalid'],
      ['nodeId', 'n'.repeat(256)],
    ];

    for (const [field, value] of malformedIdentities) {
      assert.throws(
        () => decodeOciHostAgentRequestFrame(
          frame,
          requestDecodeOptions({
            resolveKey: () => enrolledKeyRecord({[field]: value}),
          }),
        ),
        (error) =>
          error.code === OCI_HOST_AGENT_PROTOCOL_ERROR.KEY_UNAVAILABLE &&
          error.message === OCI_HOST_AGENT_PROTOCOL_ERROR.KEY_UNAVAILABLE,
      );
    }
  });

  it('accepts only the closed six-operation C1 payload grammar', () => {
    const requests = [
      requestEnvelope(),
      requestEnvelope({
        operation: 'create',
        payload: {
          imageDigest: DIGEST,
          runtimeConfigDigest: DIGEST,
          entrypoint: ['node'],
          args: [],
          environment: {
            values: {PORT: '8080'},
            secretRefs: {TOKEN: 'fixture-token'},
          },
          ports: [{protocol: 'tcp', containerPort: 8_080}],
          resources: {cpuMillis: 100, memoryBytes: 1_048_576},
        },
      }),
      requestEnvelope({operation: 'start', payload: {}}),
      requestEnvelope({operation: 'inspect', payload: {}}),
      requestEnvelope({operation: 'stop', payload: {graceMs: 1_000}}),
      requestEnvelope({operation: 'remove', payload: {}}),
    ];
    for (const request of requests) {
      assert.ok(encodeOciHostAgentRequestFrame(request, KEY).length > 4);
    }

    assert.throws(
      () => encodeOciHostAgentRequestFrame(requestEnvelope({
        operation: 'probe',
        payload: {},
      }), KEY),
      (error) => error.code ===
        OCI_HOST_AGENT_PROTOCOL_ERROR.INVALID_FIELD,
    );
    assert.throws(
      () => encodeOciHostAgentRequestFrame(requestEnvelope({
        operation: 'create',
        payload: {
          imageDigest: DIGEST,
          runtimeConfigDigest: DIGEST,
          ports: [{protocol: 'tcp', containerPort: 8_080, hostPort: 8_080}],
        },
      }), KEY),
      (error) => error.code ===
        OCI_HOST_AGENT_PROTOCOL_ERROR.UNKNOWN_FIELD,
    );
    assert.throws(
      () => encodeOciHostAgentRequestFrame(requestEnvelope({
        operation: 'create',
        payload: {
          imageDigest: DIGEST,
          runtimeConfigDigest: DIGEST,
          ports: [
            {protocol: 'tcp', containerPort: 8_080},
            {protocol: 'tcp', containerPort: 8_080},
          ],
        },
      }), KEY),
      (error) => error.code ===
        OCI_HOST_AGENT_PROTOCOL_ERROR.INVALID_FIELD,
    );
  });

  it('rejects forged authentication and nested unknown fields', () => {
    const envelope = requestEnvelope();
    const frame = encodeOciHostAgentRequestFrame(envelope, KEY);
    const forged = replaceAuthenticationSignature(
      frame,
      Buffer.alloc(32, 9).toString('base64'),
    );
    assert.throws(
      () => decodeOciHostAgentRequestFrame(
        forged,
        requestDecodeOptions(),
      ),
      (error) => error.code ===
        OCI_HOST_AGENT_PROTOCOL_ERROR.AUTHENTICATION_FAILED,
    );
    assert.throws(
      () => encodeOciHostAgentRequestFrame(requestEnvelope({
        payload: {
          artifactRef: `registry.example/fixture@${DIGEST}`,
          expectedDigest: DIGEST,
          dockerOptions: {},
        },
      }), KEY),
      (error) => error.code ===
        OCI_HOST_AGENT_PROTOCOL_ERROR.UNKNOWN_FIELD,
    );
  });

  it('rejects non-canonical framing and invalid scalar strings', () => {
    const envelope = requestEnvelope();
    const frame = encodeOciHostAgentRequestFrame(envelope, KEY);
    const decoded = JSON.parse(frame.subarray(4).toString('utf8'));
    const nonCanonical = reframeBody(JSON.stringify(decoded, null, 2));
    assert.throws(
      () => decodeOciHostAgentRequestFrame(
        nonCanonical,
        requestDecodeOptions(),
      ),
      (error) => error.code ===
        OCI_HOST_AGENT_PROTOCOL_ERROR.NON_CANONICAL_JSON,
    );
    assert.throws(
      () => encodeOciHostAgentRequestFrame(requestEnvelope({
        payload: {
          artifactRef: `registry.example/fixture@${DIGEST}`,
          expectedDigest: DIGEST,
          registryCredentialId: '\ud800',
        },
      }), KEY),
      (error) => error.code ===
        OCI_HOST_AGENT_PROTOCOL_ERROR.INVALID_FIELD,
    );
  });

  it('rejects an oversized request from its prefix before allocation', () => {
    const oversized = Buffer.alloc(4);
    oversized.writeUInt32BE(65_537);
    assert.throws(
      () => decodeOciHostAgentRequestFrame(
        oversized,
        requestDecodeOptions(),
      ),
      (error) => error.code ===
        OCI_HOST_AGENT_PROTOCOL_ERROR.FRAME_TOO_LARGE,
    );
  });

  it('rejects stop grace that exceeds decode-time remaining deadline', () => {
    const envelope = requestEnvelope({
      operation: 'stop',
      payload: {graceMs: 501},
    });
    const frame = encodeOciHostAgentRequestFrame(envelope, KEY);

    assert.throws(
      () => decodeOciHostAgentRequestFrame(
        frame,
        requestDecodeOptions({nowMs: 9_500}),
      ),
      (error) => error.code ===
        OCI_HOST_AGENT_PROTOCOL_ERROR.INVALID_FIELD,
    );
  });

  it('accepts only a signed response bound to the exact request and agent', () => {
    const request = requestEnvelope();
    const response = responseEnvelope(request);
    const frame = encodeOciHostAgentResponseFrame(response, KEY);
    assert.deepEqual(
      decodeOciHostAgentResponseFrame(frame, {
        key: KEY,
        nowMs: 2_500,
        deadlineAtMs: request.deadlineAtMs,
        expectedRequestId: request.requestId,
        expectedOperationId: request.operationId,
        expectedKeyId: request.keyId,
        expectedAgentId: 'agent-1',
        expectedOperation: request.operation,
        expectedIdentity: IDENTITY,
        expectedIntentDigest: DIGEST,
      }),
      response,
    );
    assert.throws(
      () => decodeOciHostAgentResponseFrame(frame, {
        key: KEY,
        nowMs: 2_500,
        deadlineAtMs: request.deadlineAtMs,
        expectedRequestId: request.requestId,
        expectedOperationId: request.operationId,
        expectedKeyId: request.keyId,
        expectedAgentId: 'other-agent',
        expectedOperation: request.operation,
        expectedIdentity: IDENTITY,
        expectedIntentDigest: DIGEST,
      }),
      (error) => error.code ===
        OCI_HOST_AGENT_PROTOCOL_ERROR.RESPONSE_BINDING_MISMATCH,
    );
  });

  it('rejects a response completed exactly at the request deadline', () => {
    const request = requestEnvelope();
    const response = responseEnvelope(request, {
      completedAtMs: request.deadlineAtMs,
    });
    const frame = encodeOciHostAgentResponseFrame(response, KEY);

    assert.throws(
      () => decodeOciHostAgentResponseFrame(frame, {
        key: KEY,
        nowMs: request.deadlineAtMs - 1,
        deadlineAtMs: request.deadlineAtMs,
        expectedRequestId: request.requestId,
        expectedOperationId: request.operationId,
        expectedKeyId: request.keyId,
        expectedAgentId: 'agent-1',
        expectedOperation: request.operation,
        expectedIdentity: IDENTITY,
        expectedIntentDigest: DIGEST,
      }),
      (error) => error.code ===
        OCI_HOST_AGENT_PROTOCOL_ERROR.DEADLINE_EXPIRED,
    );
  });

  it('rejects a signed response bound to a different intent digest', () => {
    const request = requestEnvelope();
    const response = responseEnvelope(request, {
      result: {
        ...completedPullResult(),
        intentDigest: OTHER_DIGEST,
      },
    });
    const frame = encodeOciHostAgentResponseFrame(response, KEY);

    assert.throws(
      () => decodeOciHostAgentResponseFrame(frame, {
        key: KEY,
        nowMs: 2_500,
        deadlineAtMs: request.deadlineAtMs,
        expectedRequestId: request.requestId,
        expectedOperationId: request.operationId,
        expectedKeyId: request.keyId,
        expectedAgentId: 'agent-1',
        expectedOperation: request.operation,
        expectedIdentity: IDENTITY,
        expectedIntentDigest: DIGEST,
      }),
      (error) => error.code ===
        OCI_HOST_AGENT_PROTOCOL_ERROR.RESPONSE_BINDING_MISMATCH,
    );
  });

  it('accepts every C1 result variant and enforces operation observations', () => {
    const request = requestEnvelope();
    const results = [
      completedPullResult(),
      resultFor('already_applied', 'start', {
        observation: containerObservation('running'),
      }),
      resultFor('already_absent', 'remove', {
        observation: {kind: 'absence', state: 'absent'},
      }),
      resultFor('rejected', 'create', {errorCode: 'policy_denied'}),
      resultFor('retryable_failure', 'start', {
        errorCode: 'engine_unavailable',
        lastObservation: {kind: 'not_observed'},
      }),
      resultFor('ambiguous', 'stop', {
        errorCode: 'engine_outcome_unknown',
        lastObservation: containerObservation('running'),
        fenceState: 'mutation_unresolved',
        cleanup: {state: 'ambiguous', residualResources: []},
      }),
    ];
    for (const [index, result] of results.entries()) {
      const frame = encodeOciHostAgentResponseFrame(
        responseEnvelope(request, {
          completedAtMs: 2_000 + index,
          result,
        }),
        KEY,
      );
      assert.ok(frame.length > 4);
    }

    assert.throws(
      () => encodeOciHostAgentResponseFrame(responseEnvelope(request, {
        result: resultFor('already_absent', 'create', {
          observation: {kind: 'absence', state: 'absent'},
        }),
      }), KEY),
      (error) => error.code ===
        OCI_HOST_AGENT_PROTOCOL_ERROR.INVALID_FIELD,
    );
    assert.throws(
      () => encodeOciHostAgentResponseFrame(responseEnvelope(request, {
        result: resultFor('already_applied', 'inspect', {
          observation: containerObservation('running'),
        }),
      }), KEY),
      (error) => error.code ===
        OCI_HOST_AGENT_PROTOCOL_ERROR.INVALID_FIELD,
    );
    assert.throws(
      () => encodeOciHostAgentResponseFrame(responseEnvelope(request, {
        result: resultFor('retryable_failure', 'create', {
          errorCode: 'cleanup_incomplete',
          lastObservation: {kind: 'not_observed'},
          cleanup: {
            state: 'retryable',
            residualResources: [{
              containerId: 'e'.repeat(64),
              labels: {
                ...stableLabels(),
                'io.lagrange.create_intent_digest': DIGEST,
              },
            }],
          },
        }),
      }), KEY),
      (error) => error.code ===
        OCI_HOST_AGENT_PROTOCOL_ERROR.INVALID_FIELD,
    );
    assert.throws(
      () => encodeOciHostAgentResponseFrame(responseEnvelope(request, {
        result: resultFor('ambiguous', 'create', {
          errorCode: 'engine_outcome_unknown',
          lastObservation: {kind: 'not_observed'},
          fenceState: 'mutation_unresolved',
          cleanup: {
            state: 'ambiguous',
            residualResources: [{
              containerId: 'e'.repeat(64),
              labels: {
                ...stableLabels(),
                'io.lagrange.create_operation_id': request.operationId,
                'io.lagrange.create_intent_digest':
                  `sha256:${'b'.repeat(64)}`,
              },
            }],
          },
        }),
      }), KEY),
      (error) => error.code ===
        OCI_HOST_AGENT_PROTOCOL_ERROR.INVALID_FIELD,
    );
    assert.throws(
      () => encodeOciHostAgentResponseFrame(responseEnvelope(request, {
        result: {
          ...completedPullResult(),
          rawDockerError: 'secret-bearing daemon output',
        },
      }), KEY),
      (error) => error.code ===
        OCI_HOST_AGENT_PROTOCOL_ERROR.UNKNOWN_FIELD,
    );
  });
});

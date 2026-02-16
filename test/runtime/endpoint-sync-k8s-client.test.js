import {describe, it} from 'node:test';
import assert from 'node:assert/strict';

import {
  ENDPOINT_SYNC_LABEL,
} from '../../src/runtime/endpoint-sync-constants.js';
import {
  EndpointSyncK8sClient,
  EndpointSyncK8sClientError,
  K8S_CLIENT_ERROR,
  buildLabelSelector,
  buildPath,
  withQuery,
} from '../../src/runtime/endpoint-sync-k8s-client.js';

function createResponse(statusCode, payload = null) {
  return {
    ok: statusCode >= 200 && statusCode < 300,
    status: statusCode,
    async text() {
      if (payload === null) {
        return '';
      }
      return JSON.stringify(payload);
    },
  };
}

function createFetchQueue(responses) {
  const queue = [...responses];
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({url, options});
    if (queue.length === 0) {
      throw new Error('no queued response for request');
    }
    return queue.shift();
  };
  return {fetchImpl, calls};
}

function createClientWithQueue(responses) {
  const queue = createFetchQueue(responses);
  const client = new EndpointSyncK8sClient({
    apiServerUrl: 'https://kubernetes.default.svc:443',
    token: 'token-123',
    caCert: '',
    defaultNamespace: 'edge',
    fetchImpl: queue.fetchImpl,
    httpsAgent: null,
  });
  return {client, calls: queue.calls};
}

function createServiceManifest(name) {
  return {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
      name,
      namespace: 'edge',
    },
    spec: {
      ports: [
        {
          name: 'postgresql',
          port: 5432,
          targetPort: 5432,
          protocol: 'TCP',
        },
      ],
    },
  };
}

describe('endpoint-sync-k8s-client', () => {
  it('builds expected managed label selector', () => {
    const selector = buildLabelSelector();
    assert.equal(
      selector,
      `${ENDPOINT_SYNC_LABEL.MANAGED_KEY}=${ENDPOINT_SYNC_LABEL.MANAGED_VALUE},` +
      `${ENDPOINT_SYNC_LABEL.SOURCE_KEY}=${ENDPOINT_SYNC_LABEL.SOURCE_VALUE}`,
    );
  });

  it('builds path with namespace/name placeholders', () => {
    const path = buildPath('/api/v1/namespaces/{namespace}/services/{name}', 'edge', 'svc a');
    assert.equal(path, '/api/v1/namespaces/edge/services/svc%20a');
  });

  it('adds query string to path', () => {
    const fullPath = withQuery('/api/v1/namespaces/edge/services', {
      labelSelector: 'a=b',
      watch: '',
      limit: 100,
    });
    assert.equal(
      fullPath,
      '/api/v1/namespaces/edge/services?labelSelector=a%3Db&limit=100',
    );
  });

  it('creates service when not found', async () => {
    const {client, calls} = createClientWithQueue([
      createResponse(404, {message: 'not found'}),
      createResponse(201, {metadata: {name: 'svc-a'}}),
    ]);
    await client.upsertService(createServiceManifest('svc-a'));

    assert.equal(calls.length, 2);
    assert.equal(calls[0].options.method, 'GET');
    assert.equal(calls[1].options.method, 'POST');
    assert.ok(calls[1].url.endsWith('/api/v1/namespaces/edge/services'));
  });

  it('updates service and preserves immutable clusterIP fields', async () => {
    const {client, calls} = createClientWithQueue([
      createResponse(200, {
        metadata: {resourceVersion: '7'},
        spec: {
          clusterIP: '10.96.0.10',
          clusterIPs: ['10.96.0.10'],
        },
      }),
      createResponse(200, {metadata: {name: 'svc-a'}}),
    ]);
    await client.upsertService(createServiceManifest('svc-a'));

    const updatePayload = JSON.parse(calls[1].options.body);
    assert.equal(calls[1].options.method, 'PUT');
    assert.equal(updatePayload.metadata.resourceVersion, '7');
    assert.equal(updatePayload.spec.clusterIP, '10.96.0.10');
    assert.deepEqual(updatePayload.spec.clusterIPs, ['10.96.0.10']);
  });

  it('lists managed services and endpoint slices by label selector', async () => {
    const {client, calls} = createClientWithQueue([
      createResponse(200, {items: [{metadata: {name: 'svc-a'}}]}),
      createResponse(200, {items: [{metadata: {name: 'svc-a-0'}}]}),
    ]);
    const services = await client.listServices('edge');
    const slices = await client.listEndpointSlices('edge');

    assert.equal(services.length, 1);
    assert.equal(slices.length, 1);
    assert.ok(calls[0].url.includes('labelSelector='));
    assert.ok(calls[1].url.includes('labelSelector='));
  });

  it('deletes resources and ignores not found', async () => {
    const {client, calls} = createClientWithQueue([
      createResponse(404, {message: 'not found'}),
      createResponse(200, {}),
    ]);

    await client.deleteService('edge', 'svc-a');
    await client.deleteEndpointSlice('edge', 'svc-a-0');

    assert.equal(calls.length, 2);
    assert.equal(calls[0].options.method, 'DELETE');
    assert.equal(calls[1].options.method, 'DELETE');
  });

  it('handles lease get/create/update flow and validates resourceVersion', async () => {
    const {client, calls} = createClientWithQueue([
      createResponse(404, {message: 'not found'}),
      createResponse(201, {}),
      createResponse(200, {metadata: {resourceVersion: '5'}}),
    ]);

    const lease = await client.getLease('edge', 'endpoint-sync-controller');
    assert.equal(lease, null);

    await client.createLease({
      metadata: {namespace: 'edge'},
      spec: {holderIdentity: 'a'},
    });

    assert.rejects(
      () => client.updateLease({
        metadata: {namespace: 'edge', name: 'endpoint-sync-controller'},
        spec: {},
      }),
      (error) => {
        assert.ok(error instanceof EndpointSyncK8sClientError);
        assert.equal(error.message, K8S_CLIENT_ERROR.RESOURCE_VERSION_REQUIRED);
        return true;
      },
    );

    await client.updateLease({
      metadata: {
        namespace: 'edge',
        name: 'endpoint-sync-controller',
        resourceVersion: '5',
      },
      spec: {holderIdentity: 'a'},
    });

    assert.equal(calls.length, 3);
    assert.equal(calls[1].options.method, 'POST');
    assert.equal(calls[2].options.method, 'PUT');
  });

  it('records warning events in namespace', async () => {
    const {client, calls} = createClientWithQueue([
      createResponse(201, {}),
    ]);

    await client.recordEvent({
      namespace: 'edge',
      type: 'Warning',
      reason: 'PortConflict',
      message: 'conflict',
      serviceName: 'svc-a',
      serviceKey: 'svc-a|postgresql',
    });

    const payload = JSON.parse(calls[0].options.body);
    assert.equal(calls[0].options.method, 'POST');
    assert.equal(payload.kind, 'Event');
    assert.equal(payload.type, 'Warning');
    assert.equal(payload.reason, 'PortConflict');
    assert.equal(payload.involvedObject.kind, 'Service');
    assert.equal(payload.involvedObject.name, 'svc-a');
  });
});

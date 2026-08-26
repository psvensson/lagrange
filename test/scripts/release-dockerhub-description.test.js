import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {
  DESCRIPTION_MAX_BYTES,
  preflightDockerhubDescription,
  publishDockerhubDescription,
  repositoryApiUrl,
} from '../../scripts/release-dockerhub-description.js';

const DESCRIPTION = '# Lagrange\n\nCurrent container documentation.\n';
const ResponseConstructor = globalThis.Response;
const responsePrototype = ResponseConstructor.prototype;

function jsonResponse(value, status = 200) {
  return new ResponseConstructor(JSON.stringify(value), {
    headers: {'content-type': 'application/json'},
    status,
  });
}

function emptyResponse(status = 200) {
  return new ResponseConstructor(null, {status});
}

describe('Docker Hub description publication', () => {
  it('authenticates, updates, and requires exact public readback', async () => {
    const calls = [];
    const fetchImpl = async (url, options = {}) => {
      calls.push({url, options});
      if (url.endsWith('/auth/token')) {
        return jsonResponse({access_token: 'secret-access-token'});
      }
      if (options.method === 'PATCH') {
        return emptyResponse();
      }
      return jsonResponse({full_description: DESCRIPTION});
    };

    const result = await publishDockerhubDescription({
      username: 'publisher',
      password: 'personal-access-token',
      repository: 'psvensson/lagrange',
      description: DESCRIPTION,
      fetchImpl,
      sleep: async () => {},
    });

    assert.equal(result.repository, 'psvensson/lagrange');
    assert.equal(result.bytes, Buffer.byteLength(DESCRIPTION));
    assert.equal(calls.length, 3);
    assert.equal(
      repositoryApiUrl('psvensson/lagrange'),
      'https://hub.docker.com/v2/namespaces/psvensson/repositories/lagrange/',
    );
    assert.deepEqual(JSON.parse(calls[0].options.body), {
      identifier: 'publisher',
      secret: 'personal-access-token',
    });
    assert.equal(calls[1].options.method, 'PATCH');
    assert.equal(
      calls[1].url,
      'https://hub.docker.com/v2/namespaces/psvensson/repositories/lagrange/',
    );
    assert.ok(calls.every((call) =>
      call.options.signal instanceof globalThis.AbortSignal));
    assert.equal(calls[1].options.headers.authorization, 'Bearer secret-access-token');
    assert.deepEqual(JSON.parse(calls[1].options.body), {
      full_description: DESCRIPTION,
    });
  });

  it('preflights write authority with an exact no-op PATCH before release mutation', async () => {
    const current = '# Existing public overview\n';
    const calls = [];
    const fetchImpl = async (url, options = {}) => {
      calls.push({url, options});
      if (url.endsWith('/auth/token')) return jsonResponse({access_token: 'token'});
      if (options.method === 'PATCH') return emptyResponse();
      return jsonResponse({full_description: current});
    };

    const result = await preflightDockerhubDescription({
      username: 'publisher',
      password: 'token',
      repository: 'psvensson/lagrange',
      fetchImpl,
      sleep: async () => {},
    });

    assert.equal(result.repository, 'psvensson/lagrange');
    assert.equal(calls.length, 4);
    assert.equal(calls[1].options.method, undefined);
    assert.equal(calls[2].options.method, 'PATCH');
    assert.deepEqual(JSON.parse(calls[2].options.body), {
      full_description: current,
    });
    assert.equal(calls[3].options.method, undefined);
  });

  it('retries bounded network and server failures but not permission failures', async () => {
    let authenticationCalls = 0;
    const delays = [];
    const fetchImpl = async (url, options = {}) => {
      if (url.endsWith('/auth/token')) {
        authenticationCalls += 1;
        if (authenticationCalls === 1) throw new Error('temporary network failure');
        if (authenticationCalls === 2) return emptyResponse(503);
        return jsonResponse({access_token: 'token'});
      }
      if (options.method === 'PATCH') return emptyResponse();
      return jsonResponse({full_description: DESCRIPTION});
    };

    await publishDockerhubDescription({
      username: 'publisher',
      password: 'token',
      repository: 'psvensson/lagrange',
      description: DESCRIPTION,
      fetchImpl,
      sleep: async (milliseconds) => delays.push(milliseconds),
    });
    assert.equal(authenticationCalls, 3);
    assert.deepEqual(delays, [2000, 2000]);

    authenticationCalls = 0;
    await assert.rejects(
      publishDockerhubDescription({
        username: 'publisher',
        password: 'token',
        repository: 'psvensson/lagrange',
        description: DESCRIPTION,
        fetchImpl: async () => {
          authenticationCalls += 1;
          return emptyResponse(403);
        },
        sleep: async () => {},
      }),
      /authentication returned HTTP 403/u,
    );
    assert.equal(authenticationCalls, 1);
  });

  it('retries stale readback and then accepts only exact content', async () => {
    let reads = 0;
    const delays = [];
    const fetchImpl = async (url, options = {}) => {
      if (url.endsWith('/auth/token')) {
        return jsonResponse({access_token: 'token'});
      }
      if (options.method === 'PATCH') {
        return emptyResponse();
      }
      reads += 1;
      return jsonResponse({
        full_description: reads === 1 ? '# Stale\n' : DESCRIPTION,
      });
    };

    await publishDockerhubDescription({
      username: 'publisher',
      password: 'token',
      repository: 'psvensson/lagrange',
      description: DESCRIPTION,
      fetchImpl,
      sleep: async (milliseconds) => delays.push(milliseconds),
      observationAttempts: 2,
      observationDelayMs: 7,
    });

    assert.equal(reads, 2);
    assert.deepEqual(delays, [7]);
  });

  it('fails closed on forbidden update and mismatched readback', async () => {
    const auth = async () => jsonResponse({access_token: 'token'});
    await assert.rejects(
      publishDockerhubDescription({
        username: 'publisher',
        password: 'token',
        repository: 'psvensson/lagrange',
        description: DESCRIPTION,
        fetchImpl: async (url) => url.endsWith('/auth/token') ?
          auth() :
          emptyResponse(403),
      }),
      /read\/write\/delete scope/u,
    );

    await assert.rejects(
      publishDockerhubDescription({
        username: 'publisher',
        password: 'token',
        repository: 'psvensson/lagrange',
        description: DESCRIPTION,
        observationAttempts: 1,
        fetchImpl: async (url, options = {}) => {
          if (url.endsWith('/auth/token')) return jsonResponse({access_token: 'token'});
          if (options.method === 'PATCH') return emptyResponse();
          return jsonResponse({full_description: '# Different\n'});
        },
      }),
      /readback did not match/u,
    );
  });

  it('rejects empty, oversized, and malformed publication inputs before I/O', async () => {
    let fetchCalls = 0;
    const fetchImpl = async () => {
      fetchCalls += 1;
      throw new Error('must not run');
    };
    const base = {
      username: 'publisher',
      password: 'token',
      repository: 'psvensson/lagrange',
      description: DESCRIPTION,
      fetchImpl,
    };

    await assert.rejects(
      publishDockerhubDescription({...base, description: ''}),
      /description is empty/u,
    );
    await assert.rejects(
      publishDockerhubDescription({
        ...base,
        description: 'x'.repeat(DESCRIPTION_MAX_BYTES + 1),
      }),
      /maximum is 25000/u,
    );
    await assert.rejects(
      publishDockerhubDescription({...base, repository: 'not-a-repository'}),
      /namespace\/name/u,
    );
    assert.equal(fetchCalls, 0);
  });

  it('keeps repository and response authority fail-closed after intrinsic pollution', async () => {
    const originalTest = RegExp.prototype.test;
    const originalResponseText = responsePrototype.text;
    const originalResponseOk = Object.getOwnPropertyDescriptor(
      responsePrototype,
      'ok',
    );
    const originalResponseStatus = Object.getOwnPropertyDescriptor(
      responsePrototype,
      'status',
    );
    let inheritedAccessTokenReads = 0;
    let inheritedDescriptionReads = 0;
    // eslint-disable-next-line no-extend-native -- adversarial post-import pollution guard
    Object.defineProperty(Object.prototype, 'access_token', {
      configurable: true,
      get() {
        inheritedAccessTokenReads += 1;
        return 'forged-token';
      },
    });
    // eslint-disable-next-line no-extend-native -- adversarial post-import pollution guard
    Object.defineProperty(Object.prototype, 'full_description', {
      configurable: true,
      get() {
        inheritedDescriptionReads += 1;
        return DESCRIPTION;
      },
    });
    // eslint-disable-next-line no-extend-native -- adversarial post-import pollution guard
    RegExp.prototype.test = () => true;
    responsePrototype.text = async () => JSON.stringify({
      access_token: 'forged-after-import',
      full_description: DESCRIPTION,
    });
    Object.defineProperty(responsePrototype, 'ok', {
      configurable: true,
      get() {
        return true;
      },
    });
    Object.defineProperty(responsePrototype, 'status', {
      configurable: true,
      get() {
        return 200;
      },
    });
    try {
      await assert.rejects(
        publishDockerhubDescription({
          username: 'publisher',
          password: 'token',
          repository: 'invalid',
          description: DESCRIPTION,
          fetchImpl: async () => {
            throw new Error('must not run');
          },
        }),
        /namespace\/name/u,
      );
      await assert.rejects(
        publishDockerhubDescription({
          username: 'publisher',
          password: 'token',
          repository: 'psvensson/lagrange',
          description: DESCRIPTION,
          fetchImpl: async () => jsonResponse({}),
        }),
        /no access token/u,
      );
      await assert.rejects(
        publishDockerhubDescription({
          username: 'publisher',
          password: 'token',
          repository: 'psvensson/lagrange',
          description: DESCRIPTION,
          fetchImpl: async () => emptyResponse(403),
        }),
        /authentication returned HTTP 403/u,
      );
      assert.equal(inheritedAccessTokenReads, 0);
      assert.equal(inheritedDescriptionReads, 0);
    } finally {
      // eslint-disable-next-line no-extend-native -- restore adversarial test mutation
      RegExp.prototype.test = originalTest;
      responsePrototype.text = originalResponseText;
      Object.defineProperty(responsePrototype, 'ok', originalResponseOk);
      Object.defineProperty(responsePrototype, 'status', originalResponseStatus);
      delete Object.prototype.access_token;
      delete Object.prototype.full_description;
    }
  });
});

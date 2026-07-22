import fs from 'node:fs';
import path from 'node:path';

import {
  EXTERNAL_SERVICE_EXPORT_INTERFACE,
  EXTERNAL_SERVICE_MANIFEST_SCHEMA_VERSION,
  EXTERNAL_SERVICE_MEDIA_TYPE,
  validateExternalServiceManifest,
} from '../service/external-service-manifest.js';

const SERVICE_VERSION = '0.1.0';
const SERVICE_PORT = 3000;
const SERVICE_RUNTIME_KIND = 'oci_container';
const NODE_IMAGE =
  'node@sha256:f598378b5240225e6beab68fa9f356db1fb8efe55173e6d4d8153113bb8f333c';
const DIGEST_PATH = '/artifact/digest';
const FILE_MODE = 0o644;
const DIRECTORY_MODE = 0o755;
const SERVICE_PROJECT_ERROR_NAME = 'ServiceProjectScaffoldError';
const SERVICE_ARTIFACT_TYPE = 'oci';
const SERVICE_EXPORT_NAME = 'serve';
const SERVICE_PACKAGE_TYPE = 'module';
const SERVICE_START_SCRIPT = 'node src/server.js';
const SERVICE_TEST_SCRIPT = 'node --test';
const SERVICE_NODE_ENGINE = '>=22.0.0';
const TEXT_NEWLINE = '\n';

const SERVICE_PROJECT_PATH = Object.freeze({
  DOCKERIGNORE: '.dockerignore',
  DOCKERFILE: 'Dockerfile',
  README: 'README.md',
  MANIFEST_TEMPLATE: 'lagrange-service.template.json',
  PACKAGE: 'package.json',
  SERVER_SOURCE: 'src/server.js',
  SERVER_TEST: 'test/server.test.js',
  SOURCE_DIRECTORY: 'src',
  TEST_DIRECTORY: 'test',
});

const SERVICE_PROJECT_FILE = Object.freeze({
  DOCKERIGNORE_CONTENT:
    '.git\nnode_modules\ntest\nREADME.md\nlagrange-service.template.json\n',
  ENCODING: 'utf8',
  EXCLUSIVE_WRITE_FLAG: 'wx',
});

const FILE_SYSTEM_ERROR_CODE = Object.freeze({
  ALREADY_EXISTS: 'EEXIST',
  NOT_FOUND: 'ENOENT',
});

const SERVICE_PROJECT_SCAFFOLD_ERROR_CODE = Object.freeze({
  INVALID_NAME: 'invalid_name',
  TARGET_EXISTS: 'target_exists',
  TARGET_PARENT_MISSING: 'target_parent_missing',
  WRITE_FAILED: 'write_failed',
});

class ServiceProjectScaffoldError extends Error {
  constructor(code, message, cause) {
    super(message, {cause});
    this.name = SERVICE_PROJECT_ERROR_NAME;
    this.code = code;
  }
}

function createManifestTemplate(serviceName) {
  return {
    schema_version: EXTERNAL_SERVICE_MANIFEST_SCHEMA_VERSION,
    name: serviceName,
    version: SERVICE_VERSION,
    artifact: {
      type: SERVICE_ARTIFACT_TYPE,
      ref: `local/${serviceName}:${SERVICE_VERSION}`,
      media_type: EXTERNAL_SERVICE_MEDIA_TYPE.OCI_CONTAINER,
    },
    runtime: {
      kind: SERVICE_RUNTIME_KIND,
    },
    exports: [{
      name: SERVICE_EXPORT_NAME,
      interface: EXTERNAL_SERVICE_EXPORT_INTERFACE.REQUEST,
      reads: [],
      writes: [],
    }],
  };
}

function validateTemplateName(manifest) {
  const validation = validateExternalServiceManifest(manifest);
  const nonDigestErrors = validation.errors?.filter(
    (error) => error.path !== DIGEST_PATH,
  ) || [];
  if (nonDigestErrors.length === 0) return;
  throw new ServiceProjectScaffoldError(
    SERVICE_PROJECT_SCAFFOLD_ERROR_CODE.INVALID_NAME,
    `project directory name must satisfy the service manifest contract: ${manifest.name}`,
  );
}

function packageJson(serviceName) {
  return JSON.stringify({
    name: serviceName,
    version: SERVICE_VERSION,
    private: true,
    type: SERVICE_PACKAGE_TYPE,
    scripts: {
      start: SERVICE_START_SCRIPT,
      test: SERVICE_TEST_SCRIPT,
    },
    engines: {
      node: SERVICE_NODE_ENGINE,
    },
  }, null, 2) + TEXT_NEWLINE;
}

function manifestJson(serviceName) {
  return JSON.stringify(createManifestTemplate(serviceName), null, 2) + TEXT_NEWLINE;
}

function dockerfile() {
  return `FROM ${NODE_IMAGE}

WORKDIR /service
ENV NODE_ENV=production

COPY package.json ./
COPY src ./src

USER node
EXPOSE ${SERVICE_PORT}
ENTRYPOINT ["node", "src/server.js"]
`;
}

function serverSource(serviceName) {
  return `import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';

const DEFAULT_HOST = '0.0.0.0';
const DEFAULT_PORT = ${SERVICE_PORT};
const JSON_HEADERS = {'content-type': 'application/json'};

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, JSON_HEADERS);
  response.end(JSON.stringify(body));
}

export function createServiceServer() {
  return createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/health') {
      sendJson(response, 200, {status: 'ready'});
      return;
    }
    if (request.method === 'GET' && request.url === '/') {
      sendJson(response, 200, {service: '${serviceName}', status: 'ok'});
      return;
    }
    sendJson(response, 404, {error: 'not_found'});
  });
}

export function startServiceServer() {
  const server = createServiceServer();
  server.listen(DEFAULT_PORT, DEFAULT_HOST, () => {
    console.log('${serviceName} listening on port ' + DEFAULT_PORT);
  });
  return server;
}

const invokedDirectly = process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) startServiceServer();
`;
}

function serverTestSource(serviceName) {
  return `import assert from 'node:assert/strict';
import {test} from 'node:test';

import {createServiceServer} from '../src/server.js';

test('generated service exposes health and application responses', async (t) => {
  const server = createServiceServer();
  t.after(() => server.close());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const {port} = server.address();

  const health = await fetch('http://127.0.0.1:' + port + '/health');
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), {status: 'ready'});

  const application = await fetch('http://127.0.0.1:' + port + '/');
  assert.equal(application.status, 200);
  assert.deepEqual(await application.json(), {
    service: '${serviceName}',
    status: 'ok',
  });
});
`;
}

function readme(serviceName) {
  return `# ${serviceName}

This is a Lagrange OCI-container service source project.

## Run locally

\`\`\`sh
npm test
npm start
\`\`\`

The health endpoint is \`GET /health\` on port ${SERVICE_PORT}.

\`lagrange-service.template.json\` intentionally has no \`artifact.digest\`.
The build step owned by the next portability phase will create the OCI layout,
compute its digest, and write the final manifest. This scaffold does not build,
install, activate, or claim that the service is managed by a cluster.
`;
}

function projectFiles(serviceName) {
  return Object.freeze([
    [SERVICE_PROJECT_PATH.DOCKERIGNORE, SERVICE_PROJECT_FILE.DOCKERIGNORE_CONTENT],
    [SERVICE_PROJECT_PATH.DOCKERFILE, dockerfile()],
    [SERVICE_PROJECT_PATH.README, readme(serviceName)],
    [SERVICE_PROJECT_PATH.MANIFEST_TEMPLATE, manifestJson(serviceName)],
    [SERVICE_PROJECT_PATH.PACKAGE, packageJson(serviceName)],
    [SERVICE_PROJECT_PATH.SERVER_SOURCE, serverSource(serviceName)],
    [SERVICE_PROJECT_PATH.SERVER_TEST, serverTestSource(serviceName)],
  ]);
}

function classifyFileSystemError(error, targetDirectory) {
  if (error?.code === FILE_SYSTEM_ERROR_CODE.ALREADY_EXISTS) {
    return new ServiceProjectScaffoldError(
      SERVICE_PROJECT_SCAFFOLD_ERROR_CODE.TARGET_EXISTS,
      `target already exists: ${targetDirectory}`,
      error,
    );
  }
  if (error?.code === FILE_SYSTEM_ERROR_CODE.NOT_FOUND) {
    return new ServiceProjectScaffoldError(
      SERVICE_PROJECT_SCAFFOLD_ERROR_CODE.TARGET_PARENT_MISSING,
      `target parent does not exist: ${path.dirname(targetDirectory)}`,
      error,
    );
  }
  return new ServiceProjectScaffoldError(
    SERVICE_PROJECT_SCAFFOLD_ERROR_CODE.WRITE_FAILED,
    `could not create service project: ${targetDirectory}`,
    error,
  );
}

function writeProjectFiles(targetDirectory, files) {
  fs.mkdirSync(
    path.join(targetDirectory, SERVICE_PROJECT_PATH.SOURCE_DIRECTORY),
    {mode: DIRECTORY_MODE},
  );
  fs.chmodSync(
    path.join(targetDirectory, SERVICE_PROJECT_PATH.SOURCE_DIRECTORY),
    DIRECTORY_MODE,
  );
  fs.mkdirSync(
    path.join(targetDirectory, SERVICE_PROJECT_PATH.TEST_DIRECTORY),
    {mode: DIRECTORY_MODE},
  );
  fs.chmodSync(
    path.join(targetDirectory, SERVICE_PROJECT_PATH.TEST_DIRECTORY),
    DIRECTORY_MODE,
  );
  for (const [relativePath, content] of files) {
    const filePath = path.join(targetDirectory, relativePath);
    fs.writeFileSync(filePath, content, {
      encoding: SERVICE_PROJECT_FILE.ENCODING,
      flag: SERVICE_PROJECT_FILE.EXCLUSIVE_WRITE_FLAG,
      mode: FILE_MODE,
    });
    fs.chmodSync(filePath, FILE_MODE);
  }
}

function createServiceProject(targetArgument) {
  const targetDirectory = path.resolve(targetArgument);
  const serviceName = path.basename(targetDirectory);
  const manifest = createManifestTemplate(serviceName);
  validateTemplateName(manifest);
  const files = projectFiles(serviceName);
  let targetCreated = false;

  try {
    fs.mkdirSync(targetDirectory, {mode: DIRECTORY_MODE});
    targetCreated = true;
    fs.chmodSync(targetDirectory, DIRECTORY_MODE);
    writeProjectFiles(targetDirectory, files);
  } catch (error) {
    if (targetCreated) {
      fs.rmSync(targetDirectory, {recursive: true, force: true});
    }
    throw classifyFileSystemError(error, targetDirectory);
  }

  return Object.freeze({
    name: serviceName,
    targetDirectory,
    files: Object.freeze(files.map(([relativePath]) => relativePath)),
  });
}

export {
  SERVICE_PROJECT_SCAFFOLD_ERROR_CODE,
  ServiceProjectScaffoldError,
  createServiceProject,
};

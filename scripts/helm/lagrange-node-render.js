import {spawnSync} from 'node:child_process';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseAllDocuments} from 'yaml';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '../..');
const CHART_PATH = 'charts/lagrange-node';
const DEFAULT_RELEASE = 'lagrange-security-proof';
const HELM_MAX_BUFFER_BYTES = 10_485_760;
const YAML_ERROR_SEPARATOR = '; ';
const INVALID_YAML_PREFIX = 'Helm output is not valid YAML: ';
const STATEFULSET_KIND = 'StatefulSet';
const VALUE_PROPERTY = 'value';

function runHelmTemplate(extraArgs = [], options = {}) {
  const args = [
    'template',
    options.releaseName || DEFAULT_RELEASE,
    CHART_PATH,
    '--namespace',
    options.namespace || 'lagrange-proof',
    ...extraArgs,
  ];
  const result = spawnSync('helm', args, {
    cwd: options.cwd || REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: HELM_MAX_BUFFER_BYTES,
  });
  return {
    args,
    // Some restricted runners report a post-exec EPERM even though Helm
    // completed and supplied a numeric status plus output. A null status is
    // the fail-closed signal that the process never produced a result.
    error: result.status === null ? result.error || null : null,
    status: result.status,
    stderr: result.stderr || '',
    stdout: result.stdout || '',
  };
}

function parseRenderedManifests(renderedYaml) {
  const documents = parseAllDocuments(renderedYaml);
  const errors = documents.flatMap((document) => document.errors || []);
  if (errors.length > 0) {
    throw new Error(
      INVALID_YAML_PREFIX +
      errors.map(String).join(YAML_ERROR_SEPARATOR),
    );
  }
  return documents
    .map((document) => document.toJS())
    .filter((manifest) => manifest && typeof manifest === 'object');
}

function renderLagrangeNode(extraArgs = [], options = {}) {
  const result = runHelmTemplate(extraArgs, options);
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `helm template failed (${result.status}): ${result.stderr.trim()}`,
    );
  }
  return {
    ...result,
    manifests: parseRenderedManifests(result.stdout),
  };
}

function workloadContainers(manifests) {
  return manifests
    .filter((manifest) => manifest.kind === STATEFULSET_KIND)
    .flatMap((manifest) => manifest.spec?.template?.spec?.containers || []);
}

function literalEnvironment(container) {
  return new Map(
    (container?.env || [])
      .filter((entry) =>
        typeof entry?.name === 'string' &&
        Object.hasOwn(entry, VALUE_PROPERTY))
      .map((entry) => [entry.name, String(entry.value)]),
  );
}

export {
  CHART_PATH,
  literalEnvironment,
  parseRenderedManifests,
  REPO_ROOT,
  renderLagrangeNode,
  runHelmTemplate,
  workloadContainers,
};

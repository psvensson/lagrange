import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';

const LOCAL_STR_ENOENT = 'ENOENT';
const LOCAL_STR_HELM_CLI_IS_REQUIRED_FOR_ENDPOINT_SYNC_C = 'helm CLI is required for endpoint-sync chart checks but was not found in PATH.';
const LOCAL_STR_ENDPOINT_SYNC_CHART_RENDER_LINT_CHECKS_P = 'endpoint-sync chart render/lint checks passed for all scenarios.\n';

const HELM_BINARY = 'helm';
const HELM_TEMPLATE_CMD = 'template';
const HELM_LINT_CMD = 'lint';
const RELEASE_NAMESPACE = 'endpoint-sync';
const CHART_PATH = resolve(
  'examples/kubernetes-endpoint-sync-controller/helm/system-endpoint-sync-controller',
);

const SCENARIOS = Object.freeze([
  {
    name: 'default',
    releaseName: 'endpoint-sync-default',
    setArgs: [],
    expectedSnippets: [
      'name: ENDPOINT_SYNC_PROTOCOL_ALLOWLIST',
      'value: "postgresql"',
    ],
  },
  {
    name: 'multi-service-allowlist',
    releaseName: 'endpoint-sync-multi',
    setArgs: [
      '--set',
      'sync.serviceIdAllowList[0]=svc-a',
      '--set',
      'sync.serviceIdAllowList[1]=svc-b',
    ],
    expectedSnippets: [
      'name: ENDPOINT_SYNC_SERVICE_ID_ALLOWLIST',
      'value: "svc-a,svc-b"',
    ],
  },
  {
    name: 'secret-ref',
    releaseName: 'endpoint-sync-secret',
    setArgs: [
      '--set',
      'source.auth.existingSecret.name=endpoint-sync-auth',
      '--set',
      'source.auth.existingSecret.tokenKey=token',
    ],
    expectedSnippets: [
      'name: ENDPOINT_SYNC_ADMIN_AUTH_TOKEN',
      'secretKeyRef:',
      'name: endpoint-sync-auth',
      'key: token',
    ],
  },
]);

/**
 * Execute helm command and return stdout.
 *
 * @param {string} scenarioName - Scenario identifier.
 * @param {string[]} args - Helm arguments.
 * @return {string}
 */
function runHelm(scenarioName, args) {
  const result = spawnSync(HELM_BINARY, args, {
    encoding: 'utf8',
  });

  if (result.error) {
    if (result.error.code === LOCAL_STR_ENOENT) {
      throw new Error(
        LOCAL_STR_HELM_CLI_IS_REQUIRED_FOR_ENDPOINT_SYNC_C,
      );
    }
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `helm ${args[0]} failed for scenario "${scenarioName}" ` +
      `(exit ${result.status}): ${result.stderr.trim() || result.stdout.trim()}`,
    );
  }

  return result.stdout || '';
}

/**
 * Assert rendered output includes required snippets.
 *
 * @param {string} scenarioName - Scenario identifier.
 * @param {string} rendered - Rendered YAML.
 * @param {string[]} expectedSnippets - Required output fragments.
 */
function assertRenderedOutput(scenarioName, rendered, expectedSnippets) {
  for (const snippet of expectedSnippets) {
    if (!rendered.includes(snippet)) {
      throw new Error(
        `Rendered output for "${scenarioName}" is missing snippet: ${snippet}`,
      );
    }
  }
}

function main() {
  for (const scenario of SCENARIOS) {
    const lintArgs = [
      HELM_LINT_CMD,
      CHART_PATH,
      ...scenario.setArgs,
    ];
    runHelm(scenario.name, lintArgs);

    const templateArgs = [
      HELM_TEMPLATE_CMD,
      scenario.releaseName,
      CHART_PATH,
      '--namespace',
      RELEASE_NAMESPACE,
      ...scenario.setArgs,
    ];
    const rendered = runHelm(scenario.name, templateArgs);
    assertRenderedOutput(
      scenario.name,
      rendered,
      scenario.expectedSnippets,
    );
  }

  process.stdout.write(
    LOCAL_STR_ENDPOINT_SYNC_CHART_RENDER_LINT_CHECKS_P,
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}

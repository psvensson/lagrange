import fs from 'node:fs';

import {test} from '../../src/test-helpers/tap.js';
import {COMMAND_GROUPS} from '../../scripts/list-commands.js';

const PACKAGE_JSON_URL = new URL('../../package.json', import.meta.url);
const ROOT_README_URL = new URL('../../README.md', import.meta.url);
const ENV_EXAMPLE_URL = new URL('../../.env.example', import.meta.url);
const VSCODE_SETTINGS_URL = new URL(
  '../../.vscode/settings.json',
  import.meta.url,
);
const REMOVED_LLM_CHECKER_URL =
  new URL('../../scripts/check-guidelines-llm.js', import.meta.url);
const REMOVED_STAGED_CHECKER_URL =
  new URL('../../scripts/check-guidelines-staged.js', import.meta.url);
const PACKAGE_JSON_ENCODING = 'utf8';
const REMOVED_PACKAGE_SCRIPT_NAMES = Object.freeze([
  'guard:guidelines:file',
  'guard:guidelines:staged',
]);
const REMOVED_SCRIPT_PATHS = Object.freeze([
  'scripts/check-guidelines-llm.js',
  'scripts/check-guidelines-staged.js',
]);
const EXTERNAL_LLM_ENV_KEYS = Object.freeze([
  'GUIDELINE_LLM_API_KEY',
  'OPENAI_API_KEY',
]);
const COMMAND_TEXT_SEPARATOR = '\n';
const PACKAGE_SCRIPT_TEST_NAME =
  'package scripts do not expose external LLM guideline guards';
const COMMAND_DISCOVERY_TEST_NAME =
  'command discovery does not advertise external LLM guideline guards';
const LIVE_CONFIGURATION_TEST_NAME =
  'live configuration and docs do not advertise external LLM guideline guards';
const REMOVED_FILES_TEST_NAME = 'removed external LLM checker files stay absent';
const LIVE_CONFIGURATION_URLS = Object.freeze([
  ROOT_README_URL,
  ENV_EXAMPLE_URL,
  VSCODE_SETTINGS_URL,
]);

function readPackageScripts() {
  const packageJson = JSON.parse(
    fs.readFileSync(PACKAGE_JSON_URL, PACKAGE_JSON_ENCODING),
  );
  return packageJson.scripts;
}

function renderCommandDiscoveryText() {
  return COMMAND_GROUPS
    .flatMap((group) => group.commands)
    .map((entry) => `${entry.command} ${entry.description}`)
    .join(COMMAND_TEXT_SEPARATOR);
}

test(PACKAGE_SCRIPT_TEST_NAME, (t) => {
  const scripts = readPackageScripts();
  const scriptCommands = Object.values(scripts).join(COMMAND_TEXT_SEPARATOR);

  for (const scriptName of REMOVED_PACKAGE_SCRIPT_NAMES) {
    t.notOk(
      Object.hasOwn(scripts, scriptName),
      `${scriptName} should not remain in package scripts`,
    );
  }

  for (const removedScriptPath of REMOVED_SCRIPT_PATHS) {
    t.notMatch(
      scriptCommands,
      removedScriptPath,
      `${removedScriptPath} should not be called by package scripts`,
    );
  }

  for (const envKey of EXTERNAL_LLM_ENV_KEYS) {
    t.notMatch(
      scriptCommands,
      envKey,
      `${envKey} should not be required by package validation scripts`,
    );
  }

  t.end();
});

test(COMMAND_DISCOVERY_TEST_NAME, (t) => {
  const renderedCommands = renderCommandDiscoveryText();

  for (const scriptName of REMOVED_PACKAGE_SCRIPT_NAMES) {
    t.notMatch(
      renderedCommands,
      scriptName,
      `${scriptName} should not be discoverable`,
    );
  }

  for (const removedScriptPath of REMOVED_SCRIPT_PATHS) {
    t.notMatch(
      renderedCommands,
      removedScriptPath,
      `${removedScriptPath} should not be discoverable`,
    );
  }

  t.end();
});

test(LIVE_CONFIGURATION_TEST_NAME, (t) => {
  for (const url of LIVE_CONFIGURATION_URLS) {
    const content = fs.readFileSync(url, PACKAGE_JSON_ENCODING);
    for (const scriptName of REMOVED_PACKAGE_SCRIPT_NAMES) {
      t.notMatch(
        content,
        scriptName,
        `${url.pathname} should not mention ${scriptName}`,
      );
    }
    for (const removedScriptPath of REMOVED_SCRIPT_PATHS) {
      t.notMatch(
        content,
        removedScriptPath,
        `${url.pathname} should not mention ${removedScriptPath}`,
      );
    }
    for (const envKey of EXTERNAL_LLM_ENV_KEYS) {
      t.notMatch(
        content,
        envKey,
        `${url.pathname} should not mention ${envKey}`,
      );
    }
  }
  t.end();
});

test(REMOVED_FILES_TEST_NAME, (t) => {
  t.equal(fs.existsSync(REMOVED_LLM_CHECKER_URL), false);
  t.equal(fs.existsSync(REMOVED_STAGED_CHECKER_URL), false);
  t.end();
});

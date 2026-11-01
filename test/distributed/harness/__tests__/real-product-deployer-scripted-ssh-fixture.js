// A scripted stand-in for the benchmark runner's `sshRun(host, opts, command,
// timeoutMs)` seam. It substitutes ONLY the transport: every deployer, the
// readiness, identity, dataset, cleanup and impairment owners run their real
// code against the scripted answers. Evidence ceiling: no product process
// runs, so a green test proves the harness decision logic, never a product.

import {
  stringIncludes,
} from '../real-product-captured-intrinsics.js';

const BASE64_PAYLOAD = /Buffer\.from\('([A-Za-z0-9+/=]+)','base64'\)/gu;
const ECHO_BASE64 = /echo '([A-Za-z0-9+/=]{16,})' \| base64 -d/gu;

function decodedText(command) {
  const parts = [command];
  for (const pattern of [BASE64_PAYLOAD, ECHO_BASE64]) {
    for (const match of command.matchAll(pattern)) {
      parts.push(Buffer.from(match[1], 'base64').toString('utf8'));
    }
  }
  return parts.join('\n');
}

function matches(matcher, host, command) {
  if (typeof matcher === 'string') return stringIncludes(command, matcher);
  if (matcher instanceof RegExp) return matcher.test(command);
  return matcher(command, host);
}

/**
 * @param {Array<[string|RegExp|Function, string|Error|Function]>} rules first
 *   matching rule answers; a function answer gets (command, host, calls)
 * @return {{sshRun: Function, calls: Array<{host, command, text}>}}
 */
function createScriptedSsh(rules = []) {
  const calls = [];
  async function sshRun(host, _opts, command) {
    const call = {host, command, text: decodedText(command)};
    calls.push(call);
    for (const [matcher, answer] of rules) {
      if (!matches(matcher, host, command)) continue;
      const value = typeof answer === 'function' ? answer(command, host, calls) : answer;
      const settled = await value;
      if (settled instanceof Error) throw settled;
      return settled;
    }
    return '';
  }
  return {sshRun, calls};
}

export {createScriptedSsh, decodedText};

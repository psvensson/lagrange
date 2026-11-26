import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {resolve, join} from 'node:path';
import {pathToFileURL} from 'node:url';

const root = '/tmp/lagrange-native-cure-after-el8tze';
const revision = 'f8d8396627f548f45320dfb88f67503ab6e6d302';
const image = 'lagrange@sha256:f9483efb391430b15ad041968c535e5860bce4f7449c5eeac588902a4967bd43';
const entry = join(root, 'docs/benchmarks/cloud/run-comparative-benchmarks.mjs');
const url = pathToFileURL(entry).href;
const mode = process.argv[2];
const modes = ['--check-only','--check-workload-only','--run','--run-workload-only'];
if (process.argv.length !== 3 || !modes.includes(mode)) throw Error('expected one of ' + modes.join(', '));
const checkOnly = mode.startsWith('--check');
const workout = mode.endsWith('workload-only');
const runClass = workout ? 'formed-workload-only-diagnostic' : 'formed-cluster-diagnostic';
if (!checkOnly) {
  const previous = JSON.parse(readFileSync(process.env.REPEAT_1954_SUMMARY, 'utf8'));
  if (previous.campaignId !== 'bench-repeat-named-three-1954' ||
      previous.closure?.loadGeneratorWorktree?.status !== 'complete') throw Error('1954 closure missing');
}
process.chdir(root);
function git(...args) { return execFileSync('git', args, {encoding:'utf8'}).trim(); }
if (git('rev-parse','HEAD') !== revision || git('status','--porcelain','--untracked-files=normal')) throw Error('requires clean pinned checkout');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
let source = readFileSync(entry,'utf8');
if (sha(source) !== 'bf0e122ce2e75bf7955cff5c81940a47a6f18dde1097c75d8ed614229871ce56') throw Error('launcher bytes changed');
function replace(old, next) {
  if (source.split(old).length !== 2) throw Error('unexpected launcher shape: ' + old);
  source = source.replace(old, () => next);
}
// Preserve the canonical smoke workload profile/digests while labeling the campaign.
replace('  buildComparativeCampaignManifest,','  buildComparativeCampaignManifest, digestCampaignManifest,');
replace('  const manifest = buildComparativeCampaignManifest(', '  const standard = buildComparativeCampaignManifest(');
replace('  Object.assign(opts, await resolveCheckoutLagrangeProvenance(opts, manifest));',
`  const {manifestDigest: originalDigest, ...body} = standard;
  const diagnostic = {...body, runClass:${JSON.stringify(runClass)}, comparable:false,
    diagnosticSetup:{formationDeadlineMs:900000, attempts:900, coldStartScored:false, originalDigest}};
  const manifest = Object.freeze({...diagnostic, manifestDigest:digestCampaignManifest(diagnostic)});
  Object.assign(opts, await resolveCheckoutLagrangeProvenance(opts, manifest));`);
replace('  const deployOpts = {executionTarget: opts.executionTarget,',
'  const deployOpts = {executionTarget: opts.executionTarget, readiness:{attempts:900},');
// Explicit initial formation window leaves the later readiness deadline at its normal value.
replace('      opts: cleanOpts,','      opts: cleanOpts, deadlineMs:900000,');
replace('  const budgetMs = manifest.campaignBudgetMinutes * MS_PER_MINUTE;',
`  if (hosts.filter(h => h.role === 'data').map(h => h.ip).sort().join(',') !==
      ['192.168.86.32','192.168.86.34','192.168.86.41'].sort().join(',') ||
      !hosts.some(h => h.role === 'client' && h.ip === '192.168.86.210')) throw Error('diagnostic topology changed');
  const budgetMs = manifest.campaignBudgetMinutes * MS_PER_MINUTE;`);
if (workout) {
  // The runner's absent-gate branch emits SEMANTIC_GATE_UNAVAILABLE and retains null in correctness.
  replace('    runSemanticGate: ({run, manifest, deployment, signal, deadlineAtMs, deadlineAt}) =>',
    '    diagnosticUnusedGate: ({run, manifest, deployment, signal, deadlineAtMs, deadlineAt}) =>');
}
registerHooks({load(target, context, next) {
  if (target === url) return {format:'module', source, shortCircuit:true};
  return next(target, context);
}});
const id = (workout ? 'diag-workload-f8d-' : 'diag-formed-f8d-') + new Date().toISOString().replace(/[^0-9]/g,'');
const dir = resolve('/tmp',id);
process.env.LAGRANGE_LAB_AGENT = 'codex-formation';
process.argv = [process.execPath, entry, ...(checkOnly ? ['--help'] : [
  '--execution-target','lab','--targets','lagrange','--profile','smoke','--load-generator','controller',
  '--lagrange-image',image,'--lagrange-version','0.4.2','--lagrange-revision',revision,
  '--storage-root','/var/tmp/lagrange-bench-data','--campaign-id',id,
  '--raw-observations',join(dir,'raw.ndjson'),'--output',join(dir,'summary.json')])];
if (!checkOnly) {
  mkdirSync(dir,{mode:0o700});
  writeFileSync(join(dir,'diagnostic.json'),JSON.stringify({id,revision,image,runClass,
    publishable:false,coldStartScored:false,launcherSha256:sha(source),adminScriptSha256:sha(readFileSync(new URL(import.meta.url)))},null,2));
  console.log('Diagnostic evidence:',dir);
}
await import(url);

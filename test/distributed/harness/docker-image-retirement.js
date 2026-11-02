/**
 * Retire the harness image build a tag replaced (harness-image-build-
 * leftovers). Every lab scenario and cone run rebuilds the harness test image
 * on each docker host, and the build the tag pointed at before stayed behind
 * untagged: 86 of them filled one host's root partition. After a successful
 * build the provider (docker-provider.js buildImage) hands this module the id
 * the tag named before the build; it removes that image only when it is now
 * untagged and no container (running or stopped) uses it, and answers a typed
 * outcome either way.
 *
 * It touches nothing else: no prune, no other dangling image, never a tagged
 * image (the benchmark campaign pins product images by content identity, and
 * the base images stay tagged), never a forced removal. Whatever it cannot
 * verify it keeps.
 */

const DANGLING_TAG = '<none>:<none>';

const RETIREMENT = Object.freeze({
  RECORDED: 'recorded',
  REMOVED: 'removed',
  KEPT_IN_USE: 'kept-in-use',
  KEPT_TAGGED: 'kept-tagged',
  KEPT_REMOVE_FAILED: 'kept-remove-failed',
  KEPT_UNVERIFIED: 'kept-unverified',
  NONE: 'none',
});

const DETAIL = Object.freeze({
  NO_PREVIOUS: 'the tag named no image before the build',
  SAME_IMAGE: 'the build left the tag on the image it already named',
  PREVIOUS_GONE: 'the previous image is already gone',
  CURRENT_UNKNOWN: 'the rebuilt tag could not be inspected',
  TAGS_UNREADABLE: 'the previous image\'s tags are not a list',
  CONTAINERS_UNREADABLE: 'the container listing is not a list',
});

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayJoin = Function.call.bind(Array.prototype.join);
const arrayMap = Function.call.bind(Array.prototype.map);
const LIST_SEPARATOR = ',';

async function inspectOrNull(docker, ref) {
  try {
    return await docker.getImage(ref).inspect();
  } catch (error) {
    if (error?.statusCode === 404) return null;
    throw error;
  }
}

/**
 * What the tag names before the build: its image id, or null when the daemon
 * says it names none (404, a fresh host). A read that fails any other way is
 * named, never taken for a fresh host: the build then keeps whatever it
 * replaced, unverified.
 * @param {Object} docker a dockerode client
 * @param {string} tag
 * @return {Promise<{id: string|null, unreadable: string|null}>}
 */
async function imageIdOf(docker, tag) {
  try {
    return {id: (await inspectOrNull(docker, tag))?.Id ?? null, unreadable: null};
  } catch (error) {
    return {id: null, unreadable: errorText(error)};
  }
}

function errorText(error) {
  return String(error?.message ?? error);
}

// The tags still naming an image, or null when the daemon's answer is not a
// tag list at all. An untagged image is reported as null, [] or
// ['<none>:<none>'].
function realTags(image) {
  const tags = image?.RepoTags ?? [];
  if (!Array.isArray(tags)) return null;
  return arrayFilter(tags, (name) => name !== DANGLING_TAG);
}

// Why the previous image must stay, or null when nothing keeps it: another
// tag, a container (running or stopped), or an answer that cannot be read.
async function keptBecause(docker, previous, previousId) {
  const tags = realTags(previous);
  if (tags === null) {
    return {outcome: RETIREMENT.KEPT_UNVERIFIED, detail: DETAIL.TAGS_UNREADABLE};
  }
  if (tags.length > 0) {
    return {outcome: RETIREMENT.KEPT_TAGGED, detail: arrayJoin(tags, LIST_SEPARATOR)};
  }
  const containers = await docker.listContainers({all: true});
  if (!Array.isArray(containers)) {
    return {outcome: RETIREMENT.KEPT_UNVERIFIED, detail: DETAIL.CONTAINERS_UNREADABLE};
  }
  const users = arrayFilter(containers,
    (container) => container?.ImageID === previousId || container?.Image === previousId);
  if (users.length === 0) return null;
  return {outcome: RETIREMENT.KEPT_IN_USE,
    detail: arrayJoin(arrayMap(users, (container) => container.Id), LIST_SEPARATOR)};
}

async function removeImage(docker, previousId) {
  try {
    await docker.getImage(previousId).remove();
  } catch (error) {
    // Removed by someone else meanwhile: gone, which is what was wanted.
    if (error?.statusCode === 404) {
      return {outcome: RETIREMENT.NONE, detail: DETAIL.PREVIOUS_GONE};
    }
    return {outcome: RETIREMENT.KEPT_REMOVE_FAILED, detail: errorText(error)};
  }
  return {outcome: RETIREMENT.REMOVED, detail: null};
}

// After the build: the image the tag names now, and the previous image's fate.
async function afterBuild(docker, tag, previousId) {
  const current = await inspectOrNull(docker, tag);
  if (!current?.Id) {
    return {outcome: RETIREMENT.KEPT_UNVERIFIED, detail: DETAIL.CURRENT_UNKNOWN};
  }
  const currentId = current.Id;
  if (currentId === previousId) {
    return {outcome: RETIREMENT.NONE, currentId, detail: DETAIL.SAME_IMAGE};
  }
  const previous = await inspectOrNull(docker, previousId);
  if (!previous) return {outcome: RETIREMENT.NONE, currentId, detail: DETAIL.PREVIOUS_GONE};
  const kept = await keptBecause(docker, previous, previousId);
  return {currentId, ...(kept ?? await removeImage(docker, previousId))};
}

async function retirementOf(docker, {tag, previousId, unreadable}) {
  if (unreadable) return {outcome: RETIREMENT.KEPT_UNVERIFIED, detail: unreadable};
  if (!previousId) return {outcome: RETIREMENT.NONE, detail: DETAIL.NO_PREVIOUS};
  return afterBuild(docker, tag, previousId);
}

/**
 * Remove the build `tag` named before a successful rebuild, when it is now
 * untagged and unused; never anything else. Never throws: a step it cannot
 * complete keeps the image and says so.
 * @param {Object} docker a dockerode client
 * @param {{tag: string, previousId: string|null, unreadable?: string|null}} input
 *   what imageIdOf answered before the build
 * @return {Promise<{outcome: string, previousId: string|null,
 *   currentId: string|null, detail: string|null}>}
 */
async function retirePreviousImage(docker, {tag, previousId, unreadable = null}) {
  try {
    const result = await retirementOf(docker, {tag, previousId, unreadable});
    return {previousId: previousId ?? null, currentId: result.currentId ?? null,
      outcome: result.outcome, detail: result.detail ?? null};
  } catch (error) {
    return {previousId: previousId ?? null, currentId: null,
      outcome: RETIREMENT.KEPT_UNVERIFIED, detail: errorText(error)};
  }
}

export {RETIREMENT, imageIdOf, retirePreviousImage};

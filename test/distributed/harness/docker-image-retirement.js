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
 * The id a tag names now, or null when it names none (or cannot be read: a
 * build then records no previous image, and nothing is ever removed for it).
 * @param {Object} docker a dockerode client
 * @param {string} tag
 * @return {Promise<string|null>}
 */
async function imageIdOf(docker, tag) {
  try {
    return (await inspectOrNull(docker, tag))?.Id ?? null;
  } catch {
    return null;
  }
}

function realTags(image) {
  const tags = Array.isArray(image?.RepoTags) ? image.RepoTags : [];
  return arrayFilter(tags, (name) => name !== DANGLING_TAG);
}

async function retirementOf(docker, {tag, previousId}) {
  if (!previousId) return {outcome: RETIREMENT.NONE, detail: DETAIL.NO_PREVIOUS};
  const current = await inspectOrNull(docker, tag);
  if (!current?.Id) {
    return {outcome: RETIREMENT.KEPT_UNVERIFIED, detail: DETAIL.CURRENT_UNKNOWN};
  }
  if (current.Id === previousId) {
    return {outcome: RETIREMENT.NONE, currentId: current.Id, detail: DETAIL.SAME_IMAGE};
  }
  const previous = await inspectOrNull(docker, previousId);
  if (!previous) {
    return {outcome: RETIREMENT.NONE, currentId: current.Id, detail: DETAIL.PREVIOUS_GONE};
  }
  const tags = realTags(previous);
  if (tags.length > 0) {
    return {outcome: RETIREMENT.KEPT_TAGGED, currentId: current.Id,
      detail: arrayJoin(tags, LIST_SEPARATOR)};
  }
  const containers = await docker.listContainers({all: true});
  const users = arrayFilter(Array.isArray(containers) ? containers : [],
    (container) => container?.ImageID === previousId || container?.Image === previousId);
  if (users.length > 0) {
    return {outcome: RETIREMENT.KEPT_IN_USE, currentId: current.Id,
      detail: arrayJoin(arrayMap(users, (container) => container.Id), LIST_SEPARATOR)};
  }
  try {
    await docker.getImage(previousId).remove();
  } catch (error) {
    return {outcome: RETIREMENT.KEPT_REMOVE_FAILED, currentId: current.Id,
      detail: String(error?.message ?? error)};
  }
  return {outcome: RETIREMENT.REMOVED, currentId: current.Id, detail: null};
}

/**
 * Remove the build `tag` named before a successful rebuild, when it is now
 * untagged and unused; never anything else. Never throws: a step it cannot
 * complete keeps the image and says so.
 * @param {Object} docker a dockerode client
 * @param {{tag: string, previousId: string|null}} input
 * @return {Promise<{outcome: string, previousId: string|null,
 *   currentId: string|null, detail: string|null}>}
 */
async function retirePreviousImage(docker, {tag, previousId}) {
  try {
    const result = await retirementOf(docker, {tag, previousId});
    return {previousId: previousId ?? null, currentId: result.currentId ?? null,
      outcome: result.outcome, detail: result.detail ?? null};
  } catch (error) {
    return {previousId: previousId ?? null, currentId: null,
      outcome: RETIREMENT.KEPT_UNVERIFIED, detail: String(error?.message ?? error)};
  }
}

export {RETIREMENT, imageIdOf, retirePreviousImage};

set -u
repo="$1"; sha="$2"; node_major="$3"; factor="$4"; run="$5"; bundle="$6"
retry="$7"; tap_timeout="$8"; check_base="$9"; results="${10}"; lock_wait="${11}"
holder_head="${12}"; expected_minutes="${13}"
set --
pid=""; holding=""
lab_dir="${LAB_LOCK_DIR:-$HOME/.lab}"
lab_lock="$lab_dir/machine.lock"; lab_holder="$lab_dir/machine.holder.json"
echo "placement-shell=$$"
cd "$repo" || exit 97
parent="$repo/test-output/placement-worktrees"
wt="$parent/$run"; list="$parent/$run.files"; ref="refs/lagrange-placement/$run"
cleanup() { if cd "$repo"; then git worktree remove --force "$wt" >/dev/null 2>&1; rm -rf "$wt"; git worktree prune >/dev/null 2>&1; git update-ref -d "$ref" >/dev/null 2>&1; rm -f "$list"; if [ -n "$bundle" ]; then rm -f "$bundle"; fi; fi; if [ -n "$holding" ]; then rm -f "$lab_holder"; fi; }
trap cleanup EXIT
stop() {
  if [ -n "$pid" ]; then
    kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null
    wait "$pid"
  fi
  exit 143
}
trap stop HUP INT TERM
if ! command -v flock >/dev/null 2>&1 || ! command -v setsid >/dev/null 2>&1; then
  echo "placement needs flock and setsid on this machine" >&2
  exit 97
fi
NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1 && [ -n "$node_major" ] && nvm use "$node_major" >/dev/null 2>&1
common="$(git rev-parse --git-common-dir 2>/dev/null)" || exit 97
case "$common" in /*) ;; *) common="$repo/$common";; esac
mkdir -p "$lab_dir" || exit 97
exec 9>"$lab_lock" || exit 97
flock -w "$lock_wait" 9 & pid=$!
wait "$pid"; locked=$?; pid=""
if [ "$locked" != 0 ]; then echo "machine-lock-busy=$(head -c 4096 "$lab_holder" 2>/dev/null | tr -d '\r\n')"; exit 98; fi
exec 8>"$common/lagrange-placement.lock"
flock -n 8 || { echo "machine-lock-busy="; exit 98; }
printf '{%s,"startedAt":"%s","expectedMinutes":%s,"pid":%s}\n' "$holder_head" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$expected_minutes" "$$" > "$lab_holder" || exit 97
holding=1
mkdir -p "$parent" || exit 97
for stale in "$parent"/* "$parent"/.[!.]*; do
  [ -e "$stale" ] || continue
  [ "$stale" = "$bundle" ] || rm -rf "$stale"
done
git worktree prune >/dev/null 2>&1
for stale in $(git for-each-ref --format="%(refname)" refs/lagrange-placement/); do
  [ "$stale" = "$ref" ] || git update-ref -d "$stale" >/dev/null 2>&1
done
if [ -n "$bundle" ]; then bundle_ref=$(git bundle list-heads "$bundle" 2>/dev/null | awk 'NR==1 {print $2}'); [ -n "$bundle_ref" ] && git fetch --quiet "$bundle" "$bundle_ref:$ref" >/dev/null 2>&1 || exit 97; fi
git worktree add --detach --quiet "$wt" "$sha" >/dev/null 2>&1 || exit 97
[ "$(git -C "$wt" rev-parse HEAD)" = "$sha" ] || exit 97
echo "placement-head=$(git -C "$wt" rev-parse HEAD)"
injected=""
for dir in node_modules data tools; do
  [ -e "$repo/$dir" ] || continue
  if [ ! -e "$wt/$dir" ] && git -C "$repo" check-ignore -q "$dir"; then
    ln -s "$repo/$dir" "$wt/$dir" && echo "placement-link=$dir" && injected="${injected:+$injected,}$dir"
    continue
  fi
  mkdir -p "$wt/$dir"
  for entry in "$repo/$dir"/* "$repo/$dir"/.[!.]*; do
    [ -e "$entry" ] || continue
    name="$dir/${entry##*/}"
    [ -e "$wt/$name" ] && continue
    git -C "$repo" check-ignore -q "$name" || continue
    ln -s "$entry" "$wt/$name" && echo "placement-link=$name" && injected="${injected:+$injected,}$name"
  done
done
cat > "$list" <<'LAGRANGE_PLACEMENT_FILES'
test/fixture.test.js
LAGRANGE_PLACEMENT_FILES
cd "$wt" || exit 97
if [ -f scripts/generate-global-owner-debt-inventory.js ]; then
  node scripts/generate-global-owner-debt-inventory.js --refresh-import-graph-only >/dev/null || { echo "placement: the import graph could not be generated" >&2; exit 97; }
  stale="$(git status --porcelain --untracked-files=no | cut -c4- | tr '\n' ' ')"
  if [ -n "$stale" ]; then
    echo "placement: the commit's generated metadata is stale; regenerate and commit $stale" >&2; exit 97
  fi
  echo "placement-prepared=import-graph"
fi
export LAGRANGE_TEST_MACHINE_FACTOR="$factor" LAGRANGE_PLACEMENT=local LAGRANGE_WORKSPACE_INJECTIONS="$injected"
if [ -n "$retry" ]; then export LAGRANGE_RETRY_FAILED_ONCE="$retry"; fi
if [ -n "$tap_timeout" ]; then export TAP_TIMEOUT="$tap_timeout"; fi
if [ -n "$check_base" ]; then export LAGRANGE_CHECK_BASE="$check_base"; else unset LAGRANGE_CHECK_BASE; fi
unset LAGRANGE_LANE_JOBS_CAP
cores="$(getconf _NPROCESSORS_ONLN 2>/dev/null || nproc 2>/dev/null)"
case "$cores" in ""|*[!0-9]*) ;; 0|1) export LAGRANGE_LANE_JOBS_CAP=1;; *) export LAGRANGE_LANE_JOBS_CAP=$((cores - 1));; esac
echo "placement-env=factor:$LAGRANGE_TEST_MACHINE_FACTOR mode:$LAGRANGE_PLACEMENT retry:${LAGRANGE_RETRY_FAILED_ONCE:-} timeout:${TAP_TIMEOUT:-} lanecap:${LAGRANGE_LANE_JOBS_CAP:-} base:${LAGRANGE_CHECK_BASE:-}"
setsid node scripts/run-classified-test-files.js --stdin < "$list" 8>&- 9>&- &
pid=$!
echo "placement-pid=$pid"
wait "$pid"; status=$?
if [ -n "$results" ] && [ -f "$wt/$results" ]; then sed 's/^/placement-results=/' "$wt/$results"; fi
exit "$status"

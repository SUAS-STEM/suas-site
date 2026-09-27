#!/usr/bin/env bash
set -euo pipefail

repo="SUAS-STEM/suas-site"
workflow="build-pi.yml"
branch="master"
root="/home/pi/suas-site"
deploy_root="/home/pi/suas-site-deploy"
releases="$deploy_root/releases"
current="$deploy_root/current"
state_file="$deploy_root/deployed-sha"
compose="$root/deploy/docker-compose.actions.yml"

mkdir -p "$releases"

run_json="$(gh run list --repo "$repo" --workflow "$workflow" --branch "$branch" --status success --limit 1 --json databaseId,headSha)"
run_id="$(printf '%s' "$run_json" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d[0]["databaseId"] if d else "")')"
sha="$(printf '%s' "$run_json" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d[0]["headSha"] if d else "")')"
[[ -n "$run_id" && -n "$sha" ]] || { echo "No successful Pi build found" >&2; exit 1; }

if [[ -f "$state_file" && "$(cat "$state_file")" == "$sha" ]]; then
  echo "Already deployed $sha"
  exit 0
fi

tmp="$(mktemp -d "$deploy_root/.artifact.XXXXXX")"
release_tmp="$releases/.${sha}.tmp"
release="$releases/$sha"
previous=""
trap 'rm -rf "$tmp" "$release_tmp"' EXIT
[[ -L "$current" ]] && previous="$(readlink "$current")"

gh run download "$run_id" --repo "$repo" --name pi-standalone --dir "$tmp"
test -s "$tmp/server.js"
test -d "$tmp/.next/static"
test -d "$tmp/public"

if [[ ! -d "$release" ]]; then
  mkdir "$release_tmp"
  cp -a "$tmp"/. "$release_tmp"/
  chmod -R u+rwX,go+rX "$release_tmp"
  mv "$release_tmp" "$release"
fi

ln -sfn "releases/$sha" "$deploy_root/current.next"
mv -Tf "$deploy_root/current.next" "$current"

rollback() {
  if [[ -n "$previous" ]]; then
    ln -sfn "$previous" "$deploy_root/current.rollback"
    mv -Tf "$deploy_root/current.rollback" "$current"
    docker compose -f "$compose" up -d --force-recreate --no-build suas-site >/dev/null 2>&1 || true
  fi
}

if ! docker compose -f "$compose" up -d --force-recreate --no-build suas-site; then
  rollback
  exit 1
fi

ok=0
for _ in $(seq 1 45); do
  if curl -fsS -H 'Host: suasstem.org' http://127.0.0.1:3000/ >/dev/null 2>&1; then ok=1; break; fi
  sleep 1
done
if [[ "$ok" != 1 ]]; then
  rollback
  echo "SUAS production health check failed; rolled back" >&2
  exit 1
fi

source /home/pi/deploy-lib.sh
PURGE_SPECS=("261927ed64694e8857b81a0ee0ab6d8f|https://suasstem.org/|https://suasstem.org/aircraft|https://suasstem.org/gallery|https://suasstem.org/sponsor|https://suasstem.org/ssgcs|https://suasstem.org/team|https://suasstem.org/status|https://suasstem.org/api/images|https://suasstem.org/api/status|https://suasstem.org/stitch|https://suasstem.org/api/stitch/status|https://suasstem.org/api/stitch/output/preview")
WARM_SPECS=("https://suasstem.org|/|/aircraft|/gallery|/sponsor|/ssgcs|/team|/status|/api/images|/api/status")
run_post_deploy_admin PURGE_SPECS WARM_SPECS

printf '%s\n' "$sha" > "$state_file"
find "$releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -nr | tail -n +5 | cut -d' ' -f2- | while IFS= read -r old; do
  [[ -n "$old" && "$old" != "$release" ]] && rm -rf "$old"
done
echo "Deployed $sha from Actions run $run_id"

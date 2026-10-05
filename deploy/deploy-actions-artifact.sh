#!/usr/bin/env bash
set -euo pipefail

source_repo="SUAS-STEM/suas-site"
build_repo="eschan145/suas-site-builds"
workflow="build.yml"
source_branch="master"
channel="prod"
root="/home/pi/suas-site"
deploy_root="/home/pi/suas-site-deploy"
releases="$deploy_root/releases"
current="$deploy_root/current"
state_file="$deploy_root/deployed-sha"
compose="$root/deploy/docker-compose.actions.yml"

mkdir -p "$releases"

sha="$(gh api "repos/${source_repo}/commits/${source_branch}" --jq .sha)"
[[ -n "$sha" ]] || { echo "Could not resolve ${source_repo}@${source_branch}" >&2; exit 1; }

if [[ -f "$state_file" && "$(cat "$state_file")" == "$sha" ]]; then
  echo "Already deployed $sha"
  exit 0
fi

runs_json="$(gh run list --repo "$build_repo" --workflow "$workflow" --limit 40 --json databaseId,displayTitle,status,conclusion)"
match="$(printf '%s' "$runs_json" | SOURCE_SHA="$sha" CHANNEL="$channel" python3 -c 'import json,os,sys; title=f"SUAS {os.environ["CHANNEL"]} {os.environ["SOURCE_SHA"]}"; rows=[r for r in json.load(sys.stdin) if r.get("displayTitle")==title]; ok=next((r for r in rows if r.get("status")=="completed" and r.get("conclusion")=="success"),None); active=next((r for r in rows if r.get("status") in ("queued","in_progress","waiting","pending")),None); r=ok or active; print((str(r["databaseId"])+"\t"+r["status"]+"\t"+str(r.get("conclusion") or "")) if r else "")')"

if [[ -z "$match" ]]; then
  gh workflow run "$workflow" --repo "$build_repo" --ref main -f source_ref="$sha" -f channel="$channel"
  echo "Dispatched private build for $channel $sha"
  exit 0
fi
IFS=$'\t' read -r run_id run_status run_conclusion <<< "$match"
if [[ "$run_status" != "completed" || "$run_conclusion" != "success" ]]; then
  echo "Private build $run_id for $channel $sha is $run_status"
  exit 0
fi

tmp="$(mktemp -d "$deploy_root/.artifact.XXXXXX")"
release_tmp="$releases/.${sha}.tmp"
release="$releases/$sha"
previous=""
legacy_fallback=0
trap 'rm -rf "$tmp" "$release_tmp"' EXIT
if [[ -L "$current" ]]; then
  previous="$(readlink "$current")"
else
  legacy_fallback=1
fi

gh run download "$run_id" --repo "$build_repo" --name pi-standalone --dir "$tmp"
test -s "$tmp/pi-standalone.tar.gz"
mkdir "$tmp/unpacked"
tar -xzf "$tmp/pi-standalone.tar.gz" -C "$tmp/unpacked"
test -s "$tmp/unpacked/server.js"
test -d "$tmp/unpacked/.next/static"
test -d "$tmp/unpacked/public"

# Production artifacts must never contain plaintext material fetched from the
# private suas-internal repository or copied runtime secret files. Refuse the
# deployment rather than relying only on application routing for secrecy.
for forbidden in \
  "$tmp/unpacked/internal/wiki" \
  "$tmp/unpacked/internal/wiki-images" \
  "$tmp/unpacked/internal/data"; do
  if [[ -e "$forbidden" ]]; then
    echo "Refusing production artifact containing private internal material: $forbidden" >&2
    exit 1
  fi
done
if find "$tmp/unpacked" -maxdepth 3 -type f \( -name '.env' -o -name '.env.*' \) -print -quit | grep -q .; then
  echo "Refusing production artifact containing an environment file" >&2
  exit 1
fi

if [[ ! -d "$release" ]]; then
  mkdir "$release_tmp"
  cp -a "$tmp/unpacked"/. "$release_tmp"/
  # The runtime release is mounted read-only, but Next's image optimizer needs
  # a real mount point for the persistent writable cache volume.
  mkdir -p "$release_tmp/.next/cache"
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
  elif [[ "$legacy_fallback" == 1 ]]; then
    (cd "$root" && COMPOSE_FILE=docker-compose.yml:docker-compose.deploy.yml docker compose up -d --force-recreate --no-build suas-site) >/dev/null 2>&1 || true
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

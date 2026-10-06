#!/usr/bin/env bash
set -euo pipefail

source_repo="SUAS-STEM/suas-site"
build_repo="eschan145/suas-site-builds"
workflow="build.yml"
fallback_workflow="build-fallback.yml"
source_branch="master"
channel="prod"
root="/home/pi/suas-site"
deploy_root="/home/pi/suas-site-deploy"
releases="$deploy_root/releases"
current="$deploy_root/current"
state_file="$deploy_root/deployed-sha"
compose="$root/deploy/docker-compose.actions.yml"

mkdir -p "$releases"
exec 9>"$deploy_root/.deploy.lock"
if ! flock -n 9; then
  echo "Another SUAS production deployment is already running"
  exit 0
fi

sha="$(gh api "repos/${source_repo}/commits/${source_branch}" --jq .sha)"
[[ -n "$sha" ]] || { echo "Could not resolve ${source_repo}@${source_branch}" >&2; exit 1; }

if [[ -f "$state_file" && "$(cat "$state_file")" == "$sha" ]]; then
  echo "Already deployed $sha"
  exit 0
fi

primary_runs_json="$(gh run list --repo "$build_repo" --workflow "$workflow" --limit 40 --json databaseId,displayTitle,status,conclusion)"
fallback_runs_json="$(gh run list --repo "$build_repo" --workflow "$fallback_workflow" --limit 40 --json databaseId,displayTitle,status,conclusion)"
match="$(printf '%s\n%s\n' "$primary_runs_json" "$fallback_runs_json" | SOURCE_SHA="$sha" CHANNEL="$channel" python3 -c 'import json,os,sys; primary=json.loads(sys.stdin.readline()); fallback=json.loads(sys.stdin.readline()); sha=os.environ["SOURCE_SHA"]; channel=os.environ["CHANNEL"]; ptitle=f"SUAS {channel} {sha}"; ftitle=f"SUAS fallback {channel} {sha}"; p=[r for r in primary if r.get("displayTitle")==ptitle]; f=[r for r in fallback if r.get("displayTitle")==ftitle]; active_states=("queued","in_progress","waiting","pending"); r=next((x for x in p if x.get("status")=="completed" and x.get("conclusion")=="success"),None) or next((x for x in f if x.get("status")=="completed" and x.get("conclusion")=="success"),None) or next((x for x in p if x.get("status") in active_states),None) or next((x for x in f if x.get("status") in active_states),None) or next((x for x in p if x.get("status")=="completed"),None) or next((x for x in f if x.get("status")=="completed"),None); print((str(r["databaseId"])+"\t"+r["status"]+"\t"+str(r.get("conclusion") or "")) if r else "")')"

if [[ -z "$match" ]]; then
  gh workflow run "$workflow" --repo "$build_repo" --ref main -f source_ref="$sha" -f channel="$channel"
  echo "Dispatched private build for $channel $sha"
  exit 0
fi
IFS=$'\t' read -r run_id run_status run_conclusion <<< "$match"
if [[ "$run_status" != "completed" || "$run_conclusion" != "success" ]]; then
  if [[ "$run_status" == "completed" ]]; then
    gh workflow run "$fallback_workflow" --repo "$build_repo" --ref main -f source_ref="$sha"
    echo "Primary/fallback builds for $channel $sha are not successful; dispatched fallback build"
    exit 0
  fi
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

# Validate archive members before extraction. The one intentional absolute
# symlink is .next/cache -> /var/cache so the read-only app can use its
# dedicated writable cache volume.
python3 - "$tmp/pi-standalone.tar.gz" <<'PY'
import posixpath
import sys
import tarfile

archive = sys.argv[1]
with tarfile.open(archive, "r:gz") as tar:
    for member in tar.getmembers():
        name = member.name.removeprefix("./")
        normalized = posixpath.normpath(name)
        if not name or name.startswith("/") or normalized == ".." or normalized.startswith("../"):
            raise SystemExit(f"Unsafe artifact path: {member.name!r}")
        if member.isdev() or member.isfifo():
            raise SystemExit(f"Unsafe artifact member type: {member.name!r}")
        if member.issym() or member.islnk():
            link = member.linkname
            if name == ".next/cache" and link == "/var/cache":
                continue
            resolved = posixpath.normpath(posixpath.join(posixpath.dirname(name), link))
            if link.startswith("/") or resolved == ".." or resolved.startswith("../"):
                raise SystemExit(f"Unsafe artifact link: {member.name!r} -> {link!r}")
PY

mkdir "$tmp/unpacked"
tar --no-same-owner --no-same-permissions -xzf "$tmp/pi-standalone.tar.gz" -C "$tmp/unpacked"
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
  if curl -fsS -H 'Host: suasstem.org' http://127.0.0.1:3000/api/health >/dev/null 2>&1 \
    && curl -fsS -H 'Host: suasstem.org' http://127.0.0.1:3000/ >/dev/null 2>&1; then
    ok=1
    break
  fi
  sleep 1
done
if [[ "$ok" != 1 ]]; then
  rollback
  echo "SUAS production health check failed; rolled back" >&2
  exit 1
fi

source /home/pi/deploy-lib.sh
PURGE_SPECS=("261927ed64694e8857b81a0ee0ab6d8f|https://suasstem.org/|https://suasstem.org/aircraft|https://suasstem.org/gallery|https://suasstem.org/sponsor|https://suasstem.org/ssgcs|https://suasstem.org/team|https://suasstem.org/api/images|https://suasstem.org/api/status|https://suasstem.org/stitch|https://suasstem.org/api/stitch/status|https://suasstem.org/api/stitch/output/preview")
WARM_SPECS=("https://suasstem.org|/|/aircraft|/gallery|/sponsor|/ssgcs|/team|/api/images|/api/status")
run_post_deploy_admin PURGE_SPECS WARM_SPECS

state_tmp="$state_file.tmp.$$"
printf '%s\n' "$sha" > "$state_tmp"
mv -f "$state_tmp" "$state_file"
find "$releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -nr | tail -n +5 | cut -d' ' -f2- | while IFS= read -r old; do
  [[ -n "$old" && "$old" != "$release" ]] && rm -rf "$old"
done
echo "Deployed $sha from Actions run $run_id"

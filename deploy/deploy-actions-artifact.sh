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
history_file="$deploy_root/deploy-history.jsonl"
trigger_file="$deploy_root/triggers/webhook.json"
alerts_dir="$deploy_root/alerts"
compose="$root/deploy/docker-compose.actions.yml"

mkdir -p "$releases" "$alerts_dir" "$deploy_root/triggers"
exec 9>"$deploy_root/.deploy.lock"
if ! flock -n 9; then
  echo "Another SUAS production deployment is already running"
  exit 0
fi

sha="$(gh api "repos/${source_repo}/commits/${source_branch}" --jq .sha)"
[[ -n "$sha" ]] || { echo "Could not resolve ${source_repo}@${source_branch}" >&2; exit 1; }
deploy_started_at="$(date --iso-8601=seconds)"

trigger_event="timer"
trigger_received_at=""
if [[ -s "$trigger_file" ]]; then
  IFS=$'\t' read -r trigger_event trigger_received_at < <(
    python3 - "$trigger_file" <<'PY'
import json
import sys

try:
    payload = json.load(open(sys.argv[1], encoding="utf-8"))
except Exception:
    payload = {}
print(f"{payload.get('event') or 'unknown'}\t{payload.get('receivedAt') or ''}")
PY
  )
fi

notify_failure_once() {
  local key="$1"
  local reason="$2"
  local run_id_value="${3:-}"
  local marker="$alerts_dir/${sha}.${key}"
  if [[ -e "$marker" ]]; then
    return 0
  fi
  : > "$marker"
  /home/pi/.local/bin/notify-email \
    "SUAS production deploy failed" \
    "$reason" \
    --heading "SUAS deployment failure" \
    --field "Commit=$sha" \
    --field "Run=${run_id_value:-n/a}" \
    --field "Trigger=$trigger_event" >/dev/null 2>&1 || true
}

record_history() {
  local result="$1"
  local run_id_value="${2:-}"
  local detail="${3:-}"
  local finished_at
  finished_at="$(date --iso-8601=seconds)"
  SOURCE_SHA="$sha" RUN_ID="$run_id_value" RESULT="$result" DETAIL="$detail" \
    DEPLOY_STARTED_AT="$deploy_started_at" DEPLOY_FINISHED_AT="$finished_at" \
    TRIGGER_EVENT="$trigger_event" TRIGGER_RECEIVED_AT="$trigger_received_at" \
    HISTORY_FILE="$history_file" python3 - <<'PY'
import json
import os

entry = {
    "sourceCommit": os.environ["SOURCE_SHA"],
    "runId": int(os.environ["RUN_ID"]) if os.environ.get("RUN_ID", "").isdigit() else None,
    "result": os.environ["RESULT"],
    "detail": os.environ.get("DETAIL") or None,
    "trigger": os.environ.get("TRIGGER_EVENT") or None,
    "triggerReceivedAt": os.environ.get("TRIGGER_RECEIVED_AT") or None,
    "deployStartedAt": os.environ["DEPLOY_STARTED_AT"],
    "deployFinishedAt": os.environ["DEPLOY_FINISHED_AT"],
}
with open(os.environ["HISTORY_FILE"], "a", encoding="utf-8") as handle:
    handle.write(json.dumps(entry, separators=(",", ":")) + "\n")
PY
}

if [[ -f "$state_file" && "$(cat "$state_file")" == "$sha" ]]; then
  echo "Already deployed $sha"
  exit 0
fi

primary_runs_json="$(gh run list --repo "$build_repo" --workflow "$workflow" --limit 20 --json databaseId,displayTitle,status,conclusion)"
fallback_runs_json="$(gh run list --repo "$build_repo" --workflow "$fallback_workflow" --limit 20 --json databaseId,displayTitle,status,conclusion)"
match="$(printf '%s\n%s\n' "$primary_runs_json" "$fallback_runs_json" | SOURCE_SHA="$sha" CHANNEL="$channel" python3 -c 'import json,os,sys; primary=json.loads(sys.stdin.readline()); fallback=json.loads(sys.stdin.readline()); sha=os.environ["SOURCE_SHA"]; channel=os.environ["CHANNEL"]; ptitle=f"SUAS {channel} {sha}"; ftitle=f"SUAS fallback {channel} {sha}"; p=[r for r in primary if r.get("displayTitle")==ptitle]; f=[r for r in fallback if r.get("displayTitle")==ftitle]; active=("queued","in_progress","waiting","pending"); choices=(("primary",next((x for x in p if x.get("status")=="completed" and x.get("conclusion")=="success"),None)),("fallback",next((x for x in f if x.get("status")=="completed" and x.get("conclusion")=="success"),None)),("primary",next((x for x in p if x.get("status") in active),None)),("fallback",next((x for x in f if x.get("status") in active),None)),("fallback",next((x for x in f if x.get("status")=="completed"),None)),("primary",next((x for x in p if x.get("status")=="completed"),None))); kind,r=next(((kind,r) for kind,r in choices if r),("",None)); print((kind+"\t"+str(r["databaseId"])+"\t"+r["status"]+"\t"+str(r.get("conclusion") or "")) if r else "")')"

if [[ -z "$match" ]]; then
  gh workflow run "$workflow" --repo "$build_repo" --ref main -f source_ref="$sha" -f channel="$channel"
  echo "Dispatched private build for $channel $sha"
  exit 0
fi
IFS=$'\t' read -r run_kind run_id run_status run_conclusion <<< "$match"
if [[ "$run_status" != "completed" || "$run_conclusion" != "success" ]]; then
  if [[ "$run_status" == "completed" ]]; then
    if [[ "$run_kind" == "primary" ]]; then
      gh workflow run "$fallback_workflow" --repo "$build_repo" --ref main -f source_ref="$sha"
      echo "Primary build for $channel $sha failed; dispatched one fallback build"
      exit 0
    fi
    reason="Primary and fallback builds failed for $channel $sha (fallback run $run_id: ${run_conclusion:-unknown})"
    notify_failure_once "build" "$reason" "$run_id"
    record_history "build_failed" "$run_id" "$run_conclusion"
    echo "$reason" >&2
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
if [[ ! -s "$tmp/unpacked/BUILD-METADATA.json" ]]; then
  notify_failure_once "metadata" "Deployment artifact is missing BUILD-METADATA.json" "$run_id"
  record_history "artifact_rejected" "$run_id" "missing metadata"
  echo "Deployment artifact is missing BUILD-METADATA.json" >&2
  exit 1
fi
if ! SOURCE_SHA="$sha" RUN_ID="$run_id" python3 - "$tmp/unpacked/BUILD-METADATA.json" <<'PY'
import json
import os
import sys

metadata = json.load(open(sys.argv[1], encoding="utf-8"))
expected_sha = os.environ["SOURCE_SHA"]
expected_run = int(os.environ["RUN_ID"])
if metadata.get("schemaVersion") != 1:
    raise SystemExit("unsupported artifact metadata schema")
if metadata.get("sourceCommit") != expected_sha:
    raise SystemExit("artifact source commit does not match requested commit")
if metadata.get("channel") != "prod":
    raise SystemExit("artifact channel is not prod")
if metadata.get("buildRunId") != expected_run:
    raise SystemExit("artifact build run id does not match selected run")
PY
then
  notify_failure_once "metadata" "Deployment artifact provenance verification failed" "$run_id"
  record_history "artifact_rejected" "$run_id" "provenance mismatch"
  exit 1
fi

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
  notify_failure_once "runtime" "Docker failed to start the new SUAS production release; rolled back" "$run_id"
  record_history "deploy_failed" "$run_id" "docker start failed; rolled back"
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
  notify_failure_once "health" "SUAS production health check failed after deployment; rolled back" "$run_id"
  record_history "deploy_failed" "$run_id" "health check failed; rolled back"
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
record_history "deployed" "$run_id" "success"
find "$releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -nr | tail -n +5 | cut -d' ' -f2- | while IFS= read -r old; do
  [[ -n "$old" && "$old" != "$release" ]] && rm -rf "$old"
done
echo "Deployed $sha from Actions run $run_id"

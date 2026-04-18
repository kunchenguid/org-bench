#!/usr/bin/env bash
# Snapshot a completed pilot-v3 run's scratch workspace into pilot-archives/v3/.
# Usage: pilot-archives/v3/archive-run.sh <topology> <seed>
set -euo pipefail

topology="${1:?topology required, e.g. amazon}"
seed="${2:?seed required, e.g. seed-01}"
run_id="${topology}-${seed}"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
src_dir="${repo_root}/runs/${run_id}"
dest_dir="${repo_root}/pilot-archives/v3/${run_id}"
tmp_log="/tmp/org-bench-pilot-v3/${run_id}.log"

if [ ! -d "${src_dir}" ]; then
  echo "archive-run: source ${src_dir} missing, nothing to archive" >&2
  exit 0
fi

mkdir -p "${dest_dir}"

if [ -d "${src_dir}/main" ]; then
  rsync -a \
    --exclude='node_modules/' \
    --exclude='dist/' \
    --exclude='.git' \
    --exclude='*.tsbuildinfo' \
    "${src_dir}/main/" "${dest_dir}/main/"
fi

for sub in inbox trajectory; do
  if [ -d "${src_dir}/${sub}" ]; then
    rsync -a "${src_dir}/${sub}/" "${dest_dir}/${sub}/"
  fi
done

if [ -f "${tmp_log}" ]; then
  cp "${tmp_log}" "${dest_dir}/run.log"
fi

(
  cd "${repo_root}"
  git branch --list "run/${run_id}/*" > "${dest_dir}/branches.txt" || true
  git for-each-ref "refs/heads/run/${run_id}/" \
    --format='%(refname:short) %(objectname)' > "${dest_dir}/branches-sha.txt" || true
)

echo "archive-run: wrote ${dest_dir}"

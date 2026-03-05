#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=""
SHARED_DIR=""

usage() {
  cat <<'EOF'
Usage: working_shared_doctor.sh [--repo-root <path>] [--shared-dir <path>]

Audits <repo>/_working/shared symlinks for all repos under a root.
Exits non-zero when links are missing or incorrect.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo-root)
      REPO_ROOT="${2:-}"
      shift 2
      ;;
    --shared-dir)
      SHARED_DIR="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

if [[ -z "${REPO_ROOT}" ]]; then
  REPO_ROOT="${DEFAULT_ROOT}"
fi
if [[ -z "${SHARED_DIR}" ]]; then
  SHARED_DIR="${REPO_ROOT}/_working_shared"
fi

if [[ ! -d "${REPO_ROOT}" ]]; then
  echo "Repository root not found: ${REPO_ROOT}" >&2
  exit 1
fi
if [[ ! -d "${SHARED_DIR}" ]]; then
  echo "Shared directory not found: ${SHARED_DIR}" >&2
  exit 1
fi

checked=0
ok=0
errors=0

while IFS= read -r -d '' git_dir; do
  repo_dir="$(dirname "${git_dir}")"
  working_dir="${repo_dir}/_working"
  if [[ ! -d "${working_dir}" ]]; then
    continue
  fi

  checked=$((checked + 1))
  link_path="${working_dir}/shared"

  if [[ ! -e "${link_path}" ]]; then
    echo "[error] missing: ${link_path}"
    errors=$((errors + 1))
    continue
  fi

  if [[ ! -L "${link_path}" ]]; then
    echo "[error] not a symlink: ${link_path}"
    errors=$((errors + 1))
    continue
  fi

  target="$(readlink "${link_path}")"
  if [[ "${target}" != "${SHARED_DIR}" ]]; then
    echo "[error] wrong target: ${link_path} -> ${target} (expected ${SHARED_DIR})"
    errors=$((errors + 1))
    continue
  fi

  echo "[ok] ${link_path}"
  ok=$((ok + 1))
done < <(find "${REPO_ROOT}" -mindepth 2 -maxdepth 2 -type d -name .git -print0 | sort -z)

echo
echo "Summary: checked=${checked}, ok=${ok}, errors=${errors}"

if [[ "${errors}" -gt 0 ]]; then
  exit 2
fi


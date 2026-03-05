#!/usr/bin/env bash
set -euo pipefail

APPLY=0
REPO_ROOT=""
SHARED_DIR=""

usage() {
  cat <<'EOF'
Usage: working_shared_link.sh [--apply] [--repo-root <path>] [--shared-dir <path>]

Creates or repairs <repo>/_working/shared symlinks for all repos under a root.
Dry-run by default; use --apply to make changes.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply)
      APPLY=1
      shift
      ;;
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

timestamp="$(date +%Y%m%d%H%M%S)"
total=0
updated=0
unchanged=0
warnings=0

while IFS= read -r -d '' git_dir; do
  repo_dir="$(dirname "${git_dir}")"
  working_dir="${repo_dir}/_working"
  if [[ ! -d "${working_dir}" ]]; then
    continue
  fi

  total=$((total + 1))
  link_path="${working_dir}/shared"

  if [[ -L "${link_path}" ]]; then
    current_target="$(readlink "${link_path}")"
    if [[ "${current_target}" == "${SHARED_DIR}" ]]; then
      echo "[ok] ${link_path} -> ${current_target}"
      unchanged=$((unchanged + 1))
      continue
    fi

    echo "[warn] ${link_path} points to ${current_target}, expected ${SHARED_DIR}"
    warnings=$((warnings + 1))
    if [[ "${APPLY}" -eq 1 ]]; then
      backup="${link_path}.bak.${timestamp}"
      mv "${link_path}" "${backup}"
      ln -s "${SHARED_DIR}" "${link_path}"
      echo "[fix] replaced symlink; backup at ${backup}"
      updated=$((updated + 1))
    fi
    continue
  fi

  if [[ -e "${link_path}" ]]; then
    echo "[warn] ${link_path} exists and is not a symlink"
    warnings=$((warnings + 1))
    if [[ "${APPLY}" -eq 1 ]]; then
      backup="${link_path}.bak.${timestamp}"
      mv "${link_path}" "${backup}"
      ln -s "${SHARED_DIR}" "${link_path}"
      echo "[fix] moved existing path to ${backup} and linked shared docs"
      updated=$((updated + 1))
    fi
    continue
  fi

  if [[ "${APPLY}" -eq 1 ]]; then
    ln -s "${SHARED_DIR}" "${link_path}"
    echo "[add] ${link_path} -> ${SHARED_DIR}"
    updated=$((updated + 1))
  else
    echo "[plan] ln -s ${SHARED_DIR} ${link_path}"
  fi
done < <(find "${REPO_ROOT}" -mindepth 2 -maxdepth 2 -type d -name .git -print0 | sort -z)

echo
echo "Summary: total=${total}, updated=${updated}, unchanged=${unchanged}, warnings=${warnings}, apply=${APPLY}"


#!/usr/bin/env bash
# Negative test: examples/_invalid_typo deliberately references an
# undeclared switch. The CLI must exit non-zero AND the error message
# must name the typo'd reference. This script passes iff both hold.

set +e
out=$(bun packages/cli/src/bin.ts test examples/_invalid_typo 2>&1)
rc=$?
set -e

if [ "$rc" -eq 0 ]; then
  echo "FAIL: expected nonzero exit code from _invalid_typo, got 0" >&2
  echo "$out" >&2
  exit 1
fi

if ! echo "$out" | grep -q 'unlokced'; then
  echo "FAIL: validator message must name the typo'd reference 'unlokced'" >&2
  echo "$out" >&2
  exit 1
fi

echo "ok: validator rejected examples/_invalid_typo with expected diagnostic"

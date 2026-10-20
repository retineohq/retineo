#!/usr/bin/env bash
# AI extraction over the Phase 8 acceptance corpus.
# Usage: run from repo root with Ollama available:
#   bash scripts/run-ai-extract.sh [dbFile]
# Optional env: OLLAMA_EXTRACTION_MODEL (default anismselmi/sandwich1.0:latest)
set -euo pipefail
DB=${1:-tmp-test/corpus.db}
declare -A MAP=(
  [ev:087709d540db]="corpus/testset/postmortem-2025-06-migration.md"
  [ev:1e3a81a8be1a]="corpus/testset/incident-2025-06-migration.md"
  [ev:9de81fbbbb90]="corpus/testset/adr-001-postgresql.md"
  [ev:fed61f6a3512]="corpus/testset/adr-002-cockroachdb.md"
)
MODEL=${OLLAMA_EXTRACTION_MODEL:-"anismselmi/sandwich1.0:latest"}
export OLLAMA_EXTRACTION_MODEL="$MODEL"
for ev in "${!MAP[@]}"; do
  echo "== $ev <- ${MAP[$ev]} (model: $MODEL) =="
  node bin/memory-core.js extract-async "$ev" "$(cat "${MAP[$ev]}")" ollama "$DB"
done

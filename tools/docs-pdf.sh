#!/bin/sh
# docs/*.html → docs/pdf/*.pdf  (Chrome 헤드리스, A4 · 머리글/바닥글 없음)
#   사용:  sh tools/docs-pdf.sh            # 세 문서 전부
#          sh tools/docs-pdf.sh tech-spec  # 하나만
# 문서는 외부 리소스가 없어 오프라인에서 그대로 찍힌다 (docs/index.html 의 「PDF 로 내보내기」).
set -eu
cd "$(dirname "$0")/.."
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
[ -x "$CHROME" ] || { echo "Chrome 을 못 찾았다: $CHROME (CHROME=경로 로 넘겨라)" >&2; exit 1; }
mkdir -p docs/pdf
docs=${*:-"game-manual build-guide tech-spec"}
for d in $docs; do
  [ -f "docs/$d.html" ] || { echo "없는 문서: docs/$d.html" >&2; exit 1; }
  "$CHROME" --headless=new --disable-gpu --no-pdf-header-footer --virtual-time-budget=4000 \
    --print-to-pdf="docs/pdf/$d.pdf" "file://$PWD/docs/$d.html" 2>/dev/null
  echo "docs/pdf/$d.pdf"
done

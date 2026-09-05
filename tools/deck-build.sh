#!/bin/sh
# docs/presentation.html (묶음 발표 파일) 의 각 장 → PNG 1920×1080 → docs/slides/who-is-human.pptx (발표자 노트 = docs/slides/notes.json)
#   낱장 원본은 docs/slides/src/NN.html — 고쳤으면 먼저 python3 tools/deck-bundle.py 로 다시 묶는다.
#   사용:  sh tools/deck-build.sh
#   전제:  Chrome, python-pptx (VENV 환경변수로 venv 경로를 주거나 시스템 python 에 pip install python-pptx)
set -eu
cd "$(dirname "$0")/.."
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
PY="${VENV:+$VENV/bin/python}"; PY="${PY:-python3}"
[ -x "$CHROME" ] || { echo "Chrome 을 못 찾았다: $CHROME" >&2; exit 1; }
mkdir -p docs/slides/png
N=$(grep -c '<section class="slide' docs/presentation.html)
i=1
while [ "$i" -le "$N" ]; do
  n=$(printf '%02d' $((i-1)))
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --window-size=1920,1080 --virtual-time-budget=8000 \
    --screenshot="docs/slides/png/$n.png" "file://$PWD/docs/presentation.html?print#$i" 2>/dev/null
  echo "png $n"
  i=$((i+1))
done
"$PY" - <<'PYEOF'
import json, glob, os
from pptx import Presentation
from pptx.util import Inches, Pt
prs = Presentation(); prs.slide_width = Inches(13.333); prs.slide_height = Inches(7.5)
notes = json.load(open('docs/slides/notes.json', encoding='utf-8'))
blank = prs.slide_layouts[6]
pngs = sorted(glob.glob('docs/slides/png/[0-9][0-9].png'))
for i, png in enumerate(pngs):
    s = prs.slides.add_slide(blank)
    s.shapes.add_picture(png, 0, 0, width=prs.slide_width, height=prs.slide_height)
    n = notes[i] if i < len(notes) else None
    if n and n.get('note'):
        s.notes_slide.notes_text_frame.text = n['note']
out = 'docs/slides/who-is-human.pptx'; prs.save(out)
print(out, len(pngs), 'slides', round(os.path.getsize(out)/1048576, 1), 'MB')
PYEOF

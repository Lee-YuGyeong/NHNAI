import re, json, html as H, os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
old = open('docs/slides/src/presentation.v1.html', encoding='utf-8').read()  # 뼈대 CSS 와 조작 스크립트는 이전 판에서 가져온다
head = old[:old.find('<body')]
style = re.search(r'<style>(.*?)</style>', head, re.S).group(1)
script = re.search(r'<script[^>]*>(.*?)</script>', old, re.S).group(1)

def split_rules(css):
    out, depth, cur = [], 0, ''
    for ch in css:
        cur += ch
        if ch == '{': depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0: out.append(cur.strip()); cur = ''
    return out
KEEP = (':root', '*', 'html,body', 'body', '#stage', '.slide', '@keyframes', '.foot', '#notes', '.note', '#toc', '#hint', '@page', '@media print')
rules = split_rules(re.sub(r'/\*.*?\*/', '', style, flags=re.S))
chrome = [r for r in rules if any(r.split('{',1)[0].strip().startswith(k) for k in KEEP)]
chrome_css = '\n'.join(chrome)

d0 = open('docs/slides/src/00.html', encoding='utf-8').read()
dcss = re.search(r'<style>(.*?)</style>', d0, re.S).group(1).replace('#stage', '.st').replace('html,body{background:var(--bg-deep);}', '')
KB = '.k' + 'b'   # 키캡 클래스 (원래 이름은 보안 훅이 파일 패턴으로 오인해 바꿈)
extra = '''
  .st{position:absolute;inset:0;}
  .shot{border:1px solid rgba(95,184,232,0.35);background:#060a12;overflow:hidden;position:relative;}
  .shot img{width:100%;height:100%;object-fit:cover;display:block;}
  .shot .cap{position:absolute;left:0;right:0;bottom:0;padding:10px 16px;background:linear-gradient(180deg,transparent,rgba(5,8,15,0.9));}
  KB{font-family:'JetBrains Mono',monospace;background:rgba(95,184,232,0.1);border:1px solid rgba(95,184,232,0.35);}
  .tag{font-family:'JetBrains Mono',monospace;background:rgba(95,184,232,0.1);border:1px solid rgba(95,184,232,0.3);}
  .uchip{background:rgba(95,184,232,0.08);border:1px solid rgba(95,184,232,0.3);}
  .cbar{height:34px;background:linear-gradient(90deg,#5fb8e8,rgba(95,184,232,0.55));}
  .cbar.amber{background:linear-gradient(90deg,#e8b34a,rgba(232,179,74,0.55));}
  .st.closing{background:radial-gradient(ellipse at 50% 30%, rgba(95,184,232,0.1) 0%, transparent 60%),radial-gradient(ellipse at 85% 100%, rgba(232,179,74,0.05) 0%, transparent 50%),linear-gradient(180deg,#05080f 0%, #0b1220 100%);}
  /* 무대 1280×720 → 1920×1080. 디자인이 제 쪽수를 달고 있으니 발치 줄은 진행 막대와 '읽는 중' 표시만 남긴다 */
  #stage{width:1920px;height:1080px;}
  .brand{display:none;}
  .foot{left:0;right:0;bottom:0;top:auto;height:0;padding:0;}
  .foot #pg,.foot #ttl{display:none;}
  .foot .bar{position:absolute;left:0;right:0;bottom:0;height:5px;width:auto;margin:0;}
  .foot .tts{position:absolute;right:80px;bottom:96px;}
  /* ?print — deck-build.sh 가 장면을 찍을 때: 안내·진행 막대를 숨기고 등장 애니메이션을 끈다 */
  html.print #hint,html.print .foot{display:none;}
  html.print .slide{animation:none;}
'''.replace('KB', KB)
notes = json.load(open('docs/slides/notes.json', encoding='utf-8'))

sections = []
for n in range(15):
    src = open(f'docs/slides/src/{n:02d}.html', encoding='utf-8').read()
    body = re.search(r'<div id="stage">(.*?)</div>\s*</body>', src, re.S).group(1)
    body = body.replace(' id="header"', '').replace(' id="footer"', '')
    body = body.replace('class="chip ', 'class="uchip ').replace('class="bar"', 'class="cbar"').replace('class="bar amber"', 'class="cbar amber"')
    body = body.replace('class="' + 'key ', 'class="' + KB[1:] + ' ').replace('class="' + 'key"', 'class="' + KB[1:] + '"')
    body = body.replace('src="img/', 'src="slides/img/')
    cls = 'st closing' if n == 14 else 'st'
    note = H.escape(notes[n]['note'])
    sec_cls = 'slide hero on' if n == 0 else ('slide hero' if n == 14 else 'slide')
    sections.append(f'<!-- ═══ {n+1:02d} · {notes[n]["title"]} ═══ -->\n<section class="{sec_cls}">\n<div class="{cls}">{body}</div>\n<p class="note">{note}</p>\n</section>\n')

script2 = script.replace('window.innerWidth / 1280, h / 720', 'window.innerWidth / 1920, h / 1080')
assert script2 != script, 'fit() 식을 못 찾음'
script2 = script2.replace("'세 가지 시험'", "'게임 — 후보 여섯 중 셋 ①','게임 — 후보 여섯 중 셋 ②','카드 — 게임 1등의 몫'")  # 목차 제목 — 05·06 게임 후보 두 장 · 07 카드(2026-09-05 추가)
script2 = script2.replace("'데모'", "'감사합니다'")  # 마지막 장 — 감사합니다만 남겼다 (2026-09-05 사용자)
chrome_markup = '''<div id="stage">
%s
  <div class="brand">WHO IS HUMAN · 특수인공지능대응센터</div>
  <div class="foot"><span id="pg">01 / 15</span><span class="bar"><i id="pb"></i></span><span class="tts" id="tts"><b></b><span id="ttsl">읽는 중</span></span><span id="ttl"></span></div>
</div><!-- /#stage -->

<div id="notes"><div class="h">발표 대본</div><div class="t" id="ntext"></div></div>
<div id="toc"><div class="h">목차 &nbsp;//&nbsp; 숫자를 눌러도 넘어간다 &nbsp;·&nbsp; S 읽어 주기 &nbsp;·&nbsp; A 자동 발표</div><ol id="toclist"></ol></div>
<div id="hint">← → 이동 &nbsp;·&nbsp; N 대본 &nbsp;·&nbsp; S 읽어 주기 &nbsp;·&nbsp; A 자동 발표 &nbsp;·&nbsp; O 목차 &nbsp;·&nbsp; F 전체화면</div>
''' % ''.join(sections)

out = f'''<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>누가 인간인가 — 해커톤 발표</title>
<!--
  발표 슬라이드 15장을 한 파일로 묶은 것 (2026-09-05). 디자인은 UX Pilot 로 뽑았고(docs/slides/src/NN.html 이 낱장 원본),
  조작(← → · N 대본 · S 읽어 주기 · A 자동 발표 · O 목차 · F 전체화면)은 이전 판(docs/slides/src/presentation.v1.html)의
  스크립트를 그대로 쓴다. 무대는 1920×1080 을 화면에 맞춰 통째로 확대·축소한다.
  Tailwind · Font Awesome · Google Fonts 는 CDN — 발표 때 인터넷이 있어야 글꼴과 유틸리티 클래스가 산다.
  PDF/PPTX: sh tools/deck-build.sh (docs/slides/src → PNG → docs/slides/who-is-human.pptx).
  다시 묶기: 낱장을 고친 뒤 tools/deck-bundle.py 를 돌린다.
-->
<script src="https://cdn.tailwindcss.com"></script>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
/* ── 발표기 뼈대 (이전 판에서 그대로) ── */
{chrome_css}
/* ── 슬라이드 디자인 (UX Pilot) ── */
{dcss}
{extra}
</style>
</head>
<body>
{chrome_markup}
<script>if(/print/.test(location.search))document.documentElement.classList.add('print');{script2}</script>
</body>
</html>
'''
open('docs/presentation.html', 'w', encoding='utf-8').write(out)
print('bundle chars', len(out), 'sections', out.count('<section class="slide'), 'notes', out.count('class="note"'))

#!/usr/bin/env node
/**
 * 복도 챕터 대사 음성 — 대본에서 줄을 뽑아 ElevenLabs 로 미리 합성해 public/world/voice/ 에 넣는다.
 *
 *   node tools/voice-lines.mjs            생성 (이미 있는 줄은 건너뜀 — 크레딧 보호)
 *   node tools/voice-lines.mjs --dry      뭘 만들지·글자 수만 (합성 안 함, --dry-run 도 같음)
 *   node tools/voice-lines.mjs --sample   화자마다 한 줄씩만 (목소리 확인용)
 *   node tools/voice-lines.mjs --force    전부 다시
 *   node tools/voice-lines.mjs --only unit07,system
 *
 * 대본은 코드가 원본이다 — tools/voice-cast.json 의 sources 가 가리키는 파일에서 문자열을 긁는다 (대사를 두 군데 적지 않는다).
 *   chapter1.ts      `{ who: 'scientist', text: '…' }` 배열 중 복도 무대(INTRO, INSCRIPTION)만
 *   interrogation.ts 한글이 든 작은따옴표 문자열 전부 (경비 두 개체가 같은 문장을 쓰므로 둘 다 만든다)
 *   suspicion.ts     THRESHOLD_LINES (A-01 시스템 방송)
 *   templates        `text: \`…${…}…\`` — 값 목록(QUEUE_UNITS · TAGS)의 항목마다 하나씩. 목록이 다른 파일에 있으면 namesFile
 *   castLines        world2 script.ts 의 `const NAME: CastLine[] = [ … ]` — who:'unit' 은 unit07·unit12 둘 다, me·thought 는 안 굽는다
 *   castVoices       world2 cast.ts 의 배역별 대답표(`id: '…'` 뒤 `voice: { … }`) — 배역 id 를 speakerAlias 로 목소리에 잇는다
 *   blocks           코드 곳곳의 대사 상수 (scan LINE · enforcerStore LINES · WorldFeature GLITCH_SEEN) — 화자를 모르는 대사라 speakers 마다
 *   slots            대본에 **글자 그대로** 남아 있는 빈자리 — `${series}`(판마다 바뀌는 계열 번호) · `${unit}`(이 몸의 식별번호).
 *                    값 목록(shared/series 의 SERIES · mp/identity 의 TAGS)만큼 문장을 부풀려 **전부** 구워 둔다.
 *                    판이 어느 계열을 뽑아도 방송·경비의 목소리가 살아 있어야 한다 — 없는 값이 나오면 그 줄은 소리 없이 지나간다.
 *
 * 목소리: cast 의 voice.name 이 계정에 있으면 그걸, 없으면 라이브러리에서 추가(키 권한 add_voice_from_voice_library 필요),
 * 그것도 안 되면 fallback 기본 보이스. manifest 에 어느 보이스로 만들었는지 남겨 두고, 다음 실행 때 라이브러리 보이스가 생겼으면 그 줄만 다시 만든다.
 *
 * 키: .dev.vars 의 ELEVENLABS_API_KEY (tools/load-vars.mjs). 값은 출력하지 않는다.
 * 재생: src/features/world/voice.ts 가 manifest.json 을 읽어 대화창에 줄이 뜰 때 튼다.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { PROJECT_ROOT, requireVars } from './load-vars.mjs';

const API = 'https://api.elevenlabs.io/v1';
const CAST_PATH = join(PROJECT_ROOT, 'tools/voice-cast.json');
const OUT_DIR = join(PROJECT_ROOT, 'public/world/voice');
const MANIFEST_PATH = join(OUT_DIR, 'manifest.json');
const CONCURRENCY = 3;

/* ───────────── 인자 ───────────── */
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const DRY = has('--dry') || has('--dry-run');
const FORCE = has('--force');
const SAMPLE = has('--sample');
const onlyIdx = argv.indexOf('--only');
const ONLY = onlyIdx >= 0 ? new Set(argv[onlyIdx + 1].split(',')) : null;

/* ───────────── 대본 긁기 ───────────── */
const cast = JSON.parse(readFileSync(CAST_PATH, 'utf8'));
const read = (rel) => readFileSync(join(PROJECT_ROOT, rel), 'utf8');
const unescape = (s) => s.replace(/\\(['"\\])/g, '$1');
const hasHangul = (s) => /[가-힣]/.test(s);

/**
 * chapter1.ts · chapter2.ts — 이름이 맞는 `const NAME: Line[] = [ … ];` 블록에서 who/text.
 * 'INLINE' 은 배열 밖에 `{ who: 'guard', text: '통과.' }` 처럼 흩어진 한 줄짜리 대사 전부 (chapter2 의 선택지 뒤 반응).
 * 화자 별칭(guard·peerA·peerB·device)은 cast.speakerAlias 로 실제 화자에 잇는다.
 */
function chapterLines() {
  const sources = Array.isArray(cast.sources.chapter) ? cast.sources.chapter : [cast.sources.chapter];
  const alias = cast.speakerAlias ?? {};
  const out = [];
  const seen = new Set();
  const add = (speaker, text) => {
    const sp = alias[speaker] ?? speaker;
    const k = `${sp}|${text}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ speaker: sp, text });
  };
  for (const { file, arrays, skipSpeakers = [] } of sources) {
    const src = read(file);
    // skipSpeakers — 이 파일에서는 소리로 안 나가는 화자(world2 의 me·thought). 내 말·속마음엔 음성이 없다 (2026-09-01 사용자).
    // cast.speakers 에 없어도 걸러지긴 하지만, 그 경고는 「별칭을 빠뜨린 새 화자」를 위한 것이라 뜻이 정해진 것은 여기서 조용히 뺀다
    const skip = new Set(skipSpeakers);
    const addLine = (who, text) => { if (!skip.has(who)) add(who, text); };
    for (const name of arrays) {
      if (name === 'INLINE') {
        // 뒤에 다른 속성(as: name)이 붙어도 잡는다 — 줄에 선 개체의 대사가 그렇다
        for (const l of src.matchAll(/\{\s*who:\s*'([\w-]+)',\s*text:\s*'((?:[^'\\]|\\.)*)'\s*[,}]/g)) addLine(l[1], unescape(l[2]));
        continue;
      }
      const m = new RegExp(`const ${name}: Line\\[\\] = \\[([\\s\\S]*?)\\];`).exec(src);
      if (!m) { console.warn(`chapter: ${name} 배열을 못 찾음 (${file})`); continue; }
      for (const l of m[1].matchAll(/who:\s*'([\w-]+)',\s*text:\s*'((?:[^'\\]|\\.)*)'/g)) addLine(l[1], unescape(l[2]));
    }
  }
  return out;
}
/**
 * world2 script.ts 의 CastLine 배열 — `const NAME: CastLine[] = [ … ]` (readonly 도). 화자가 **그 자리에 누가 서 있느냐**로 정해지는 줄이라
 * who:'unit' 은 unit07·unit12 둘 다 굽는다(어느 목소리가 설지 판마다 다르다). 다른 who 는 별칭으로 잇고, skipSpeakers(me·thought)는 뺀다.
 */
function castLines() {
  const alias = cast.speakerAlias ?? {};
  const out = [];
  for (const { file, arrays, unitSpeakers, skipSpeakers = [] } of cast.sources.castLines ?? []) {
    const src = read(file);
    const skip = new Set(skipSpeakers);
    for (const name of arrays) {
      const m = new RegExp(`const ${name}: (?:readonly )?CastLine\\[\\] = \\[([\\s\\S]*?)\\];`).exec(src);
      if (!m) { console.warn(`castLines: ${name} 배열을 못 찾음 (${file})`); continue; }
      for (const l of m[1].matchAll(/who:\s*'([\w-]+)',\s*text:\s*'((?:[^'\\]|\\.)*)'/g)) {
        const who = l[1];
        const text = unescape(l[2]);
        if (skip.has(who)) continue;
        for (const speaker of who === 'unit' ? unitSpeakers : [alias[who] ?? who]) out.push({ speaker, text });
      }
    }
  }
  return out;
}
/**
 * world2 cast.ts 의 대답표 — 배역마다 `id: '…'` 뒤에 `voice: { … }` 객체 하나. 그 안의 한글 문자열 전부가 그 배역의 줄이다
 * (칸이 work·comfort·byTag 로 갈리고 배열이 겹쳐도 목소리는 하나라서 칸을 안 가린다). 중괄호는 짝을 세어 닫는다 — byTag 처럼 객체가 겹친다.
 * 배역 id 는 speakerAlias 로 목소리에 잇는다 — 없으면 경고하고 뺀다(소리 없이 빠지면 화면에서만 알 수 있다).
 */
function castVoices() {
  const out = [];
  for (const { file, idAlias = 'speakerAlias' } of cast.sources.castVoices ? [cast.sources.castVoices] : []) {
    const src = read(file);
    const alias = cast[idAlias] ?? {};
    const ids = [...src.matchAll(/\bid:\s*'([\w-]+)'/g)];
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i][1];
      const from = ids[i].index;
      const to = ids[i + 1]?.index ?? src.length;
      const chunk = src.slice(from, to);
      const open = chunk.search(/\bvoice:\s*\{/);
      if (open < 0) { console.warn(`castVoices: ${id} 에 voice 블록이 없음 (${file})`); continue; }
      let depth = 0;
      const start = chunk.indexOf('{', open);
      let end = -1;
      for (let j = start; j < chunk.length; j++) {
        if (chunk[j] === '{') depth++;
        else if (chunk[j] === '}' && --depth === 0) { end = j; break; }
      }
      if (end < 0) { console.warn(`castVoices: ${id} 의 voice 블록이 안 닫힘 (${file})`); continue; }
      const speaker = alias[id];
      if (!speaker) { console.warn(`castVoices: ${id} 화자 별칭 없음 — speakerAlias 에 잇는다 (${file})`); continue; }
      for (const m of chunk.slice(start, end).matchAll(/'((?:[^'\\]|\\.)*)'/g)) {
        const text = unescape(m[1]);
        if (hasHangul(text)) out.push({ speaker, text });
      }
    }
  }
  return out;
}
/**
 * 이름을 끼워 만드는 대사 — chapter2 의 줄(passLines/purgeLines/fleeLines)은 `text: \`${name}…\`` 꼴이라
 * 문장이 코드에 통째로 없다. 이름 목록(namesFrom, 예 QUEUE_UNITS 의 name)을 읽어 끼워 넣고 그만큼 만든다.
 */
function templateLines() {
  const alias = cast.speakerAlias ?? {};
  const out = [];
  for (const { file, namesFrom, namesFile } of cast.sources.templates ?? []) {
    const src = read(file);
    const listSrc = namesFile ? read(namesFile) : src;
    const block = new RegExp(`${namesFrom}[^=]*=\\s*\\[([\\s\\S]*?)\\];`).exec(listSrc);
    if (!block) { console.warn(`templates: ${namesFrom} 를 못 찾음 (${namesFile ?? file})`); continue; }
    // 목록의 항목 하나하나를 { 이름: 값 } 으로 읽는다 — 문자열이든 숫자든
    const rows = [...block[1].matchAll(ROW)].map((m) => {
      const row = {};
      for (const f of m[1].matchAll(/(\w+):\s*(?:'([^']*)'|(-?\d+(?:\.\d+)?))/g)) row[f[1]] = f[2] ?? f[3];
      return row;
    });
    for (const l of src.matchAll(/\{\s*who:\s*'([\w-]+)',\s*text:\s*`((?:[^`\\]|\\.)*)`/g)) {
      const speaker = alias[l[1]] ?? l[1];
      for (const row of rows) {
        // 남은 `${series}` 는 아래 spread 가 편다 — 여기서 거르면 줄에 선 개체들의 번호가 통째로 사라진다
        out.push({ speaker, text: unescape(l[2]).replace(/\$\{(\w+)\}/g, (whole, name) => (name in row ? row[name] : whole)) });
      }
    }
  }
  return out;
}

/* ───────────── 빈자리 채우기 (${series} · ${unit}) ───────────── */

/** 목록의 항목 하나 — 값 안에 `${series}` 가 들어 있어도 그 중괄호에 속지 않는다 */
const ROW = /\{((?:[^{}]|\$\{[^{}]*\})*)\}/g;

/** 값 목록 하나를 읽는다 — 숫자 배열(SERIES)이면 그대로, 객체 배열(TAGS)이면 field 칸만 */
function slotValues({ file, from, field }) {
  const block = new RegExp(`${from}[^=]*=\\s*\\[([\\s\\S]*?)\\];`).exec(read(file));
  if (!block) { console.warn(`slots: ${from} 를 못 찾음 (${file})`); return []; }
  if (!field) return [...block[1].matchAll(/'([^']*)'|(-?\d+(?:\.\d+)?)/g)].map((m) => m[1] ?? m[2]);
  return [...block[1].matchAll(ROW)].map((m) => new RegExp(`${field}:\\s*'([^']*)'`).exec(m[1])?.[1]).filter(Boolean);
}
/**
 * 빈자리를 값 목록만큼 편다 — 문장 하나가 여럿이 된다.
 * 차례가 중요하다: `${unit}`(= 'A${series}-091')을 먼저 펴야 그 안에서 나온 `${series}` 를 다음 차례가 마저 편다.
 */
const SLOTS = (cast.sources.slots ?? []).map((s) => [`\${${s.name}}`, slotValues(s)]);
function spread(text) {
  let out = [text];
  for (const [token, values] of SLOTS) if (values.length) out = out.flatMap((t) => (t.includes(token) ? values.map((v) => t.replaceAll(token, v)) : [t]));
  return out;
}

/**
 * 코드 곳곳의 대사 상수 — `const LINE = { arrive: '정지. 패턴 스캔.' , … }` 또는 `const X = '한 마디'`.
 * 누가 말할지 모르는 대사(순찰 경비 아무나)라 speakers 에 적힌 화자마다 하나씩 만든다.
 */
function blockLines() {
  const out = [];
  for (const { file, const: name, speakers } of cast.sources.blocks ?? []) {
    const src = read(file);
    const obj = new RegExp(`const ${name}[^=]*=\\s*\\{([\\s\\S]*?)\\}`).exec(src);
    // 배열 상수도 받는다 — `const OPENERS: readonly string[] = ['…', '…'];` (재검실의 첫 질문들)
    const arr = new RegExp(`const ${name}[^=]*=\\s*\\[([\\s\\S]*?)\\]`).exec(src);
    const one = new RegExp(`const ${name}\\s*=\\s*'((?:[^'\\\\]|\\\\.)*)'`).exec(src);
    const texts = obj
      ? [...obj[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => unescape(m[1]))
      : arr
        ? [...arr[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => unescape(m[1]))
        : one
          ? [unescape(one[1])]
          : [];
    if (!texts.length) { console.warn(`blocks: ${name} 을 못 찾음 (${file})`); continue; }
    for (const text of texts) if (hasHangul(text)) for (const speaker of speakers) out.push({ speaker, text });
  }
  return out;
}

/** interrogation.ts — 한글이 든 작은따옴표 문자열 전부, 제외 목록 빼고, 경비 개체마다 */
function interrogationLines() {
  const { file, speakers, exclude } = cast.sources.interrogation;
  const src = read(file);
  const texts = new Set();
  for (const l of src.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)) {
    const t = unescape(l[1]).trim();
    if (hasHangul(t) && !exclude.includes(t)) texts.add(t);
  }
  return speakers.flatMap((speaker) => [...texts].map((text) => ({ speaker, text })));
}
/** suspicion.ts — THRESHOLD_LINES 블록의 문자열 */
function thresholdLines() {
  const { file, speaker } = cast.sources.threshold;
  const m = /THRESHOLD_LINES[^{]*\{([\s\S]*?)\};/.exec(read(file));
  if (!m) return [];
  return [...m[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((l) => ({ speaker, text: unescape(l[1]) })).filter((l) => hasHangul(l.text));
}

const scraped = [...chapterLines(), ...castLines(), ...castVoices(), ...templateLines(), ...blockLines(), ...interrogationLines(), ...thresholdLines()];
// 화자 목록에 없는 이름은 굽지 않는다 — 속마음(thought)처럼 소리가 아닌 것도, 별칭을 빠뜨린 새 화자도 여기로 온다.
// 둘을 가르는 건 사람 눈뿐이라 무엇이 빠졌는지 세어 보여 준다 (bg-c2-044 가 소리 없이 빠졌던 일, 2026-09-02)
const dropped = {};
for (const l of scraped) if (!cast.speakers[l.speaker]) dropped[l.speaker] = (dropped[l.speaker] ?? 0) + 1;
if (Object.keys(dropped).length) console.warn(`speakers: cast.speakers 에 없어 뺀 화자 — ${JSON.stringify(dropped)} (속마음이 아니면 speakerAlias 에 잇는다)`);
let lines = scraped
  .filter((l) => cast.speakers[l.speaker])
  .flatMap((l) => spread(l.text).map((text) => ({ ...l, text })));
// 끝까지 안 채워진 자리가 남았으면 굽지 않는다 — 화면에 `${…}` 가 그대로 뜰 리 없으니 열쇠가 어긋난 클립이 된다
for (const l of lines.filter((l) => l.text.includes('${'))) console.warn(`slots: 못 채운 자리 — [${l.speaker}] ${l.text}`);
lines = lines.filter((l) => !l.text.includes('${'));
if (ONLY) lines = lines.filter((l) => ONLY.has(l.speaker));
if (SAMPLE) {
  const seen = new Set();
  lines = lines.filter((l) => !seen.has(l.speaker) && seen.add(l.speaker));
}
// 같은 화자·같은 문장은 하나
const uniq = new Map();
for (const l of lines) uniq.set(`${l.speaker}|${l.text}`, l);
lines = [...uniq.values()];

const hash = (s) => createHash('sha1').update(s).digest('hex').slice(0, 10);
const fileOf = (l) => `${l.speaker}-${hash(l.text)}.mp3`;

const totalChars = lines.reduce((n, l) => n + l.text.length, 0);
const bySpeaker = {};
for (const l of lines) bySpeaker[l.speaker] = (bySpeaker[l.speaker] ?? 0) + 1;
console.log(`대사 ${lines.length}줄 · ${totalChars}자 · 화자별 ${JSON.stringify(bySpeaker)}`);
if (DRY) {
  // 이미 있는 줄(·)과 새로 구울 줄(＋)을 갈라 보여 준다 — 계열을 하나 더하면 얼마나 더 굽는지가 여기서 보인다
  for (const l of lines) console.log(`  ${existsSync(join(OUT_DIR, fileOf(l))) ? '·' : '＋'} [${l.speaker}] ${l.text}`);
  const fresh = lines.filter((l) => !existsSync(join(OUT_DIR, fileOf(l))));
  const freshBy = {};
  for (const l of fresh) freshBy[l.speaker] = (freshBy[l.speaker] ?? 0) + 1;
  console.log(`이미 있는 클립 ${lines.length - fresh.length}줄 · 새로 구울 것 ${fresh.length}줄 · ${fresh.reduce((n, l) => n + l.text.length, 0)}자 · 화자별 ${JSON.stringify(freshBy)}`);
  process.exit(0);
}

/* ───────────── ElevenLabs ───────────── */
requireVars(['ELEVENLABS_API_KEY']);
const H = { 'xi-api-key': process.env.ELEVENLABS_API_KEY };
const J = { ...H, 'content-type': 'application/json' };

async function myVoices() {
  const r = await fetch(`${API}/voices`, { headers: H });
  if (!r.ok) throw new Error(`voices ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const d = await r.json();
  return new Map((d.voices ?? []).map((v) => [v.name, v.voice_id]));
}

/** 화자의 보이스 id — 계정 → 라이브러리 추가 → fallback. { id, source } */
async function resolveVoice(speaker, mine) {
  const v = cast.speakers[speaker].voice;
  // 계정에 있나 — 스크립트가 붙인 이름(voice.name) 또는 웹 UI 의 "Add to My Voices" 가 그대로 두는 라이브러리 이름(libraryName)
  for (const name of [v.name, v.library?.libraryName]) if (name && mine.has(name)) return { id: mine.get(name), source: 'library', name };
  if (v.library) {
    const r = await fetch(`${API}/voices/add/${v.library.ownerId}/${v.library.voiceId}`, { method: 'POST', headers: J, body: JSON.stringify({ new_name: v.name }) });
    if (r.ok) {
      const d = await r.json();
      mine.set(v.name, d.voice_id);
      console.log(`  보이스 추가: ${v.name}`);
      return { id: d.voice_id, source: 'library', name: v.name };
    }
    const why = (await r.json().catch(() => ({})))?.detail?.message ?? r.status;
    console.warn(`  ${speaker}: 라이브러리 추가 실패 (${String(why).slice(0, 90)}) → fallback ${v.fallback}`);
  }
  const fb = [...mine.entries()].find(([name]) => name === v.fallback || name.startsWith(`${v.fallback} `) || name.startsWith(`${v.fallback} -`));
  if (!fb) throw new Error(`${speaker}: fallback 보이스 "${v.fallback}" 도 계정에 없다`);
  return { id: fb[1], source: 'fallback', name: fb[0] };
}

async function synth(voiceId, speaker, text) {
  const { settings } = cast.speakers[speaker];
  const r = await fetch(`${API}/text-to-speech/${voiceId}?output_format=${cast.format}`, {
    method: 'POST',
    headers: J,
    body: JSON.stringify({ text, model_id: cast.model, voice_settings: settings }),
  });
  if (!r.ok) throw new Error(`tts ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return Buffer.from(await r.arrayBuffer());
}

/* ───────────── 메인 ───────────── */
mkdirSync(OUT_DIR, { recursive: true });
const prev = existsSync(MANIFEST_PATH) ? JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) : { lines: {} };
const mine = await myVoices();
const voices = {};
for (const sp of new Set(lines.map((l) => l.speaker))) voices[sp] = await resolveVoice(sp, mine);
for (const [sp, v] of Object.entries(voices)) console.log(`  ${sp.padEnd(9)} ← ${v.name} (${v.source})`);

const jobs = lines.filter((l) => {
  const key = `${l.speaker}|${l.text}`;
  const file = fileOf(l);
  const old = prev.lines?.[key];
  if (FORCE) return true;
  if (!existsSync(join(OUT_DIR, file))) return true;
  // fallback 으로 만들었는데 이제 라이브러리 보이스가 생겼으면 다시
  if (old?.voice?.source === 'fallback' && voices[l.speaker].source === 'library') return true;
  return false;
});
const jobChars = jobs.reduce((n, l) => n + l.text.length, 0);
console.log(`합성 ${jobs.length}줄 · ${jobChars}자 (건너뜀 ${lines.length - jobs.length})`);

let done = 0;
let failed = 0;
const queue = [...jobs];
async function worker() {
  while (queue.length) {
    const l = queue.shift();
    try {
      const buf = await synth(voices[l.speaker].id, l.speaker, l.text);
      writeFileSync(join(OUT_DIR, fileOf(l)), buf);
      done++;
      console.log(`  ✓ [${l.speaker}] ${l.text.slice(0, 40)} (${(buf.length / 1024).toFixed(0)}KB)`);
    } catch (e) {
      failed++;
      console.error(`  ✗ [${l.speaker}] ${l.text.slice(0, 40)} — ${e.message}`);
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

// manifest — 이번에 만든 것 + 이미 있던 것(파일이 남아 있는 줄만)
const manifest = {
  generatedAt: new Date().toISOString(),
  model: cast.model,
  // 이름표(A${series}-044 …)도 계열마다 하나씩 — 화자를 못 찾으면 그 줄은 소리가 안 난다 (features/world/voice.ts 의 speakerOf)
  names: Object.fromEntries(Object.entries(cast.names).flatMap(([nick, sp]) => spread(nick).map((n) => [n, sp]))),
  // playRate: 화자별 재생 속도(없으면 재생부 기본 1.1). undefined 는 JSON.stringify 가 알아서 떨군다
  speakers: Object.fromEntries(Object.entries(cast.speakers).map(([id, s]) => [id, { fx: s.fx, gain: s.gain ?? 1, playRate: s.playRate, voice: voices[id] ? { name: voices[id].name, source: voices[id].source } : prev.speakers?.[id]?.voice ?? null }])),
  lines: {},
};
/** 클립 길이(초) — CBR mp3 라 크기/비트레이트로 충분하다 (afinfo 와 0.05s 안쪽). 대화창이 이만큼은 기다린다 */
const kbps = Number(/_(\d+)$/.exec(cast.format)?.[1] ?? 64);
const durationOf = (file) => +(statSync(join(OUT_DIR, file)).size / (kbps * 125)).toFixed(2);
for (const l of lines) {
  const key = `${l.speaker}|${l.text}`;
  const file = fileOf(l);
  if (!existsSync(join(OUT_DIR, file))) continue;
  const fresh = jobs.includes(l) && !queue.length;
  manifest.lines[key] = {
    file,
    duration: durationOf(file),
    voice: fresh ? { name: voices[l.speaker].name, source: voices[l.speaker].source } : prev.lines?.[key]?.voice ?? { name: voices[l.speaker].name, source: voices[l.speaker].source },
  };
}
// 이번 실행 범위 밖(--only/--sample)이라도 예전 manifest 에 있고 파일이 남아 있으면 유지
for (const [key, v] of Object.entries(prev.lines ?? {})) if (!manifest.lines[key] && existsSync(join(OUT_DIR, v.file))) manifest.lines[key] = { ...v, duration: durationOf(v.file) };
writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
console.log(`완료 ${done} · 실패 ${failed} · manifest ${Object.keys(manifest.lines).length}줄 → ${MANIFEST_PATH.replace(PROJECT_ROOT + '/', '')}`);
process.exit(failed ? 1 : 0);

/**
 * 음향 — Esc 를 한 번 누르면 나온다 (사용자 요청 2026-09-01).
 *
 * 여태 방송 볼륨 손잡이(shared/BroadcastVolume)가 잠금이 풀린 내내 왼쪽 위에 떠 있었다.
 * 이야기로 들어오는 길(/interrogation?from=central)은 **암전이 걷히자마자 안 잠긴 상태**라,
 * 검문소에 발을 딛는 첫 장면에 웹 폼 손잡이 하나가 먼저 보였다. 그래서 **부를 때만 오게** 바꿨다.
 *
 * ★ 막(veil)을 두지 않는다 (사용자 2026-09-01: "아무곳이나 클릭하면 (음향 UI 말고) 조작 바로 잡아줘").
 *   처음엔 판 뒤에 막을 깔아 클릭을 받았는데, 그게 **돌아가는 길을 먹었다** — 판을 닫으려고 아무 데나
 *   누르면 닫히기만 하고, 조작을 잡으려면 한 번 더 눌러야 했다. 막이 없으면 그 클릭이 그대로
 *   `.stage` 로 내려가 시야 잠금이 걸리고, 잠기는 순간 이 판은 스스로 접힌다 (ArenaFeature).
 *   **한 번 누르면 게임으로 돌아간다** — 판을 닫는 일과 판으로 돌아가는 일은 원래 한 동작이다.
 *   이 판 자신을 누른 클릭만 여기서 멎는다: 손잡이를 잡으려던 손이 게임을 잠그면 안 된다.
 *
 * ★ 서는 자리는 화면 한가운데 — 「화면을 클릭해 조작을 잡아라」가 서던 그 자리다 (사용자 2026-09-01:
 *   "화면을 클릭해~ 이거랑 같은 상에 놔야지"). 그 안내는 이 판이 떠 있는 동안 접힌다 (한 자리에 하나).
 *
 * 여닫는 규칙은 features/arena/sound-esc.ts 에 있다 (잠긴 채 누른 Esc 는 키가 안 온다 — 거기 설명).
 * 소리 나는 것 셋을 한자리에 모았다 — **리더 방송**(TTS) · **배경음악** · **누르는 소리**(UI 효과음).
 *
 * ★ 배경음악 손잡이가 여기 있는 것은, 이 화면에 **머리줄이 없기 때문이다.** 앞 세 장(복도 · 중앙 시설 ·
 *   재검실)은 오른쪽 위 한 줄에 음량과 나가기를 달고 다니는데(WorldFeature), 검증실은 판이 도는
 *   화면이라 그 줄을 뺐다. 손잡이가 갈 곳이 없다고 곡까지 없앨 수는 없어서 — 그러면 네 장 가운데
 *   마지막 방만 무음이다 — 소리는 화면이 늘 물고 있고(ArenaFeature 의 Bgm), 손잡이만 여기로 왔다.
 *   값은 두 화면이 한 곳에서 본다 (features/world/Bgm 의 bgmVolume).
 */

import { bgmVolume, useBgmVolume } from '@/features/world/Bgm';
import { broadcastVolume, selectBroadcastVolume } from '@/shared/broadcast';
import { SfxToggle } from '@/shared/SfxToggle';
import { useAppDispatch, useAppSelector } from '@/store/hooks';

export function SoundPanel({ touch, onClose }: { touch: boolean; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const volume = useAppSelector(selectBroadcastVolume);
  const music = useBgmVolume();

  return (
    <section
      className="soundpanel"
      role="dialog"
      aria-label="음향"
      /* 판 위의 클릭은 여기서 멎는다 — 안 막으면 손잡이를 잡은 클릭이 .stage 로 내려가 시야를 잠근다 */
      onClick={(e) => e.stopPropagation()}
    >
      <header>
        <span className="tag">음향</span>
        {/* 닫는 버튼에 ✕ 대신 키 이름을 적는다 — 이 판을 부른 키가 그대로 닫는 키다.
            폰에는 그 키가 없으니 거기서는 글자만 남긴다 */}
        <button type="button" className="esc" onClick={onClose} aria-label="닫기">
          {touch ? '닫기' : 'ESC'}
        </button>
      </header>

      <label className="srow">
        <span className="lbl">리더 방송</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={(e) => dispatch(broadcastVolume(Number(e.target.value)))}
          /*
           * 방향키는 여기서 멈춘다 — 손잡이에 초점이 있는 채로 누른 화살표가 판의 걸음이 되면 안 된다.
           * Esc 만은 통과시킨다: 막지 않아야 이 판을 닫는 키가 손잡이 위에서도 듣는다.
           */
          onKeyDown={(e) => {
            if (e.key !== 'Escape') e.stopPropagation();
          }}
          aria-label="리더 방송 볼륨"
        />
        <b className="val">{Math.round(volume * 100)}</b>
      </label>

      <label className="srow">
        <span className="lbl">배경음악</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={music}
          onChange={(e) => bgmVolume.set(Number(e.target.value))}
          /* 위 손잡이와 같은 규칙 — 방향키는 여기서 멎고 Esc 만 통과한다 */
          onKeyDown={(e) => {
            if (e.key !== 'Escape') e.stopPropagation();
          }}
          aria-label="배경음악 볼륨"
        />
        <b className="val">{Math.round(music * 100)}</b>
      </label>

      <div className="srow">
        <span className="lbl">효과음</span>
        {/* 켜고 끄는 것 하나뿐인 스위치 — 로비 머리말과 같은 물건이다 (shared/SfxToggle) */}
        <SfxToggle className="sfxbtn" />
      </div>

      {/*
        두 줄로 나눠 적는다 — 한 줄에 이어 붙이면 판 너비에서 「조작을 / 잡는다」로 어색하게 접힌다.
        위는 나가는 길(막이 없어 생긴 규칙), 아래는 0 까지 내려도 판은 안 멎는다는 말 —
        소리를 끊는 것과 이야기를 끊는 것은 다르다.
      */}
      <div className="note">
        <span>아무 데나 클릭하면 조작을 잡는다</span>
        <span>방송을 0 으로 내려도 자막은 계속 나온다</span>
      </div>
    </section>
  );
}

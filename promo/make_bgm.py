#!/usr/bin/env python3
"""GAME WORLD 宣伝動画用の BGM を合成する（既存曲は使わない＝著作権フリー）。

明るいチップチューン調。120BPM・4/4・C-G-Am-F の循環。
  0〜4.2s  フック: 低音と小さな音だけ（少し不安な雰囲気）
  4.2s〜   ロゴ登場からドラムとメロディが入る
  34.4s〜  CTA: 全部入り＋最後はフェードアウト
場面の切り替え音と、最後のボタンの「ピコン」も入れる。

使い方: python3 make_bgm.py out.wav
"""
import sys
import wave

import numpy as np

SR = 44100
DUR = 40.0
BPM = 120
BEAT = 60 / BPM  # 0.5s
N = int(SR * DUR)
rng = np.random.default_rng(7)

CUTS = [4.2, 8.6, 15.0, 21.2, 27.4, 34.4]  # promo.html の SCENES と揃える
DING_AT = 34.4 + 1.3 + 0.3

NOTE = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def hz(name: str, octave: int) -> float:
    return 440.0 * 2 ** ((NOTE[name] + 12 * (octave - 4) - 9) / 12)


def env(n, a=0.005, d=0.1, s=0.5, r=0.05):
    e = np.ones(n)
    a_n, d_n, r_n = int(a * SR), int(d * SR), int(r * SR)
    a_n, d_n, r_n = min(a_n, n), min(d_n, max(0, n - a_n)), min(r_n, n)
    if a_n:
        e[:a_n] = np.linspace(0, 1, a_n)
    if d_n:
        e[a_n:a_n + d_n] = np.linspace(1, s, d_n)
    e[a_n + d_n:] = s
    if r_n:
        e[-r_n:] *= np.linspace(1, 0, r_n)
    return e


def square(f, n, duty=0.5):
    t = (np.arange(n) / SR) * f
    return np.where((t % 1.0) < duty, 1.0, -1.0)


def tri(f, n):
    t = (np.arange(n) / SR) * f
    return 2 * np.abs(2 * (t % 1.0) - 1) - 1


def put(buf, t0, sig):
    i = int(t0 * SR)
    if i >= len(buf):
        return
    j = min(len(buf), i + len(sig))
    buf[i:j] += sig[: j - i]


def lowpass(x, k=6):
    ker = np.ones(k) / k
    return np.convolve(x, ker, mode="same")


# --- パート ---
lead = np.zeros(N)
bass = np.zeros(N)
pad = np.zeros(N)
drums = np.zeros(N)
sfx = np.zeros(N)

PROG = [("C", ["C", "E", "G"], 3), ("G", ["G", "B", "D"], 2), ("A", ["A", "C", "E"], 2), ("F", ["F", "A", "C"], 2)]
# 明るい（メジャー）／フック部分は同じコードを使い、音量とパートで雰囲気を変える

# メロディ（各コードで 8 分音符 ×8 の度数。ペンタトニック風）
MEL = {
    "C": [["E", 5], ["G", 5], ["E", 5], ["C", 5], ["D", 5], ["E", 5], ["G", 5], ["E", 5]],
    "G": [["D", 5], ["G", 5], ["B", 5], ["G", 5], ["D", 5], ["B", 4], ["D", 5], ["G", 5]],
    "A": [["C", 5], ["E", 5], ["A", 5], ["E", 5], ["C", 5], ["E", 5], ["D", 5], ["C", 5]],
    "F": [["A", 4], ["C", 5], ["F", 5], ["C", 5], ["A", 4], ["C", 5], ["E", 5], ["F", 5]],
}

bars = int(DUR / (BEAT * 4)) + 1  # 20 小節
for b in range(bars):
    t_bar = b * BEAT * 4
    name, chord, boct = PROG[b % 4]
    sec = t_bar
    intro = sec < 4.2
    outro = sec >= 34.4

    # ベース（8 分音符でオクターブ跳ね）
    f0 = hz(name, boct)
    for k in range(8):
        t0 = t_bar + k * BEAT / 2
        f = f0 * (2 if k % 4 == 3 else 1)
        n = int(BEAT / 2 * SR * 0.9)
        sig = tri(f, n) * env(n, 0.004, 0.05, 0.7, 0.03) * (0.55 if intro else 0.7)
        put(bass, t0, sig)

    # パッド（コードをゆるく伸ばす）
    n = int(BEAT * 4 * SR)
    for c in chord:
        sig = square(hz(c, 4), n, 0.5) * env(n, 0.08, 0.3, 0.6, 0.15) * 0.05
        put(pad, t_bar, sig)

    # メロディ（イントロ以外）
    if not intro:
        pat = MEL[name]
        for k, (nn, oc) in enumerate(pat):
            if (b % 2 == 1) and k in (3, 7) and not outro:
                continue  # 休符を入れて抜けを作る
            t0 = t_bar + k * BEAT / 2
            n = int(BEAT / 2 * SR * 0.85)
            sig = square(hz(nn, oc), n, 0.25) * env(n, 0.004, 0.08, 0.45, 0.04) * 0.16
            put(lead, t0, sig)
            if sec >= 15.0:  # 中盤から 1 オクターブ上を薄く重ねて盛り上げ
                put(lead, t0, square(hz(nn, oc + 1), n, 0.125) * env(n, 0.004, 0.05, 0.3, 0.03) * 0.045)
    else:
        # イントロ：コードの 1 音だけを 2 拍おきに小さく（不安げに）
        for k in (0, 4):
            t0 = t_bar + k * BEAT / 2
            n = int(BEAT * 1.6 * SR)
            put(lead, t0, square(hz(chord[(k // 4) % 3], 5), n, 0.5) * env(n, 0.01, 0.2, 0.3, 0.3) * 0.07)

    # ドラム（4.2s 以降）
    if sec >= 4.2:
        for beat in range(4):
            t0 = t_bar + beat * BEAT
            if beat in (0, 2):  # キック
                n = int(0.16 * SR)
                tt = np.arange(n) / SR
                f = 120 * np.exp(-tt * 22) + 42
                kick = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 14)
                put(drums, t0, kick * 0.9)
            if beat in (1, 3):  # スネア
                n = int(0.14 * SR)
                tt = np.arange(n) / SR
                sn = (rng.uniform(-1, 1, n) * 0.7 + np.sin(2 * np.pi * 190 * tt) * 0.3) * np.exp(-tt * 28)
                put(drums, t0, sn * 0.45)
            for h in (0, 1):  # ハイハット（8 分）
                n = int(0.04 * SR)
                tt = np.arange(n) / SR
                hh = (rng.uniform(-1, 1, n) - lowpass(rng.uniform(-1, 1, n), 4)) * np.exp(-tt * 90)
                put(drums, t0 + h * BEAT / 2, hh * (0.22 if h == 0 else 0.13))

# --- 効果音 ---
for t in CUTS:
    n = int(0.45 * SR)
    tt = np.arange(n) / SR
    noise = rng.uniform(-1, 1, n)
    # 上がっていくスイープ（ノイズの帯域を動かす簡易版）
    sweep = np.sin(2 * np.pi * np.cumsum(300 + 2600 * (tt / 0.45) ** 2) / SR)
    sig = (0.25 * lowpass(noise, 8) + 0.5 * sweep) * np.sin(np.pi * np.clip(tt / 0.45, 0, 1)) ** 1.5
    put(sfx, t - 0.2, sig * 0.5)
    # 切り替わりの「ポッ」
    n2 = int(0.12 * SR)
    pop = np.sin(2 * np.pi * 880 * np.arange(n2) / SR) * np.exp(-np.arange(n2) / SR * 30)
    put(sfx, t, pop * 0.35)

# ボタンの「ピコン」（2 音）
for i, f in enumerate([1318.5, 1975.5]):
    n = int(0.5 * SR)
    tt = np.arange(n) / SR
    ding = (np.sin(2 * np.pi * f * tt) + 0.3 * np.sin(2 * np.pi * f * 2 * tt)) * np.exp(-tt * 7)
    put(sfx, DING_AT + i * 0.11, ding * 0.3)

mix = lead + bass + pad + drums * 0.9 + sfx

# 全体の入りと終わり（最後の 2.5 秒でフェードアウト、入りは 0.4 秒）
fade_in = np.clip(np.arange(N) / (0.4 * SR), 0, 1)
fade_out = np.clip((N - np.arange(N)) / (2.5 * SR), 0, 1)
mix *= fade_in * fade_out

# 簡易コンプ（ピークを抑える）＋正規化
mix = np.tanh(mix * 1.4) / np.tanh(1.4)
mix = mix / np.max(np.abs(mix)) * 0.85

# 少しだけステレオ幅（左右にごくわずかな遅延差）
d = int(0.012 * SR)
left = mix
right = np.concatenate([np.zeros(d), mix[:-d]]) * 0.98
stereo = np.stack([left, right], axis=1)
pcm = (stereo * 32767).astype("<i2")

with wave.open(sys.argv[1], "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("ok", sys.argv[1], f"{DUR}s")

"""Compose the showcase's original background music bed.

An upbeat, light synth-pop loop at 120 BPM in F major (F, C, Dm, Bb), 30 seconds,
arranged to the video's timeline:
  0.0 to 4.0 s   sparse pad, ticking hats and a soft riser (the problem scene)
  4.0 s          full groove arrives as the tools collapse into the Live Orb
  28.0 s         groove resolves on a held F major chord under the closing lockup

Everything is synthesised here, so the track is original and free of licensing
questions. Replace it at any time via MUSIC in src/config/assets.ts.

Usage: python3 scripts/compose-music.py public/audio/music/upbeat-bed.wav
Requires numpy.
"""
import sys
import wave

import numpy as np

SR = 44100
BPM = 120
BEAT = 60 / BPM
BAR = BEAT * 4
LENGTH = 30.0
DROP = 4.0
END_GROOVE = 28.0
rng = np.random.default_rng(7)  # fixed seed: identical output every run

N = int(LENGTH * SR)
left = np.zeros(N)
right = np.zeros(N)


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def place(sig, start, pan=0.0, gain=1.0):
    i = int(start * SR)
    if i >= N:
        return
    sig = sig[: N - i] * gain
    left[i : i + len(sig)] += sig * np.sqrt(0.5 * (1 - pan))
    right[i : i + len(sig)] += sig * np.sqrt(0.5 * (1 + pan))


def env(length, attack, decay_rate):
    t = np.arange(int(length * SR)) / SR
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    return a * np.exp(-t * decay_rate), t


def lowpass(x, cutoff):
    alpha = 1 - np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc += alpha * (v - acc)
        y[i] = acc
    return y


def highpass(x, cutoff):
    return x - lowpass(x, cutoff)


# Chords (MIDI notes): F, C, Dm, Bb. Root for the bass, triad for the keys.
CHORDS = [
    (41, [65, 69, 72]),  # F
    (36, [64, 67, 72]),  # C
    (38, [62, 65, 69]),  # Dm
    (34, [62, 65, 70]),  # Bb
]


def chord_at(t):
    return CHORDS[int(t // BAR) % len(CHORDS)]


# ── Instruments ──────────────────────────────────────────────────────────────
def kick():
    e, t = env(0.32, 0.002, 9)
    freq = 45 + 75 * np.exp(-t * 28)
    phase = 2 * np.pi * np.cumsum(freq) / SR
    return np.sin(phase) * e


def clap():
    e, t = env(0.18, 0.001, 26)
    noise = highpass(rng.standard_normal(len(t)), 900)
    return noise * e * 0.5


def hat(open_=False):
    e, t = env(0.12 if open_ else 0.05, 0.001, 30 if open_ else 70)
    return highpass(rng.standard_normal(len(t)), 7000) * e * 0.35


def bass(note, length):
    e, t = env(length, 0.004, 5)
    f = midi(note)
    wave_ = sum(np.sin(2 * np.pi * f * k * t) / k for k in range(1, 6))
    return lowpass(wave_ * e, 900) * 0.55


def pluck(note, length=0.32):
    e, t = env(length, 0.002, 11)
    f = midi(note)
    tone = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2 * f * t) + 0.12 * np.sin(2 * np.pi * 3 * f * t)
    return tone * e * 0.22


def pad(notes, length):
    t = np.arange(int(length * SR)) / SR
    a = np.clip(t / 0.6, 0, 1) * np.clip((length - t) / 0.6, 0, 1)
    sig = np.zeros(len(t))
    for n in notes:
        f = midi(n - 12)
        sig += np.sin(2 * np.pi * f * t) + np.sin(2 * np.pi * f * 1.004 * t) * 0.7
    return lowpass(sig * a, 1800) * 0.05


def bell(note, length=2.4):
    e, t = env(length, 0.002, 2.2)
    f = midi(note)
    tone = np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 3)
    return tone * e * 0.18


# ── Arrangement ──────────────────────────────────────────────────────────────
# Pad underneath everything, one chord per bar.
bar_start = 0.0
while bar_start < END_GROOVE:
    root, triad = chord_at(bar_start)
    place(pad(triad, BAR + 0.3), bar_start, gain=0.8 if bar_start < DROP else 1.0)
    bar_start += BAR

# Intro: soft ticking hats and a gentle riser into the drop.
t = 0.0
while t < DROP:
    place(hat(), t + BEAT / 2, pan=0.3, gain=0.6)
    t += BEAT
riser_len = 1.2
rt = np.arange(int(riser_len * SR)) / SR
riser = highpass(rng.standard_normal(len(rt)), 3000) * (rt / riser_len) ** 2 * 0.12
place(riser, DROP - riser_len)

# Groove from the drop to the final chord.
step = 0
t = DROP
while t < END_GROOVE - 1e-6:
    beat_in_bar = step % 4
    place(kick(), t, gain=0.9)
    if beat_in_bar in (1, 3):
        place(clap(), t, pan=-0.05)
    place(hat(open_=True), t + BEAT / 2, pan=0.25)
    place(hat(), t + BEAT / 4, pan=-0.25, gain=0.5)
    place(hat(), t + 3 * BEAT / 4, pan=-0.25, gain=0.5)
    root, triad = chord_at(t)
    # Bass on the off-beat eighths, which keeps it bouncy rather than heavy.
    place(bass(root, BEAT / 2 * 0.9), t + BEAT / 2)
    # Bright arpeggio in sixteenths.
    pattern = [triad[0] + 12, triad[1] + 12, triad[2] + 12, triad[1] + 12]
    for k, note in enumerate(pattern):
        place(pluck(note), t + k * BEAT / 4, pan=0.35 if k % 2 else -0.35)
    t += BEAT
    step += 1

# Ending: held F major chord and a bell under the closing lockup.
place(pad([65, 69, 72], LENGTH - END_GROOVE + 0.2), END_GROOVE, gain=1.6)
place(kick(), END_GROOVE, gain=0.8)
for k, note in enumerate([77, 81, 84]):
    place(bell(note), END_GROOVE + k * 0.12, pan=(k - 1) * 0.3)

# ── Simple sidechain feel, mastering and fades ───────────────────────────────
duck = np.ones(N)
t = DROP
while t < END_GROOVE:
    i = int(t * SR)
    length = int(0.18 * SR)
    curve = 1 - 0.35 * np.exp(-np.arange(length) / SR * 22)
    duck[i : i + length] = np.minimum(duck[i : i + length], curve[: max(0, min(length, N - i))])
    t += BEAT
left *= duck
right *= duck

stereo = np.stack([left, right], axis=1)
stereo /= np.max(np.abs(stereo)) + 1e-9
stereo = np.tanh(stereo * 1.4) / np.tanh(1.4)
fade_in = int(0.3 * SR)
fade_out = int(1.6 * SR)
stereo[:fade_in] *= np.linspace(0, 1, fade_in)[:, None]
stereo[-fade_out:] *= np.linspace(1, 0, fade_out)[:, None] ** 1.5
stereo *= 0.89

out = sys.argv[1] if len(sys.argv) > 1 else 'upbeat-bed.wav'
pcm = (stereo * 32767).astype(np.int16)
with wave.open(out, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f'Wrote {out}: {LENGTH:.1f} s, {BPM} BPM')

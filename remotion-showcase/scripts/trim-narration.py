#!/usr/bin/env python3
"""Trim leading and trailing silence from the raw Higgsfield narration takes.

Raw takes live in archive/audio/narration-raw/. Trimmed clips are written to
public/audio/narration/ as MP3, with a short pad and fades so nothing clicks.
Usage: python3 scripts/trim-narration.py
"""
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / 'archive/audio/narration-raw'
OUT = ROOT / 'public/audio/narration'

# Chosen take per scene. v2 takes were regenerated faster to fit their slots.
TAKES = {
    '01-problem': '01-problem-v2.wav',
    '02-operating-view': '02-operating-view-v2.wav',
    '03-performance': '03-performance-v2.wav',
    '04-channels': '04-channels-v2.wav',
    '05-operations': '05-operations.wav',
    '06-intelligence': '06-intelligence.wav',
    '07-close': '07-close.wav',
}
THRESHOLD = '-45dB'
MIN_SILENCE = 0.15  # seconds; shorter gaps are treated as part of the line
PAD_START, PAD_END = 0.03, 0.08
FADE_IN, FADE_OUT = 0.01, 0.05


def probe_duration(path: Path) -> float:
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(path)],
                         capture_output=True, text=True, check=True).stdout
    return float(out.strip())


def speech_bounds(path: Path) -> tuple[float, float]:
    log = subprocess.run(['ffmpeg', '-hide_banner', '-i', str(path), '-af',
                          f'silencedetect=noise={THRESHOLD}:d={MIN_SILENCE}', '-f', 'null', '-'],
                         capture_output=True, text=True).stderr
    duration = probe_duration(path)
    starts = [float(x) for x in re.findall(r'silence_start: ([\d.]+)', log)]
    ends = [float(x) for x in re.findall(r'silence_end: ([\d.]+)', log)]
    begin = ends[0] if starts and starts[0] == 0 else 0.0
    # Last silence that runs to the end of the file (within a few ms) marks the tail.
    finish = duration
    for s, e in zip(starts, ends):
        if s > begin and duration - e < 0.06:
            finish = s
    return begin, finish


for name, take in TAKES.items():
    src = RAW / take
    begin, finish = speech_bounds(src)
    start = max(0.0, begin - PAD_START)
    length = min(probe_duration(src), finish + PAD_END) - start
    dst = OUT / f'{name}.mp3'
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(src), '-af',
                    f'atrim=start={start:.3f}:duration={length:.3f},asetpts=PTS-STARTPTS,'
                    f'afade=t=in:d={FADE_IN},afade=t=out:st={length - FADE_OUT:.3f}:d={FADE_OUT}',
                    '-ar', '44100', '-ac', '2', '-c:a', 'libmp3lame', '-b:a', '160k', str(dst)], check=True)
    print(f'{name}: speech {begin:.2f}-{finish:.2f}s, clip {probe_duration(dst):.2f}s')

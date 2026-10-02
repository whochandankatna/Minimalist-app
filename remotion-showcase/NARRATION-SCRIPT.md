# Narration script

Status: **recorded 2026-10-02, awaiting approval.** Voice: Higgsfield `seed_audio`, preset **Maya** (`b0f766b7-8703-4bd1-b973-f857c36837b6`).

## Recorded clips

Trimmed clips are in `public/audio/narration/` (made by `scripts/trim-narration.py`). Raw takes are kept in `archive/audio/narration-raw/`.

| # | Line | Take | Speech rate | Plays | Slot |
|---|---|---|---|---|---|
| 1 | Business shouldn't mean chasing data across disconnected tools. | v2 (`d880836b`) | +12 | 0:00.07 to 0:03.54 | 3.5 s |
| 2 | One dashboard brings sales, staffing, stock and finance together. | v2 (`36def289`) | +38 | 0:03.63 to 0:07.03 | 3.5 s |
| 3 | Track revenue, labour, product costs, rent and profit as the day develops. | v2 (`20cee3a3`) | +32 | 0:07.13 to 0:12.07 | 5.0 s |
| 4 | Combine in-store and delivery sales without manual reports. | v2 (`d5acfe04`) | +15 | 0:12.20 to 0:15.54 | 3.5 s |
| 5 | Coordinate your team and daily operations, even when management is off-site. | v1 (`3a168e91`) | 0 | 0:15.63 to 0:20.20 | 4.5 s |
| 6 | Live signals show what needs attention, and what to do next. | v1 (`75859b13`) | 0 | 0:20.33 to 0:23.89 | 5.0 s |
| 7 | Tropicool Treats. One dashboard. Every decision connected. | v1 (`0da88eb9`) | 0 | 0:25.33 to 0:28.99 | 4.7 s |

Lines 1 to 4 were regenerated faster: the first takes ran 0.3 to 1.3 s over their slots, and take 1 of line 4 ended with a garbled extra phrase. Music ducks to 0.16 under each line and returns to 0.42 between lines (`MUSIC` in `src/config/assets.ts`).

## Original planning notes

| # | Starts | Window | Line | Words |
|---|---|---|---|---|
| 1 | 0:00.1 | 3.5 s | Running a business should not mean chasing information across disconnected systems. | 11 |
| 2 | 0:03.6 | 3.5 s | One dashboard brings sales, staffing, stock and finance together. | 9 |
| 3 | 0:07.1 | 5.0 s | Track revenue, labour, product costs, rent and profit as the day develops. | 12 |
| 4 | 0:12.1 | 3.5 s | Combine in-store and delivery performance without rebuilding reports by hand. | 10 |
| 5 | 0:15.6 | 4.5 s | Coordinate your team and daily operations, even when management is off-site. | 11 |
| 6 | 0:20.1 | 5.0 s | Live signals surface what needs attention and turn it into a clear next step. *(drafted)* | 14 |
| 7 | 0:25.3 | 4.7 s | Tropicool Treats. One dashboard. Every decision connected. *(drafted)* | 7 |

74 words in 30 seconds averages about 148 words a minute: brisk but natural.

**Tight lines** (natural narration is roughly 140 to 160 words a minute):

| Line | Pace needed | Shorter alternative |
|---|---|---|
| 1 | about 190 wpm | "Business shouldn't mean chasing data across disconnected tools." (8 words, about 140 wpm) |
| 4 | about 170 wpm | "Combine in-store and delivery sales without manual reports." (8 words, about 140 wpm) |
| 6 | about 170 wpm | "Live signals show what needs attention, and what to do next." (11 words, about 135 wpm) |

Line 1 is the brief's wording. Read at a natural pace it runs about half a second into scene 2, so the shorter alternative is recommended.

## Generating with Higgsfield

- Model: `seed_audio` (Higgsfield's default speech model).
- Cost preflight: 0.6 credits per line, about 4.2 credits for all seven.
- Suggested voices to audition: Celine, Helena, Maeve (female); Arthur, Reid, Emmett (male).

Per-scene clips keep each line replaceable. The offsets in `src/config/assets.ts` start each line 4 frames after its scene begins (10 for the closing line).

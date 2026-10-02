# Narration script

Status: **not yet recorded.** Generate with Higgsfield after the script and voice are approved, then save the files in `public/audio/narration/` and set their paths in `src/config/assets.ts`.

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

# Moga–Chandigarh Corridor simulation

A browser-based 3D agent-based model of the economy of Moga district (Punjab) and the
Chandigarh tricity, connected by NH-5, NH-44, NH-703 and NH-7.

```
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + single-file build at dist/index.html
npm run headless -- 365 7   # run 365 days with seed 7, print a calibration report
```

## What is simulated

| Layer | Agents | Behaviour |
|---|---|---|
| Households | 5,400 representative agents weighted to ~2.25 lakh Moga and ~5.6 lakh tricity households, 18 researched psychographic profiles | Earn wages, salaries, remittances, crop and milk income; spend by consumption shares; choose shops by loyalty, price sensitivity and distance; pay cash, UPI or shop credit (udhaar); borrow from banks or arhtiyas by trust; host weddings; pursue IELTS and study visas |
| Farms | Moga households with crop or dairy income | Choose kharif/rabi crops by expected profit, risk aversion, loss aversion, neighbour conformity and habit; sell at MSP through arhtiyas or privately (distress sales under mandi glut); repay arhtiya loans from proceeds; decide to burn or manage stubble |
| Businesses | 449 firm agents from 49 researched sectors | Cost of goods by researched gross margin, wages into a regional labour market, restock by truck, adjust prices with demand, lend (banks, arhtiyas) |
| Logistics | 240 truck agents (each a convoy of 10) on a road graph from OSM-traced highways | Mandi → mill/godown lifting, rice → godown, godown → railhead, milk tankers to Nestlé, retail restock from Ludhiana and Chandigarh. Open market (nearest truck, surge pricing) or union cartel (turn system, +55% rates). Diesel and tolls charged per km/plaza |
| Institutions | State procurement, FCI rakes, Nestlé Moga | MSP payments by DBT after a lag, per-quintal arhtiya commission, rakes of 2,600 t when godowns fill, Nestlé milk procurement and FMCG dispatch |
| Environment | — | Stubble fires drive Chandigarh AQI; paddy share drives groundwater decline; field colours follow the crop calendar |

Every agent keeps a decision log in plain language (why it chose paddy, why it burned stubble,
why it borrowed informally). Click any truck, firm, household or facility in the 3D view to read it.

## Data

`src/data/*.json` were compiled by research agents from public sources (Census, PAU, CACP/PIB,
NSS 77th round, HCES 2023-24, DAHD, MSME-DI, OSM, news). Narratives with citations and caveats
are in `research/`:

- `geography.md`: places, highway waypoints, toll plazas, rail
- `agriculture.md`: crops, MSPs, Moga areas and yields, mandi system, dairy, credit
- `businesses-and-logistics.md`: sector economics, payment and credit practice, freight rates, truck unions
- `psychographics.md`: profile construction, trait priors and limitations
- `github-survey.md`: open-source ABM, LLM-agent and geospatial projects, licences, and a roadmap for LLM-backed agents

If a JSON file is missing, `src/data/seed.ts` provides approximate fallbacks; the Data tab shows which is in use.

## Code map

- `src/sim/world.ts`: world state, initialisation, time loop, accounting
- `src/sim/farming.ts`: crop choice, harvest, mandi sales, lifting, milling, rakes, dairy, stubble
- `src/sim/households.ts`: income, consumption, credit, migration, weddings, sentiment
- `src/sim/businesses.ts`: firm operations, restocking, pricing, profits
- `src/sim/logistics.ts`: freight jobs, dispatch regimes, truck movement, trains
- `src/sim/policy.ts`: policy levers and scenario controls
- `src/render/`: Three.js scene and terrain shader
- `src/ui/`: panels, charts, inspector, agent placement
- `archive/`: dated copies of files taken before each edit

## Known limitations

- Business counts are scaled from 2010-11 district profiles; treat them as rough.
- Several trait values are modelling assumptions (flagged in `research/psychographics.md`).
- Rail waypoints are station-to-station, not track geometry.
- Cow milk price, Nestlé/Verka milk shares and Moga landholding classes were not found and use fallbacks.

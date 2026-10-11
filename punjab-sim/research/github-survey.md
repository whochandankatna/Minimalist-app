# GitHub survey: open-source code for the Punjab ABM (Moga to Chandigarh)

Surveyed 2026-10-11 for a browser-based TypeScript + Three.js agent-based economic simulation (highways, trucking, agriculture, businesses, consumer agents with psychological profiles). The project is MIT-licensed and builds to a single file with Vite (`vite-plugin-singlefile`). It has a headless runner (`scripts/headless.ts`).

**How the data was gathered.** Stars, licence (SPDX) and last push come from the GitHub repository search API on 2026-10-11. Where the API returned no SPDX id, or where a value was not checked through the API, the cell carries a `*` and the value comes from the project's own docs or from general knowledge. Check those before relying on them. "Last push" is the `pushed_at` date. A dash (—) means the date was not retrieved. Star counts are rounded.

**How to read the licence column for an MIT project:**
- MIT, BSD, ISC and Apache-2.0 code can be copied or vendored. Keep their notices, and for Apache-2.0 keep the NOTICE file.
- GPL, AGPL and EPL code should only be studied for its ideas or run as a separate external tool. Do not copy it into this repo.
- Code with no licence is "all rights reserved". Only ideas and paper descriptions can be reused.

---

## 1. Agent-based modelling frameworks

| Repo | URL | License | Stars | Last push | Lang | What to borrow |
|---|---|---|---|---|---|---|
| Mesa (moved from `projectmesa` to the `mesa` org) | https://github.com/mesa/mesa | Apache-2.0 | ~3.9k | 2026-10-10 | Python | **Scheduler/AgentSet design**: `model.agents.shuffle_do("step")`, staged activation (`do("decide")` then `do("act")`), `DataCollector` (model + agent reporters into tables), batch_run for parameter sweeps. Mesa 3/4 uses an event-based `Simulator`/`ABMSimulator` (discrete-event + time-stepped). Port the API shape into TS. |
| mesa-geo | https://github.com/mesa/mesa-geo | Apache-2.0 | ~230 | 2026-10-06 | Python | `GeoAgent` (shapely geometry + CRS), `GeoSpace`, raster layers for land/soil cells. Model villages, farms and mandis as GeoAgents, and keep raster cells for crop and groundwater state. |
| mesa-frames | https://github.com/mesa/mesa-frames | Apache-2.0* | ~40 | — | Python | Vectorised agents stored as DataFrame columns. This is the same idea as a TS struct-of-arrays (Float32Array per attribute) for 100k+ consumers. |
| mesa-examples | https://github.com/mesa/mesa-examples | Apache-2.0* | ~250 | — | Python | Has reference economic toy models: Boltzmann wealth, Sugarscape with trade, Epstein civil violence. Use them as validation targets for the TS engine. |
| AgentPy | https://github.com/jofmi/agentpy | BSD-3-Clause | ~390 | 2025-02-06 | Python | Clean `Model.setup/step/update/end` lifecycle, `AgentList` broadcast calls, built-in experiment/parameter-sample + SALib sensitivity integration. |
| Agents.jl | https://github.com/JuliaDynamics/Agents.jl | MIT | ~920 | 2026-10-10 | Julia | Space abstractions (GridSpace, ContinuousSpace, **OpenStreetMapSpace** with routing along OSM roads), event-queue scheduler. OpenStreetMapSpace is the closest design analogue to trucks on Punjab roads. |
| NetLogo | https://github.com/NetLogo/NetLogo | GPL-2.0 | ~1.2k | 2026-10-09 | Scala | Ideas only: the turtles/patches/links vocabulary and the Models Library (wealth distribution, market models). Do not copy code. |
| MASON | https://github.com/eclab/mason | Other (AFL-3.0*) | ~190 | 2026-07-10 | Java | `Schedule` with orderings within a tick, `Steppable` interface, GeoMASON. Design reference only. |
| Repast Simphony | https://github.com/Repast/repast.simphony | none detected (BSD*) | ~100 | 2026-09-28 | Java | Context/projection separation (the same agents viewed through a network, a geography and a grid). |
| GAMA | https://github.com/gama-platform/gama | GPL-3.0 | ~120 | 2026-10-11 | Java | Best-in-class GIS ABM. Its traffic ("driving skill") and BDI agent architecture are reference designs. GPL, so ideas only. |
| ABIDES | https://github.com/abides-sim/abides | Other (BSD-3*) | ~580 | 2023-07-06 | Python | **Discrete-event kernel with message latency.** Order-book market agents. Port the kernel pattern for mandi auctions (price discovery). |
| abides-jpmc-public (incl. ABIDES-Markets, ABIDES-Gym) | https://github.com/jpmorganchase/abides-jpmc-public | Other (BSD-3*) | ~180 | 2024-07-22 (archived) | Python | Gym wrapper around an ABM, which is useful if RL agents are added later. The "ABIDES-Economist" paper (arXiv 2402.09563) describes household/firm/central bank/government agents, but no public repo was confirmed. |
| ABCE / abcEconomics | https://github.com/AB-CE/abce | none detected | ~225 | 2024-01-23 (archived) | Python | **Goods/contracts accounting**: agents hold inventories, and `sell()`/`buy()` offers are cleared per sub-round. Production functions (Cobb-Douglas) and utility functions are built in. A good conceptual template for the Punjab goods economy. |
| AgentScript | https://github.com/backspaces/agentscript | GPL-3.0 | ~120 | 2026-08-25 | JS | NetLogo semantics in modern JS. It has a Three.js 3D view and GIS (lat/lon to patch) helpers. GPL, so study only. |
| Flocc | https://github.com/scottpdo/flocc | MIT | ~30 | 2026-04-15 | TS | A small MIT TypeScript ABM library: Environment, Agent with rules, KDTree, Network, and Terrain plus charts. It is **the one JS ABM library that can be vendored directly**. Even so, its own engine is likely the better choice (see the architecture section). |
| Lagom (macro ABM) / Jamel | (not found on GitHub) | — | — | — | Java | Jamel (Seppecher) is distributed from its own site. Lagom generiC was published with papers. Neither has an active GitHub repo, so use them as model descriptions only. |
| Macro ABMs (small) | https://github.com/jasmineRepo/MacroABM (Dosi K+S model), https://github.com/yukimasano/rck_abm | none / none | <20 | — | Java/Py | Reference equations for firm investment, credit and Keynesian demand. Treat as reading material. |

## 2. LLM-driven generative-agent simulations

| Repo | URL | License | Stars | Last push | Lang | What to borrow |
|---|---|---|---|---|---|---|
| Generative Agents (Smallville) | https://github.com/joonspk-research/generative_agents | Apache-2.0 | ~22k | 2024-08-05 | Python | **Memory stream + retrieval score** (recency × importance × relevance), periodic **reflection**, and a hierarchical day plan (day, then hour, then 5-minute steps). Copy the scoring formula and prompts with attribution. |
| AI Town (a16z) | https://github.com/a16z-infra/ai-town | MIT | ~10.6k | 2026-08-26 | **TypeScript** | The only mature TS generative-agent stack. It shows how to run an LLM agent loop off the render thread, with conversation and memory tables and an engine "tick" with input queue (built on Convex). MIT, so its TS patterns (agent operations, memory embedding cache, conversation turn-taking) can be lifted. |
| AgentSociety (Tsinghua FIB lab) | https://github.com/tsinghua-fib-lab/AgentSociety | Apache-2.0 | ~1.3k | 2026-10-01 | Python | **Economy module** (paper arXiv 2502.08691): Firms (wages and prices adjust to supply/demand), Government (progressive income tax plus redistribution), Bank (interest on savings via a Taylor rule), and a **NBS (statistics bureau)** that computes real GDP, income distribution, tax revenue, per-capita consumption and working hours. Each entity keeps an account book. Agent "mind": emotions (6 rated 0–10), Maslow needs hierarchy, attitudes, Theory of Planned Behavior planning, and profile/status/stream memory. AgentSociety 2 is a rewrite. Port the institution set and the NBS-style reporting. |
| ACL24-EconAgent | https://github.com/tsinghua-fib-lab/ACL24-EconAgent | **none** (no licence file) | ~150 | 2024-08-16 | Python | **Monthly decision prompt**: the agent is given its identity, job offer and expected wage, last consumption, tax paid, bracket schedule, lump-sum redistribution, price change, savings and interest rate. It returns JSON `{"work": 0–1 step 0.02, "consumption": 0–1 step 0.02}`, plus a quarterly 200-word reflection. Because there is no licence, re-write the prompt in our own words, adapted to rupees, MSP, mandi prices and arhtiya credit. |
| CAMEL | https://github.com/camel-ai/camel | Apache-2.0* | ~17.9k | — | Python | Role-playing multi-agent framework. Lower relevance. |
| OASIS (CAMEL) | https://github.com/camel-ai/oasis | Apache-2.0 | ~5.3k | 2026-10-05 | Python | Scale tricks for up to 1M LLM agents: asynchronous inference, an activation probability per agent per step (not every agent acts every tick), and a recommender-system environment. **Activation sampling** is the key pattern for a hybrid model. |
| Concordia (Google DeepMind) | https://github.com/google-deepmind/concordia | Apache-2.0 | ~1.8k | 2026-10-08 | Python | **Game Master pattern**: a GM entity grounds free-text agent actions into concrete state changes (e.g. "I sell 20 quintals at the Moga mandi" becomes a validated transaction). Component-based agent ("entity components"). This is the safest way to let an LLM touch a rule-based economy. |
| TinyTroupe (Microsoft) | https://github.com/microsoft/TinyTroupe | MIT | ~7.6k | 2026-07-03 | Python | **Persona spec format** (`*.agent.json`: `persona.{name, age, nationality, residence, education, occupation{title, organization, description}, personality{traits, big_five}, preferences{interests, likes, dislikes}, skills, beliefs, behaviors{general, routines}, health, relationships, other_facts}`). Also `TinyPersonFactory` (generate a population from a demographic description), market-research "interview" and extraction helpers, and a cache of LLM calls for reproducibility. MIT, so the schema can be adopted directly. |
| Project Sid (Altera) | https://github.com/altera-al/project-sid | **none** | ~1.4k | 2024-11-04 | — | Contains only the paper/report: PIANO architecture (concurrent modules plus a "cognitive controller" bottleneck) and emergent specialisation and economy (gems as currency) among 1000 agents. Ideas only. |
| AgentTorch (MIT Media Lab, "Large Population Models") | https://github.com/AgentTorch/AgentTorch | **AGPL-3.0** | ~650 | 2026-09-12 | Python | **LLM archetypes**: call the LLM once per *archetype* (demographic bucket), not once per agent, then apply the result to millions of tensorised agents. This is the most cost-effective hybrid pattern. AGPL, so ideas only. |
| genagents (1,000-person simulation) | https://github.com/joonspk-research/genagents | (not verified) | — | — | Python | Agents built from interview transcripts. Useful as background for persona fidelity. |

## 3. Traffic, freight, supply chain and routing

| Repo | URL | License | Stars | Last push | Lang | What to borrow |
|---|---|---|---|---|---|---|
| MATSim | https://github.com/matsim-org/matsim-libs | GPL-2.0* | ~650 | — | Java | Daily activity plans, then co-evolutionary re-planning (route/time/mode), using a queue-based link model (FIFO link capacity plus free-speed travel time). The **queue model is the right fidelity for NH-5/NH-205 trucking**. Re-implement it in TS. Its freight contrib (`freight`/`jsprit` carriers) is a design reference. |
| Eclipse SUMO | https://github.com/eclipse-sumo/sumo | EPL-2.0 (also GPL-2.0+) | ~4.2k | 2026-10-10 | C++/Py | Microscopic car-following (Krauss/IDM) and `netconvert` OSM-to-network tooling. Use it offline to clean the Punjab network. Microscopic simulation is too heavy for a whole-corridor browser sim, but an IDM implementation (a few lines) is fine for a close-up "highway cam" view. |
| MOSS (Tsinghua) | https://github.com/tsinghua-fib-lab/moss | MIT | ~55 | 2025-08-26 | CUDA | GPU mobility simulator used underneath AgentSociety. Its map format (lanes/roads/AOIs protobuf) is a good schema reference. MIT. |
| BEAM (LBNL) | https://github.com/LBNL-UCB-STI/beam | Other (BSD-like*) | ~150 | 2026-10-09 | Scala | MATSim extension with freight/ride-hail and energy (fuel/charging). It shows how to add fuel cost and emissions per vehicle type. |
| VROOM | https://github.com/VROOM-Project/vroom | BSD-2-Clause* | ~1.9k | — | C++ | Vehicle routing (CVRP, time windows, pickup and delivery) for truck dispatch from mandis and FCI godowns. Use it offline or via WASM, or as the reference for a simple TS savings/insertion heuristic. |
| jsprit | https://github.com/graphhopper/jsprit | Apache-2.0* | ~1.8k | — | Java | Ruin-and-recreate VRP metaheuristic. Its algorithm is easy to port to TS. |
| OSRM | https://github.com/Project-OSRM/osrm-backend | BSD-2-Clause* | ~8.1k | — | C++ | Pre-compute an origin-destination matrix of truck travel times between all Punjab towns offline, then ship the matrix as JSON. |
| GraphHopper | https://github.com/graphhopper/graphhopper | Apache-2.0* | ~6.7k | — | Java | Truck profile (weight/height limits), custom models. Offline route generation. |
| Valhalla | https://github.com/valhalla/valhalla | MIT* | ~6.3k | — | C++ | Has a `truck` costing model with axle-load and hazmat options. Its MIT licence makes it the most permissive offline router. |
| pgRouting | https://github.com/pgRouting/pgrouting | GPL-2.0* | ~1.4k | — | C++ | Only relevant if a PostGIS pipeline is used offline. |
| osmium-tool | https://github.com/osmcode/osmium-tool | GPL-3.0* | ~700 | — | C++ | CLI to clip the Geofabrik extract to a Moga–Ludhiana–Chandigarh bounding polygon and filter `highway=*`, `landuse=*` and `building=*`. Running it as a tool is fine; its licence does not affect our code. |

Note on freight ABMs: dedicated open freight ABMs are rare on GitHub. The searches for "freight agent-based simulation trucks" and "MASS-GT" returned nothing usable. MATSim-freight and BEAM are the open references. A shipper → carrier → receiver ABM (as in MASS-GT, TU Delft) must be built from its papers.

## 4. Geospatial 3D rendering in the browser

| Repo | URL | License | Stars | Last push | Lang | What to borrow |
|---|---|---|---|---|---|---|
| three.js | https://github.com/mrdoob/three.js | MIT* | ~116k | — | JS | Already a project dependency (0.169). Key techniques: `InstancedMesh` for thousands of trucks, cars and people (one draw call per vehicle class), `BatchedMesh` for varied building geometry, `LineSegments`/`Line2` for roads, and `LOD`. |
| geo-three | https://github.com/tentone/geo-three | MIT | ~955 | 2026-04-05 | TS | **Tile-based map and terrain (height) LOD inside a three.js scene.** Providers for OSM, MapBox and Bing plus height-shader mode. This is the most direct drop-in for a real basemap and terrain under the Three.js sim. Vendor it or use it from npm. |
| deck.gl | https://github.com/visgl/deck.gl | MIT* | ~14.6k | — | TS | **TripsLayer** (animated vehicle trails with timestamps) and ArcLayer/HexagonLayer for OD flows and heatmaps. Even without adopting deck.gl, its TripsLayer shader approach (a per-vertex timestamp with fragments discarded outside the time window) ports easily to a Three.js ShaderMaterial. |
| MapLibre GL JS | https://github.com/maplibre/maplibre-gl-js | BSD-3-Clause* | ~11.8k | — | TS | 3D terrain (`setTerrain` with raster-DEM), `fill-extrusion` buildings, and a custom layer interface that can host a Three.js scene. This is the alternative if the project ever wants "map first, sim overlay". |
| CesiumJS | https://github.com/CesiumGS/cesium | Apache-2.0* | ~15.8k | — | JS | Globe, 3D Tiles and terrain. Too heavy for a single-file build. Only worth it for whole-globe context. |
| OSM Buildings | https://github.com/OSMBuildings/OSMBuildings | Other (BSD-2*) | ~1k | 2021-04-29 | JS | Building-extrusion heuristics: `height`, `building:levels` × ~3 m, and roof shapes. Port the heuristics; the library itself is stale. |
| threebox (original) | https://github.com/peterqliu/threebox | MIT* | ~540 | archived | JS | lat/lon to Mercator world-unit conversion for Three.js on Mapbox. The jscastro76 fork was not found by the API (it may have been moved or deleted). The projection math is about 20 lines and is easy to write ourselves. |

## 5. Agricultural economic models (India / Punjab)

| Repo / source | URL | License | Stars | Notes / what to borrow |
|---|---|---|---|---|
| CWatM (IIASA Community Water Model) | https://github.com/iiasa/CWatM | GPL-3.0* | ~100 | Daily hydrology with groundwater and irrigation demand. It has been applied to the Indus/Bhima basins. Use its **groundwater-depletion and irrigation-demand equations** as references for a simplified per-block aquifer stock in Punjab (water table falls ~0.5–1 m/yr in central Punjab). GPL, so re-derive the equations. |
| IFPRI IMPACT | https://github.com/IFPRI/IMPACT | (not verified) | ~3 | IFPRI's global partial-equilibrium agri-market model (R/GAMS). Supply and demand elasticities by commodity and region, including India. Use its **elasticity tables** to calibrate wheat, paddy, cotton and maize supply response. |
| Hu & Beattie 2019 — ABM of crop choice and groundwater irrigation (ASCE JWRPM) | https://ascelibrary.com/doi/10.1061/(ASCE)WR.1943-5452.0001033 | code on request (Java) | — | Heterogeneous behavioural factors (risk aversion, social learning) in crop choice plus pumping. Port its decision rules. |
| CoMSES "Farmers' behaviour simulation" (Theory of Planned Behaviour, crop choice + aquifer perception) | https://www.comses.net/codebase-release/7651242e-876b-4c64-9faf-3b5f1e68ec5e/ | see CoMSES page | — | TPB-based crop selection. Matches the psychological framing of this project. |
| WeAdapt — solar irrigation ABM, India (crop choice, incomes, district groundwater) | https://weadapt.org/placemarks/maps/view/farmer-responses-to-solar-irrigation-in-india-agent-based-modeling-to-understand-sustainable-transitions/ | no public code found | — | Scenario design for free-power and solar pump policy, which is directly relevant to Punjab's free farm electricity. |
| AgMarknet price tools (examples) | https://github.com/skalkii/mandibazar (TS), https://github.com/snehaltengse44/WheatWorth | unverified / tiny | <5 | Small repos that show the data.gov.in Agmarknet API call shape (`api.data.gov.in/resource/<id>?api-key=...&filters[state]=Punjab`). Reference only. |

**Finding:** no Punjab-specific ABM with public code was found on GitHub. Searches for "agent-based model farmers India", "groundwater agent-based model farmers" and "punjab agriculture" returned nothing usable. The Punjab paddy–wheat ↔ groundwater ↔ MSP/procurement loop would therefore be a novel open contribution. Build it from published elasticities and decision rules.

## 6. Consumer behaviour and psychographic modelling

| Repo | URL | License | Stars | What to borrow |
|---|---|---|---|---|
| TinyTroupe | (see §2) | MIT | ~7.6k | Persona JSON schema with Big Five, plus `TinyPersonFactory` population generation and a "market research" pattern (ask N personas whether they would buy X at price P). |
| Persona Hub (Tencent) | https://github.com/tencent-ailab/persona-hub | none detected (released data is CC-BY-NC-SA 4.0*) | ~1.7k | Persona-driven synthetic data method. **The released data is non-commercial.** Use the method, not the data. |
| AgentSociety mind model | (see §2) | Apache-2.0 | ~1.3k | Maslow needs plus 6 emotions plus TPB. A ready-made psychological state vector for consumers. |
| Small consumer ABMs | https://github.com/MatheusElis/ABM-Meat_Consumption, https://github.com/stedcheng/marketing-strategies-simulation | none | ~1 | Toy references for social-influence purchase diffusion (Bass model, threshold contagion). |
| SALib | https://github.com/SALib/SALib | MIT* | ~1k | Sobol/Morris sensitivity analysis on psychographic parameters. Run it on headless-runner CSV outputs. |

No mature open-source "psychographic consumer ABM" library exists. Combine a TinyTroupe-style persona schema, numeric trait vectors (Big Five, plus price sensitivity, brand loyalty and status-seeking) and a discrete-choice (multinomial logit) purchase model.

---

## Datasets on GitHub and open portals

| Dataset | Where | License | Use |
|---|---|---|---|
| **datameet/maps** — India state, district, sub-district (tehsil) and assembly-constituency boundaries (shp/geojson), plus village boundaries via `datameet/indian_village_boundaries` (not verified here) | https://github.com/datameet/maps | MIT (repo); data is CC-BY-2.5 India per project site* | Moga, Ludhiana, Fatehgarh Sahib, Rupnagar, SAS Nagar (Mohali) and Chandigarh polygons. Simplify them with mapshaper and ship them as compact GeoJSON. |
| **Geofabrik OSM extract** — India "Northern Zone" (~213 MB .pbf; Punjab and Chandigarh are presumed to fall in this zone, not confirmed on the page) | https://download.geofabrik.de/asia/india.html | ODbL (attribution "© OpenStreetMap contributors") | Clip with osmium to the corridor. Extract `highway=motorway/trunk/primary/secondary` (NH-5/NH-205/NH-205A), towns, `building`, `landuse=farmland` and `amenity=marketplace`. ODbL only requires attribution for produced works. A derived *database* shipped in the bundle must stay ODbL. That is compatible with an MIT code repo if the data file is clearly labelled. |
| **Agmarknet daily mandi prices** (data.gov.in "Current Daily Price of Various Commodities from Various Markets (Mandi)") | https://data.gov.in (API: `api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070`*) | GODL-India (Government Open Data License, attribution) | Calibrate the price processes for wheat, paddy, cotton and vegetables at the Moga, Jagraon, Khanna (Asia's largest grain market), Ludhiana and Chandigarh mandis. Pull it offline and ship monthly modal-price series as JSON (no API key in the browser). |
| Census 2011 (PCA) / SECC / NSS-PLFS / ICRISAT District Level Database | censusindia.gov.in, data.icrisat.org/dld | GODL / ICRISAT terms | Population by village, occupation mix, and district crop area/yield/irrigation (ICRISAT DLD has district-level crop statistics for Punjab from 1966 on). |
| CGWB groundwater levels (India-WRIS) | indiawris.gov.in | GODL | Per-block water-table depth to initialise the aquifer state. |
| SRTM / Copernicus DEM 30 m | AWS open data / OpenTopography | Copernicus licence (free, attribution) | Terrain for geo-three or a custom heightmap. Punjab is flat (~200–350 m), with the Shivalik foothills near Chandigarh. |

---

## Recommended architecture

### A. Reuse directly (licence-compatible with MIT)

1. **three.js** (MIT, already in use) with `InstancedMesh` for all moving agents and `BatchedMesh` for buildings.
2. **geo-three** (MIT) as an optional basemap and terrain layer, behind a flag. Lazy-load the tiles so the single-file offline build still works with a procedural ground fallback.
3. **TinyTroupe persona JSON schema** (MIT): adopt the field names verbatim for `persona` and extend them with Punjab fields: `landholding_acres`, `caste_community` (optional, sensitive, default off), `crop_portfolio`, `debt_to_arhtiya_inr`, `remittance_household`, and `diaspora_link` (Canada/UK/Australia remittances strongly shape Doaba/Malwa consumption).
4. **Generative Agents retrieval scoring** (Apache-2.0): `score = α·recency + β·importance + γ·relevance` with exponential recency decay. Keep attribution in a NOTICE file.
5. **Concordia "Game Master" pattern** (Apache-2.0): reimplement it in TS. The GM validates every LLM-proposed action against the rule engine (stock, cash, distance, mandi hours) before it mutates state.
6. **AI Town engine patterns** (MIT, TypeScript): input queue → engine tick → agent operations run async, with results fed back as inputs on later ticks. This is how LLM latency is decoupled from a 60 fps render.
7. **Flocc** (MIT, TS): optional. Only its KD-tree and network utilities are worth lifting. The core engine should be our own (below).

### B. Patterns to port (re-implement; source licence does not matter for ideas)

- **Mesa / MASON scheduler.** Build a `Model` with a `SimClock` (1 tick = 1 sim-hour, with day, month and season boundaries) and an `AgentSet<T>` with `shuffleDo(method)` and staged activation. The per-tick stage order is `perceive → decide → act → settle`. Add a Mesa-style `DataCollector` with model and agent reporters, writing to ring buffers for UI charts and to CSV from the headless runner. Use a seeded PRNG (e.g. mulberry32) everywhere so headless runs reproduce exactly.
- **Struct-of-arrays agent storage** (as in mesa-frames and AgentTorch). Consumers live as typed arrays (`income: Float32Array`, `bigFive: Float32Array(5N)`, `homeCell: Uint32Array`). Rich object agents are kept only for the LLM-backed sample.
- **AgentSociety institutions.** Add `Firm` (wage and price update from excess demand: `p ← p·(1+η·(D−S)/S)`), `Government` (progressive tax slabs, MSP and procurement, free farm power, PDS), `Bank`/`Arhtiya` (savings interest, crop loans, informal credit at higher rates) and **`NBS`** (statistics bureau). NBS computes district GDP, the Gini, procurement volumes and truck-km each month and feeds the dashboard. Every institution keeps a double-entry account book so money is conserved, with an assertion in the headless tests.
- **ABCE-style goods clearing.** Agents post `offer(good, qty, price)`. Each sub-round, the market clears offers per mandi with a call auction (ABIDES-style). Supply chain: farmers → arhtiya (commission agent) → mandi → FCI/private buyer → truck → mill/warehouse → retailer → consumer.
- **MATSim queue model for roads.** Each OSM link has a free-flow time and a capacity per hour. Vehicles enter a FIFO queue and exit at `max(entryTime + freeFlow, prevExit + 1/capacity)`. This is cheap enough for tens of thousands of truck-trips per sim-day in the browser. Pre-compute shortest paths offline (OSRM, GraphHopper or Valhalla) or with a TS Dijkstra/A* on the clipped network.
- **deck.gl TripsLayer shader idea.** Render truck trails with a per-vertex timestamp and a uniform `currentTime` in a Three.js `ShaderMaterial`.
- **Crop choice and groundwater.** Each season, every farmer agent chooses a crop mix with a multinomial logit over expected profit, where expected profit = MSP or expected mandi price × yield − input and pumping cost. Add a risk-aversion term, plus social-learning weight from neighbours (Hu & Beattie) and TPB attitude/norm/control terms. Pumping draws down a per-block aquifer stock (CWatM-inspired), raising future pump costs. Calibrate elasticities from IFPRI IMPACT and ICRISAT DLD.
- **Consumer choice.** Use a multinomial logit over shops and goods. Utility combines price (scaled by the price-sensitivity trait), distance/travel time, brand loyalty, status signalling (high extraversion and low agreeableness raise it) and social influence (share of a neighbour's purchases). Big Five traits map to coefficients through a small documented table.

### C. Roadmap: optional LLM-backed "deliberative" agents (Claude API)

The principle: **the rule-based engine is always the source of truth. LLMs only propose; the Game Master validates.** The sim must run fully without an API key.

1. **Phase 0 (now).** All agents are rule-based. Persona JSON exists for every agent, so the LLM layer can be added later without touching the data model. Add a `DecisionPolicy` interface: `decide(agentView, context) → Decision`. `RulePolicy` is the default.
2. **Phase 1: deliberative sample.** Mark ~0.1–1% of agents as `deliberative` (e.g. 50 farmers, 20 shop owners, 10 truck operators, 100 consumers), stratified by district and archetype. `LLMPolicy` calls Claude **monthly, not per tick**, with an EconAgent-style prompt rewritten in our own words and adapted to Punjab. The prompt carries persona, last month's income (MSP or mandi realisation), debt to the arhtiya, input prices (diesel, DAP, urea), water-table trend, household consumption and savings. The response is strict JSON: `{work_propensity, consumption_propensity, crop_plan:{wheat,paddy,cotton,maize,veg}, sell_or_store, rationale}`, validated with a schema. Add a quarterly 200-word reflection that gets written into memory.
3. **Phase 2: archetype amplification** (AgentTorch idea, our own implementation). Each month, call the LLM once per archetype bucket (e.g. "small farmer, 2–5 acres, Moga, indebted, high neuroticism"). Use the answer to shift that bucket's rule-policy coefficients for all of its rule-based members. This gives LLM-influenced behaviour for 100k agents at the cost of a few dozen calls a month.
4. **Phase 3: memory and conversation.** Add a Generative-Agents memory stream with retrieval scoring and reflection for the deliberative agents. Add OASIS-style activation probability so only some deliberative agents think each month. Add AI-Town-style conversations (farmer ↔ arhtiya price negotiations, truck operator ↔ dispatcher), each grounded by the Game Master.
5. **Engineering details.**
   - The browser cannot hold an API key. Use a tiny proxy (an edge function) or a user-supplied key stored only in memory (never in localStorage by default).
   - All calls run async off the tick. Decisions apply on the next month boundary, and the agent falls back to `RulePolicy` if no answer arrives.
   - Use prompt caching for the static system prompt and persona blocks. The monthly cost stays bounded: N_deliberative × 1 call/month, plus 1 reflection per quarter.
   - Log every prompt and response pair with a seed into the run record so runs can be replayed **offline from the cache** (as TinyTroupe does), which keeps headless runs deterministic.
   - Make the validation explicit: compare the distributions of LLM-agent decisions against rule agents and against data (e.g. district crop-area shares) on the dashboard, and flag drift.
   - Model choice: use a fast, cheap Claude model for monthly decisions and a stronger one only for quarterly reflections or for narrating events to the user. Check current model ids and pricing in the Claude API docs when implementing.

### Licence summary for this MIT project

- **Can vendor or copy (keep notices):** three.js, geo-three, deck.gl, MapLibre, Flocc, AI Town, TinyTroupe, Valhalla, MOSS (MIT); Mesa, mesa-geo, Generative Agents, AgentSociety, Concordia, OASIS, Cesium, GraphHopper, jsprit (Apache-2.0); AgentPy, OSRM, VROOM (BSD).
- **Ideas only, or run as an external tool:** NetLogo, GAMA, AgentScript, MATSim, CWatM, pgRouting, osmium-tool (GPL); AgentTorch (AGPL-3.0); SUMO (EPL-2.0).
- **No licence, so ideas only:** ACL24-EconAgent, Project Sid, ABCE (no SPDX detected), Persona Hub code.
- **Data:** OSM (ODbL, needs attribution and share-alike on the derived DB), datameet (attribution), data.gov.in (GODL attribution), Persona Hub data (non-commercial, so avoid it).

### Sources (web)

- AgentSociety paper: https://arxiv.org/abs/2502.08691 (HTML v1 read for economy module details)
- EconAgent prompt: `simulate.py` in https://github.com/tsinghua-fib-lab/ACL24-EconAgent
- TinyTroupe persona example: `examples/agents/Lisa.agent.json` in https://github.com/microsoft/TinyTroupe
- Hu & Beattie 2019: https://ascelibrary.com/doi/abs/10.1061/%28ASCE%29WR.1943-5452.0001033
- CoMSES farmers' behaviour model: https://www.comses.net/codebase-release/7651242e-876b-4c64-9faf-3b5f1e68ec5e/ ; https://catalog.comses.net/publications/252863
- WeAdapt solar irrigation ABM: https://weadapt.org/placemarks/maps/view/farmer-responses-to-solar-irrigation-in-india-agent-based-modeling-to-understand-sustainable-transitions/
- ABIDES-Economist: https://arxiv.org/abs/2402.09563
- Geofabrik India: https://download.geofabrik.de/asia/india.html

# Moga agriculture and dairy economics: research notes

Compiled 2026-10-11 for the Moga/Chandigarh agent-based simulation. The data file is `src/data/agriculture.json`. Bracketed IDs such as [s3] point to `meta.sources` in that file. Where a number could not be verified it is `null` in the JSON and flagged below. Do not replace these with guesses.

---

## 1. The big picture

Moga is a Malwa-belt district dominated by a **paddy-wheat double crop on tubewell irrigation**, with **dairy as the second income leg**.

- **Wheat.** In 2024-25 wheat covered about 176,100 ha and yielded 53.6 qtl/ha [s7].
- **Paddy.** Total paddy, including basmati, covered about 184,700 ha in 2024-25, yielding 71.1 qtl/ha of paddy [s3].
- **Basmati.** About 12,300 ha in 2023, low for Punjab [s8].
- **Potato.** About 7,500 ha in 2023-24, the only meaningful diversification crop [s9].
- **Mustard, maize, cotton and sugarcane.** Each is under 1,000 ha [s3, s4].

Moga is also the home of **Nestlé India's first factory (1961)**. Nestlé built a village milk-collection network around it [s15]. Verka (Milkfed) and informal milk vendors (dodhis) compete with Nestlé for the same milk.

For an average Punjab agricultural household, monthly income was ₹26,701 in 2018-19 [s12]:

| Source | Share | ₹/month |
|---|---|---|
| Crops | 47% | 12,597 |
| Wages | 22% | 5,981 |
| Animals | 17% | 4,457 |
| Leasing out land | 10% | 2,652 |
| Non-farm business | 4% | 1,014 |

The same survey found:
- 54.4% of these households are indebted.
- The average debt is ₹2,03,249, the third-highest in India.
- About 79% of that debt is owed to institutional lenders [s12].

**Chandigarh's role** in this module is mainly as a destination and administrative node:
- It hosts state-level offices, including Milkfed's head office.
- It is a large urban milk and grain consumption market served by Verka and by private dodhis.
- BAHS reports Chandigarh's buffalo yield at 12.3 kg/day [s13]. That is high, but Chandigarh is a peri-urban dairy enclave, not a cropping economy.

---

## 2. Crop cycle

| Crop | Sow / transplant | Harvest | Moga area (ha) | Yield (qtl/ha) | Price anchor |
|---|---|---|---|---|---|
| Wheat | 1st fortnight Nov (late Oct-mid Nov) | Apr | 176,098 (2024-25) | 53.6 | MSP ₹2,585 (RMS 2026-27); ₹2,610 for RMS 2027-28 [s5, s6] |
| Paddy, non-basmati (PR 126) | Nursery 25 May-20 Jun; transplant from about 9 Jun (Moga zone, 2025) | Late Sep-Oct | ~172,400 (derived) | 71.1 (district); 74 (PR 126, PAU) | MSP ₹2,441 common / ₹2,461 Grade A (KMS 2026-27) [s1, s2] |
| Basmati | Jul | Late Oct-Nov | 12,320 (2023) | 42.1 | Private, about ₹2,800-4,100 (low confidence) [s35] |
| Maize (kharif) | Jun | Sep | 200 | ~42 | MSP ₹2,410, but mandi prices are about ₹1,900 [s34] |
| Potato | Oct | Dec-Feb | 7,485 (2023-24) | 295 | No MSP; boom-bust, about ₹500-900 in 2026 [s36] |
| Mustard | Oct | Mar | 900 | 17.3 | MSP ₹6,200 (RMS 2026-27); mandi ~₹6,300-6,450 [s37] |
| Sugarcane | Feb-Mar | Nov-Apr | ~100 / nil | (imputed) | SAP ₹416 (2025-26) [s31] |
| Cotton | Apr-May | Oct-Nov | 100 | 4.4 lint | MSP ₹8,267 medium staple (2026-27) |
| Berseem fodder | Late Sep-early Oct | Cuts Nov to mid-Jun | n/a (state ~2.25 lakh ha) | ~970 green | Not marketed |

**The critical constraint is the gap between the two main crops.** PR 126 matures about 93 days after transplanting [s3], and PAU wants wheat sown in the first fortnight of November [s4]. That leaves only **15-25 days** to:
- harvest the paddy,
- sell it in a crowded mandi, and
- clear the straw (6-7 t/ha).

This squeeze explains stubble burning, the arhtiya credit cycle, and the political sensitivity of mandi lifting.

**The paddy transplanting date is set by law.** The Punjab Preservation of Subsoil Water Act, 2009 lets the state fix the earliest date to protect groundwater. In 2025 the state used three zones, and Moga was in the **9 June** zone [s30]. We could not find a 2026 notification.

---

## 3. Procurement flow (wheat and non-basmati paddy)

```
Farmer --(tractor-trolley)--> Arhtiya's platform in mandi / purchase centre
   |  cleaning, drying, bagging (labour paid by agency at fixed rates)
   v
Agency inspector (PUNGRAIN / MARKFED / PUNSUP / PSWC; FCI minor) bids at MSP
   |  quality check: FAQ, moisture (paddy 17%, wheat 12%)
   v
e-J-form issued --> payment to farmer's bank via PFMS/DBT (norm: 48 h)
   |                   arhtiya paid fixed commission (wheat ₹50.75/qtl, paddy ₹50.61/qtl from 2026-27)
   v
Lifting by transport contractor (norm: 72 h)
   |-- Wheat --> state agency godowns / CAP plinths --> taken over by FCI
   '-- Paddy --> allotted rice miller --> milled --> CMR (~67% outturn) delivered to FCI
                                                         |
                                                         v
                                   FCI depots --> rail rakes --> deficit states (PDS/NFSA, OMSS)
```

**Arhtiyas (commission agents).** Their statutory commission is 2.5% of MSP. However, central-pool procurement pays a fixed per-quintal amount: about ₹46 from 2019-20, raised in March 2026 to **₹50.75 for wheat and ₹50.61 for paddy** [s10]. Since RMS 2021-22, payment goes straight to the farmer's bank account [s40]. The arhtiya's hold over the farmer now comes mainly from **credit**, not from handling the payment.

**Mandi levies.** Punjab charges **3% market fee + 3% RDF** on MSP. Both are paid by the buying agency, not by the farmer. Since 2021-22 the Centre has cut or withheld reimbursement and wants a 2% total; the dues are before the Supreme Court [s11]. For the simulation these charges affect state finances and the mandi board, not farm-gate price.

**Agency shares.** State agencies do almost all of the buying. In 2019-20 paddy was split roughly [s40]:

| Agency | Share |
|---|---|
| PUNGRAIN | 41% |
| MARKFED | 26% |
| PUNSUP | 20% |
| PSWC | 11% |
| FCI | ~1% |

**Volumes.**
- **Wheat, RMS 2026-27:** Punjab bought about 12.2-12.3 MT against a 12.2 MT target [s27].
- **Paddy, KMS 2025-26:** Punjab bought 15.7 MT, short of target in a flood year [s28].
- **Paddy, KMS 2026-27:** the target is 18.0 MT, procured from 1 Oct to about 30 Nov [s28].

As a share of production, about two-thirds of wheat and roughly 90% of non-basmati paddy goes to MSP procurement. These shares are derived estimates.

**Moga's infrastructure.** Moga had **278 rice mills** in the 2015-16 data, 7% of Punjab's total [s38]. Milling capacity therefore sits in-district.

---

## 4. Dairy flow

```
Household (1-3 in-milk buffaloes/crossbred cows, berseem + wheat bhusa + concentrate)
   | twice-daily milking
   v
Village collection point
   |-- Nestlé milk collection centre (fat/SNF tested, bulk chiller in many villages)
   |-- Verka: village Milk Producers' Cooperative Society (AMCU test) --> district Milk Union
   '-- Dodhi (private vendor), cash on the spot, to towns/halwais/Chandigarh tricity
   v
Chilling (4°C bulk milk cooler at village or chilling centre)
   v
Insulated tanker --> Nestlé Moga factory (milk powder, condensed milk, dairy whitener)
                 --> Verka plant (pouch milk, ghee, curd, paneer) --> retail incl. Chandigarh
```

**Pricing.** Both Nestlé and Verka pay on **fat and SNF** content. The Verka figures are:

| Date | Buffalo (₹/kg fat) | Cow (₹/kg fat) | Source |
|---|---|---|---|
| From 11 Jun 2024 | 820 | 780 | [s17] |
| From 1 Apr 2026 | +20 in Patiala/Fatehgarh Sahib unions only | | |
| From 1 May 2026 | +20 statewide | +20 statewide | [s16] |

Buffalo milk at 6.5% fat therefore fetches roughly **₹54-55/L**. This is derived, and any 2025 revisions are unverified. We could not obtain Verka's two-axis fat+SNF chart for cow milk, so the cow price per litre is null. Nestlé pays **fortnightly** [s15].

**Volumes and yields.**
- Nestlé reports about 1.5 million kg/day from about 100,000 farmers [s15]. That catchment extends beyond Moga, so **Moga-level buyer shares are null**.
- Punjab produced 14.87 million tonnes of milk in 2024-25, about 1,318 g per person per day [s13].
- Average yield per in-milk animal in Punjab, 2024-25 [s13]:
  - buffalo: 10.66 kg/day
  - crossbred cow: 13.25 kg/day (exotic and crossbred together: 14.10 kg/day, the highest in India)
- A 2019 survey of 420 Punjab dairy farmers found buffalo yield of only **6.3 L/day**. Total cost was ₹180/day per milch buffalo, of which feed and fodder was ₹122/day. Net return was ₹46/day at ₹35/L [s14]. **Yields vary widely across farms; draw them from a distribution, not a constant.**

**Seasonality.**
- Flush season runs **Nov-Mar**. Buffaloes calve Aug-Dec and berseem is abundant.
- Lean season runs **May-Jul**, with heat stress and a fodder gap. Milk procurement prices tend to be raised around April-May.

---

## 5. Price formation

1. **Wheat and non-basmati paddy: administered prices.**
   - The Centre sets MSP at least 1.5× the all-India A2+FL cost, on CACP's recommendation. Paddy's A2+FL cost for 2026-27 is ₹1,627/qtl [s1].
   - Open procurement in Punjab makes MSP the *effective* farm-gate price for FAQ grain.
   - Prices only deviate through quality cuts (moisture, discoloration) and delays.
   - The private trade (flour mills, traders) seldom pays above MSP in Punjab, because the 6% state levies and the commission make private purchase in mandis expensive.
2. **Basmati: export-driven.**
   - Price depends on Iran/EU/Middle East demand, APEDA minimum export prices, and the variety (1121 > 1509).
   - Basmati pays about 1.15-1.7× the non-basmati MSP, with yields about 40% lower. Its returns over variable cost were the highest of all Punjab crops in 2018-19 [s25].
3. **Potato: cobweb cycle.** A high price leads to more planting and seed retention, which brings a glut and prices of ₹200-600/qtl. Cold-storage capacity and seed demand from other states set the floor.
4. **Maize: nominal MSP.** Mandi prices are ₹1,500-2,000 against an MSP of ₹2,400-2,410 [s34]. Government diversification programmes depend on whether maize procurement actually happens.
5. **Mustard.** Traded close to or above MSP in 2026, following edible-oil import duties [s37].
6. **Milk.** Cooperative and corporate fat/SNF price charts are revised a few times a year. Verka acts as the price leader, and Nestlé and private buyers match or beat it locally.
7. **Land rent.** Malwa rents sit at the top of the ₹45,000-65,000/acre/yr band. Rent is capitalised from paddy-wheat MSP income [s22].

---

## 6. Risks

| Risk | Mechanism | Data points |
|---|---|---|
| **Stubble burning enforcement** | CAQM environmental compensation per incident; FIRs; "red entries" in land records can block mandi sales | ₹5,000 (<2 acres), ₹10,000 (2-5 acres), ₹30,000 (>5 acres) since Nov 2024 [s21]. Punjab fires fell from 36,663 (2023) to 10,909 (2024). 2026 season: 52 fires by end-Sep, 2 in Moga [s32]. Combines must carry Super SMS; fines ₹50k/75k/1 lakh for 1st/2nd/3rd violation [s39] |
| **Groundwater depletion** | Free power plus paddy leads to over-pumping | ~64,232 tubewells in Moga; all 5 blocks over-exploited; water table falling 50-80 cm/yr [s20]. Rising pumping depth means bigger submersible pumps and borewell capex |
| **Delayed lifting / storage glut** | Agencies cannot lift within 72 h; mandis choke; millers refuse paddy; farmers wait | Oct 2026: CM asked the Centre to move 15 LMT of wheat; ~17 LMT still in mills/mandi yards [s29] |
| **Moisture / quality cuts** | Early-harvested or rain-hit paddy above 17% moisture is rejected or discounted | Policy norm |
| **Fee dispute with the Centre** | RDF/market fee withheld, so less money for mandi roads and maintenance | >₹4,200 crore dues [s11] |
| **Weather** | Heat in Mar (wheat grain fill); monsoon floods (2025); fog | 2025 shortfall in paddy procurement (15.7 MT vs target) [s28] |
| **Debt trap** | Arhtiya credit at ~18%/yr (1.5%/month) or more, tied to selling through the same arhtiya | [s23] |
| **Price crashes** in non-MSP crops | Potato, maize | [s34, s36] |

---

## 7. How to model (concrete rules)

Units: one tick = one day, calendar per `calendar[]`. A farm agent holds `landOwnedHa`, `landLeasedInHa`, `cash`, `debtInstitutional`, `debtArhtiya`, `herd[]`, `tubewells`, `arhtiyaId`.

### 7.1 Land and crop choice
1. **Initialise farm size** from `landholdings.categories`. These shares are state-level household shares (NSS), so drop the landless bucket for farm agents.
   - About 21% of holdings lease in land, and 28% of operated area is leased [s12].
   - Rent is `leasingRentInrPerAcrePerYear` (₹55,000, about ₹1.36 lakh/ha). It is paid 50% in month 4 and 50% in month 9.
2. **Kharif choice** (decided in month 5):
   - `expectedMargin(crop) = yield × expectedPrice − inputCost.total` (inflate the PAU 2018-19 costs by about 1.35× to reach 2026; this inflator is an assumption).
   - For MSP crops (wheat, paddy) use `expectedPrice = msp × (1 − qualityCutProb × 0.02)`.
   - For basmati, maize and potato use the last-season realised price with noise σ ≈ 20%.
   - Add a **risk premium** for MSP crops, since procurement is guaranteed. A logit with a strong status-quo bias reproduces the observed ~93% paddy share in Moga kharif.
3. **Rabi choice:** wheat by default. Potato on about 4% of area, mustard on about 0.5%, berseem on the fodder plot.
   - Fodder plot ≈ 0.1 ha per 2 in-milk animals. This is an assumption; calibrate it.

### 7.2 Paddy → wheat turnaround
1. **Harvest date.** Transplant on or after the zone date (Moga: 9 Jun). Harvest = transplant + 93 days for PR 126 (basmati ~100-110), plus a few days of field drying.
2. **Straw decision**, for each farm at harvest:
   - Options: `{inSitu (Super Seeder/Happy Seeder rental), exSitu (baler; often free if a biomass plant contracts the field), burn}`.
   - `P(burn)` rises when `daysToWheatDeadline` (15 Nov) is under 10 and when machine availability (CHC queue length) is high.
   - `P(burn)` falls with detection probability × fine (₹5,000 / ₹10,000 / ₹30,000 by farm size) and with the red-entry penalty (blocked from selling next season).
   - Calibrate so that the 2024-era Punjab level (~11k fires on ~3.2 Mha) is reproduced.
3. **Wheat yield penalty.** Lose about 0.5% of yield per day of sowing after 15 Nov. This is an agronomic rule of thumb; calibrate it.

### 7.3 Mandi and procurement
1. **Season windows.** Wheat: 1 Apr-~31 May. Paddy: 1 Oct-30 Nov.
2. **Selling.** Each farm takes its harvest (in quintals) to its tied arhtiya's mandi.
3. **Daily mandi capacity.** Lifting is a queue:
   - `liftedToday = min(stockInMandi, liftingCapacity)`.
   - If `stockInMandi > 3 × liftingCapacity`, purchases slow and farmers wait 2-7 days. Waiting costs labour and moisture risk.
4. **Purchase price** = MSP (Grade A for most PR 126). A moisture cut applies:
   - Paddy: above 17% moisture, a farmer either waits (dries) or sells to a private trader at MSP − ₹100-200.
   - That private-trader discount is an assumption; set it as a parameter.
5. **Payment.** Credited to the farmer's account at t + `paymentDaysTypical` (2 days), via DBT.
6. **Arhtiya income** = quintals × ₹50.75 (wheat) or ₹50.61 (paddy).
7. **Agency.** Pays MSP + 6% levies + commission + incidentals. It stores wheat until FCI lifts it, and allots paddy to millers.
   - Millers deliver CMR = 0.67 × paddy to FCI over the following months.
   - FCI dispatches by rail at a monthly rake capacity. Set a parameter; a shortfall leads to a storage glut the following April.
8. **Private crops.**
   - Basmati: sold to private traders/exporters in the same mandis, price exogenous with noise.
   - Potato: sold at harvest or held in cold store (storage fee per qtl, price-expectation rule).

### 7.4 Dairy
1. **Herd.** Small farm: about 2 in-milk animals + 1 young (derived). In-milk mix about 60% buffalo / 40% crossbred cow.
2. **Daily milk.**
   - Buffalo ~ N(10.35 L, 3) truncated at 3; crossbred ~ N(12.9 L, 3.5).
   - Multiply by a seasonal factor: ×1.15 in Nov-Mar, ×0.8 in May-Jul.
   - About 20-25% of milk is consumed at home. This is an assumption; NSS shows high home use in Punjab.
3. **Choice of buyer** each month: Nestlé, Verka society or dodhi, whichever maximises `pricePerL × reliability − distance cost`.
   - Price per litre = fat% × ₹/kg-fat (buffalo 6.5% × ₹840; cow use ~₹38-42/L as a placeholder until the SNF chart is sourced).
   - Nestlé and Verka pay fortnightly or weekly. Dodhis pay daily in cash at about −5% (assumption).
4. **Costs.** Feed ₹122/day per milch buffalo at 2019 prices; scale by about 1.4 for 2026 (assumption).
   - Berseem from the farm plot substitutes for purchased green fodder Nov-May.
   - Wheat bhusa comes from the farm's own wheat straw.
5. **Prices.** Shock the Verka per-kg-fat price +₹10-20 about twice a year (observed 2024-2026).

### 7.5 Credit
1. **Each season**, input costs are financed first from cash, then KCC, then the arhtiya.
   - KCC: 7% nominal, 4% if repaid on time, limit ₹3 lakh.
   - Arhtiya: 18%/yr, no limit; repaid by deduction at the next sale through that arhtiya.
2. **Initial debt.** Mean ₹2.03 lakh for indebted households (54% of households). 79% institutional / 21% non-institutional [s12].
3. **Default and distress.** If `cash < 0` after the season and the KCC is maxed, borrow from the arhtiya. If debt-service exceeds 50% of crop income for 2 seasons, the agent leases out land (switches to rent income) or sells land at the exogenous `landPriceInrPerAcre`, which is currently null and must be set as a scenario parameter.

### 7.6 Inputs and environment
1. **Fertiliser.** Wheat ₹5,279/ha, paddy ₹1,756/ha, derived from PAU doses × MRP. These are policy-fixed; shock only if the subsidy changes.
2. **Diesel.** ₹95.62/L drives machinery hire rates. Use a pass-through elasticity of about 0.3 to combine and tractor rents (assumption).
3. **Groundwater.** Power is free, so the marginal cost of water is zero.
   - Each paddy season, lower the district water table by 0.5-0.8 m [s20].
   - Every N metres of decline, a share of tubewells need a deeper submersible pump (capex shock, often arhtiya-financed).

### 7.7 Calibration targets (Moga)
- Wheat area ≈ 176,000 ha; paddy (all) ≈ 184,700 ha; basmati ≈ 12,000 ha; potato ≈ 7,500 ha.
- Wheat yield ≈ 53-55 qtl/ha; paddy ≈ 71 qtl/ha.
- Share of non-basmati paddy procured ≈ 0.9; wheat ≈ 0.68 (state).
- Indebted share ≈ 54%; mean debt ≈ ₹2.0 lakh (2019, so inflate).

---

## 8. Data gaps (null or low-confidence in the JSON)

- **Moga landholding size classes** (Agriculture Census district tables): portal unreachable. Punjab-level NSS household shares are used instead.
- **Land price per acre in Moga:** null. Listing sites conflict (₹35 lakh to ₹1.3 crore).
- **Combine harvester rent per acre in Punjab, 2025-26:** null. Only Haryana anecdotes were found.
- **Cow milk price per litre (Verka/Nestlé):** null. Buffalo per-litre is derived. No 2025 Verka revisions found.
- **Nestlé and Verka shares of Moga marketed milk:** null.
- **Berseem area in Moga:** null.
- **Per-ha seed and pesticide costs:** null. Labour, machinery and total costs are 2018-19 PAU figures; only fertiliser is 2026-derived.
- **Basmati, potato and mustard private prices:** aggregator data only (low confidence).
- **Moga tubewell count:** 64,232, from a Mar-2022 news report, not a CGWB/PSPCL table.
- **Tractor density:** a study estimate (15.4/100 ha NSA). The literature range is 8-16.
- **2026 paddy transplanting dates:** not found; the 2025 zone dates are used.
- **CACP Punjab-specific cost of cultivation for 2026-27:** the CACP site was unreachable.

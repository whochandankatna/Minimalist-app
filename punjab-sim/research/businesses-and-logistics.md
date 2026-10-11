# Businesses, money flows and logistics: Moga district and the Chandigarh tricity

Compiled 2026-10-11. This covers the data in `src/data/businesses.json` (49 sectors; Nestle Moga is not a sector because the sim creates it as its own agent. Sector names are worded so `classifySector` regexes map them to the right archetype) and `src/data/logistics.json`. Source IDs such as [s1] refer to `meta.sources` in either JSON file. The list is the same in both files.

> **How reliable the numbers are.** Few official counts exist at district level after 2011. Moga's base comes from the MSME-DI Ludhiana *Brief Industrial Profile*, which uses DIC data for 2010-11 [s1]. Counts for 2026 are scaled from that base using population and per-capita density heuristics, and every such figure says "Est." in its `notes`. The fuel prices, tolls, MSPs, procurement totals and policy facts below are sourced and were checked against two or more reports where possible.

---

## 1. The two economies at a glance

| | Moga district | Chandigarh tricity (Chandigarh, Mohali/SAS Nagar, Panchkula) |
|---|---|---|
| Population | ~1.0M in 2011, est. ~1.1M in 2026; ~80% rural; 323 villages [s1] | est. ~2.6M urban population |
| Economic base | Wheat-paddy procurement, dairy (Nestle's Moga "milk district" since 1961), remittances and emigration, farm machinery | Government employment, services, IT/ITES, real estate, organised manufacturing (Mohali, Derabassi, Panchkula), healthcare and education |
| Registered industry | 2,850 MSEs and 5 large/medium units; MSE turnover Rs 697 cr; large/medium turnover Rs 1,554 cr (2010-11) [s1] | Chandigarh has ~33,800 GST taxpayers (Jun 2026); domestic GST of Rs 908 cr in Q1 FY27 [s18] |
| Largest single firm | Nestle India, Moga: >1.3-1.5 million kg of milk per day in flush season from >110,000 farmers [s16] | No single anchor firm. Infosys Chandigarh has ~6,000 staff [s47]; Mohali has 150+ IT units and ~35,000 IT professionals [s46] |
| Formality | Mostly informal, with cash plus khata credit. Arhtiyas are the hub | Mostly formal, with UPI, cards and GST invoices. Chandigarh ranks near the top in per-capita UPI use [s55] |

Moga's 2010-11 registered MSE structure from the DIC [s1] is mostly food products and machinery. The breakdown is:

- **Food and beverages:** 445 units, 6,504 workers.
- **Machinery and equipment (agricultural implements):** 445 units, 3,182 workers.
- **Leather:** 337 units.
- **Non-metallic minerals (mostly brick kilns):** 120 units, 3,608 workers.
- **Furniture:** 133 units.
- **Motor-vehicle repair:** 117 units.
- **Cold storage:** 26 units.
- **Other:** only 7 "computer" units, plus 855 artisan units.

The DIC registered count fell from 5,400 in 2005-06 to 2,850 in 2010-11, but this came from re-registration that removed defunct units, not from units closing [s1].

---

## 2. How money flows

### 2.1 The arhtiya: the hub of Moga's rural finance

- **Role in the mandi.** Wheat (April-May) and paddy (October-November) are sold in regulated mandis through a licensed *arhtiya* (commission agent). Arhtiyas arrange cleaning, weighing, bagging and auction or sale to government agencies (FCI, PUNGRAIN, Markfed, PSWC) and handle the labour. Punjab has about 47,000 arhtiya licences [s20]. A PAU study found only about 20,232 operating families, because many licences are duplicates or dormant [s21]. Earlier estimates put active licensed agents at 24,000-28,000.
- **Commission.** The rate was 2.5% of MSP from 1998 [s19]. The Centre has since frozen it at about **Rs 45.88 per quintal** [s25], which is now about 1.8% of the wheat MSP of Rs 2,585/qtl [s34]. That means about Rs 46/qtl on wheat and Rs 45/qtl on paddy (MSP Rs 2,441/qtl for KMS 2026-27 [s35]).
- **Payment routing changed in 2021.** Before 2021, agencies paid the arhtiya, and the arhtiya paid the farmer by cheque or cash after deducting outstanding loans. In Rabi 2021 the Centre made Punjab pay MSP **directly into farmer bank accounts** through PFMS/DBT [s23]. Arhtiyas struck against it. Leasing complicated the change, because about 40% of land is tenanted [s60]. The relationship persists: the arhtiya now relies on the farmer to repay from the credited amount, and families keep selling through "their" arhtiya because the khata ties them to it.
- **Credit.** Arhtiyas are the farmer's main informal bank. They give advances for inputs, weddings, medical bills, foreign-study fees and tractor down-payments. Reported interest runs from 1%/month (12% p.a.) to 1.5%/month and higher [s20], and up to 18-37% p.a. in older reports [s22]. Farmers owe arhtiyas an estimated Rs 17,000-20,000 crore statewide [s20, s22]. Over one-fifth of rural household debt is owed to arhtiyas and moneylenders [s20].
- **Labour.** Mandi labour is paid per bag. Paddy labour rose from Rs 17.50 to Rs 19.26 per bag after a 10% hike [s24]; unions cite Rs 16.05 per 35-kg bag [s25]. The arhtiya or a labour contractor pays the money, and FCI or the agency reimburses it. Palledars (loaders) allege they receive about Rs 2 of a Rs 5/bag entitlement [s26].

**Net effect:** for each farm family, cash moves twice a year in large lumps (May and November). The arhtiya smooths consumption in between and earns an interest spread. In Moga, an estimated ~20 LMT of grain per year generates about Rs 95 crore in commission, spread across ~1,100 active firms.

### 2.2 Rice shellers and FCI

- **Allotment.** The state agency allots paddy to shellers through an online system. 4,132 of ~5,500 Punjab mills were allotted paddy in KMS 2024-25 [s31, s32]. That works out to roughly 4,000-4,500 t of paddy per miller.
- **Delivery and income.** Shellers return custom-milled rice to FCI at a 67% outturn norm. They earn milling charges and keep the byproducts (bran and husk). Many also trade private basmati.
- **Working capital.** Bank CC limits fund operations. Slow FCI acceptance, caused by storage-space shortages (Punjab needs to move 8-15 LMT of grain out each month [s38]), locks up capital for months.
- **Contested terms.** Delivery deadlines, outturn ratios and storage are recurring disputes. CAG has audited the system's leakages [s30].

### 2.3 Dairy (Nestle and Verka)

- **How farmers sell.** Farmers deliver milk twice a day to village collection centres. Nestle's centres have chillers and fat/SNF testing [s16, s17]. One village example: about 75 farmers supply about 1,000 L/day [s17].
- **How farmers are paid.** Nestle and Verka pay by **bank transfer every 10-15 days**, based on milk quality. Private *dodhis* (milkmen) pay cash weekly and lend informally.
- **Why it matters.** This is the most regular income stream a farm household has, and it carries the household between harvests. Flush-season volume (November-March) is 30-40% above the lean season.

### 2.4 Kiryana stores and udhaar (khata)

- **Credit to households.** A kiryana extends **khata credit** to known households based on the owner's judgement of the family [s59]. Salaried households (government staff, Nestle and bank employees) settle monthly. Farm households often run balances until the next harvest payment. Labourers get small, short credit.
- **Credit from wholesalers.** The retailer gets 7-21 days of credit from the wholesaler or FMCG distributor. Wholesalers in turn must pay FMCG companies in advance.
- **UPI.** QR codes are now universal in both Moga and the tricity. Chandigarh is among India's top UTs for per-capita UPI transactions [s55]. RBI finds UPI has reduced the growth of cash demand without eliminating it [s56]. In Moga, cash still dominates mandi side-payments, labour wages, wedding spending and land deals.

### 2.5 GST and formality: Chandigarh versus Moga

- **Chandigarh.** About 33,800 GST-registered taxpayers in Jun 2026 [s18], but only ~13,900 of an estimated ~40,000 shops are registered with the Labour Department [s48]. Even the formal city has a large unregistered tail.
- **Moga.** Grain sold at MSP is exempt from GST. Most kiryanas, chakkis, repair shops and dhabas sit below the Rs 40 lakh threshold or use the composition scheme. GST invoices appear mainly in Nestle and its ancillaries, vehicle and tractor dealers, petrol pumps, shellers' formal sales, and B2B purchases from Ludhiana.
- **Modelling consequence:** in Moga, informal share runs 0.6-0.85 for retail, services and repair. In the tricity it runs 0.05-0.5.

### 2.6 Remittances and emigration

Moga is an emigration district: IELTS centres, immigration agents and NRI families. Remittances fund weddings, gold, cars, houses and land, as well as study-abroad fees. Some of that money is borrowed from arhtiyas or raised by mortgaging land. The 2024 Canadian study-permit caps and the end of the SDS scheme cut IELTS enrolment by up to 70-80% at some Punjab centres and closed about 30% of them [s42, s43]. Moga still has dozens of listed IELTS centres [s44]. District commissioners regularly cancel licences of immigration firms and IELTS centres [s45]. Mohali alone has 471 registered travel agents [s58].

---

## 3. Trucking and logistics

**Fuel (10 Oct 2026).**

| | Diesel (Rs/L) | Petrol (Rs/L) |
|---|---|---|
| Moga (Punjab) | 95.59 | 105.69 |
| Chandigarh | 89.47 | 101.51 |

Sources: [s8, s9]. Prices rose by Rs 3 + Rs 0.90 per litre in May 2026 because of West Asia/Hormuz disruption and a weak rupee [s10]. Moga petrol was Rs 96.60 a year earlier [s11]. The ~Rs 6/L diesel gap means trucks on the tricity lanes refuel in Chandigarh.

**Main lane: Moga to Chandigarh.** About 165 km [s54] via Jagraon, Ludhiana and Samrala/Kharar on NH-05. The route passes two toll plazas:

- **Gurhe/Chowkiman:** 2-axle truck Rs 180 single in 2022-23 [s13], about Rs 205 in 2026 (est.).
- **Ghulal:** truck Rs 390 single, Rs 580 return from 15 Jul 2026 [s12]; multi-axle Rs 560-680 (2024) [s14].

A 10-wheeler (Tata Signa 2823 class, Rs 36-37 lakh ex-showroom [s50]) costs about Rs 14,000 for a one-way loaded trip with an empty return. **Freight is about Rs 15,000/trip (≈Rs 800/t), or ~Rs 11,000 with a backhaul.** This is an estimate built from costs, consistent with national bands of Rs 22-40/km for 16-20 t trucks and CMIE lane data [s52]. IFTRT notes that diesel moves trunk freight rates nearly one-for-one [s53].

**Grain logistics.**

- **Farm to mandi:** by tractor-trolley.
- **Mandi to godown/silo/sheller:** in tendered trucks.
- **Out of Punjab:** by FCI rail rakes. Punjab moved 95 LMT on 2,684 rakes in April-October 2024 [s39]. Adani's Moga (Dagru) silo holds 2 LMT under a 20-year FCI contract and runs dedicated rakes to Chennai, Coimbatore and Bangalore [s40, s41].

**Truck unions.** Until 2017, 134 town unions ran a closed *bari* (turn) system with union-fixed freight [s2]. Industry said union rates were 50-60% above market [s4]. The Punjab Goods Carriages (Regulation and Prevention of Cartelisation) Rules, 2017 dissolved them and moved tariff-setting to the RTAs. Amarinder refused to roll this back [s3]. Defiance continued (the Abohar union [s6]) and so did tender boycotts (2018 [s27, s28]). A revival notification came on 7 Jan 2022, against industry opposition [s5]. AAP promised a revival (2021, [s4]). Unions still operate de facto, with leadership fights in 2026 [s7].

**Mandi transport and labour tenders.**

- **Format.** The Food & Civil Supplies department runs annual cluster e-tenders, with bids quoted as a percentage over the FCI schedule of rates. Security deposit is Rs 5/MT of capacity (2022 policy [s29]). Premiums were capped at 120% over SOR in 2018 [s27].
- **Fallback.** If three tender rounds draw no bids, arhtiyas and shellers can bid at Mandi Board rates per quintal per km [s28].
- **Distance pricing.** CAG criticised Punjab's flat per-quintal rates, which ignore distance [s30].

---

## 4. How to model: concrete agent rules

Below, `t` is a weekly tick. Crop calendar: wheat harvest weeks 14-21 (April-May), paddy weeks 40-48 (October-November).

### 4.1 Agent types and state

| Agent | Key state | Initialise from |
|---|---|---|
| FarmHousehold | land (owned/leased), crops, cash, khataBalance[arhtiyaId], dairyAnimals, nriRemitter (bool), studentAbroadPlan | ~110k farm-linked households in Moga |
| Arhtiya | capital, loanBook{farmerId: principal, rate}, commissionIncome, labourContracts, trucksAccess | `arhtiya.estimatedCount` = 1,100 |
| RiceSheller | ccLimit, paddyAllotted, cmrDelivered, byproductStock | 260 |
| Kiryana (Moga/tricity) | inventory, cash, khata{householdId}, supplierPayables | 6,500 / 12,000 |
| Wholesaler | receivables{retailerId}, payables to FMCG (prepaid) | 600 |
| TruckOperator | trucks[type], loanEMI, dieselCredit, unionMember (bool), location | `truckTypes`, `share` |
| TransportCompany | fleetAccess, receivables (15-45 d) | 700 |
| NestleMoga | dailyMilkDemand, payCycle = 15 days | logistics flow `milk` |
| Government (state agency/FCI) | MSP, commission rate, tender SOR, paymentLagWeeks | `s34`, `s35`, tender notes |
| SalariedHousehold (tricity/Moga) | monthlySalary, khata | govt_employment_* sectors |

### 4.2 Rules

1. **Harvest sale.**
   - In harvest weeks, each FarmHousehold sells `q = output - homeConsumption` through its *primary arhtiya* (a sticky link: switching probability <5%/yr while `khataBalance > 0`).
   - The agency credits `q × MSP` to the farmer's bank after a lag ~ U(2, 10) days (DBT).
   - The arhtiya receives `q × 45.88/qtl` commission and labour reimbursement of about Rs 19/bag (37.5 kg). Of that labour money, it passes on 60-90% to labourers and keeps the rest, which reflects the contractor skim [s26].
2. **Khata netting.** On payment, the farmer repays the arhtiya `min(cash, khataBalance)` with probability `p_repay` = 0.85. This is lower when the debt-to-income ratio is above 1.5. Any unpaid balance rolls over at `r` = 1.25%/month (draw from 1-3%).
3. **Arhtiya lending.**
   - When a household's cash falls below its consumption need, or a lumpy event happens (wedding, illness, IELTS or visa fees of Rs 15-30 lakh, tractor down-payment), it asks its arhtiya.
   - The arhtiya lends if `khataBalance + loan < 0.6 × expected next-two-harvests value` and the arhtiya has liquidity. Otherwise the household goes to an MFI/NBFC (22-26%), a moneylender (24-36%), or a land mortgage to a bank.
4. **Input credit.** At sowing (weeks 42-46 for wheat, 22-26 for paddy), the farmer buys inputs from the agri-input dealer or PACS. 50-70% is on udhaar, with an implicit 1.5-2%/month or price markup, due at the next harvest.
5. **Dairy income.** Every 2 weeks, `milkLitres × price(fat, SNF)` goes to the bank account (Nestle/Verka). Flush multiplier is 1.35 in November-March. 10-20% of dairy households sell to dodhis, who pay weekly cash.
6. **Kiryana khata.**
   - **Moga:** a share of purchases goes on credit: 30% (farm households), 15% (salaried), 10% (labourers, with a cap of Rs 3,000). Farm households settle in harvest weeks; salaried households in weeks 1-2 of each month.
   - **Tricity:** 10% for salaried households, settled monthly.
   - **Payment mix (non-credit sales):** Moga 55% UPI / 45% cash; tricity 80% UPI.
   - **Default:** write off with probability 3%/yr of the outstanding balance.
7. **Wholesale chain.** Kiryanas pay wholesalers after D ~ U(7, 21) days. Wholesalers prepay FMCG companies. If a retailer's receivables exceed 1.5× monthly purchases, the wholesaler cuts its credit.
8. **Sheller cycle.**
   - Allotment = paddy procured / number of active millers.
   - The sheller draws its CC limit at 9-10% p.a. against stock. CMR delivery runs at 4-8% of allotment per week, conditional on FCI storage capacity (a global constraint linked to rail evacuation of 8-15 LMT/month).
   - Revenue = milling charge + bran/husk sales. Costs = power, labour, interest on stock.
9. **Grain transport.**
   - Each harvest week, mandi-to-godown tonnage = procurement × lifting rate (0.6-0.9).
   - The transport contractor (tender winner) hires union or local trucks. The rate is SOR × (1 + bid premium ≤ 1.2) per quintal by distance slab. Payment from the agency lags 4-20 weeks.
   - If the union strikes (probability 10-20% per season), lifting drops to 0.3 until the state allows arhtiya or sheller bids or tractor-trolleys [s27, s28].
10. **Truck pricing.**
    - Trip cost = `(km_loaded/kmpl_loaded + km_empty/kmpl_empty) × diesel_price + tolls + driverDays × wage/26 + km × (depreciation+maintenance ≈ Rs 30/km for a 10-wheeler)`.
    - Open-market freight = cost × (1.1-1.2). Where `unionMember` and the load originates in the union's town (mandi, sheller, local industry), freight = cost × (1.3-1.6), the cartel markup [s4].
    - Operators buy diesel in Chandigarh when the route passes through it (saving Rs 6.12/L).
11. **Monthly salary pulse (tricity).** Government and IT payrolls are paid on day 1. This drives retail, restaurant, EMI and rent flows in weeks 1-2, so model consumption as front-loaded in the month.
12. **GST leakage.** Each B2B transaction is invoiced with probability `1 - informalShare` of the *seller's* sector. B2C in Moga is mostly un-invoiced. Tricity GST collection should come out at about Rs 300 cr/month (Q1 FY27 average [s18]).
13. **Remittances and emigration.**
    - 15-25% of Moga households have an NRI member and receive Rs 2-10 lakh/yr, concentrated in November-February.
    - Each year, 2-4% of households with 17-25-year-olds start a study-abroad file. That triggers IELTS fees (sector `ielts_coaching`), consultant fees, and a large outlay financed by savings, land sale or mortgage, or an arhtiya loan.
    - Apply a Canada-cap shock from 2024 (demand -60% to -70%), partly offset by other destinations.
14. **Weddings.**
    - Lumpy spend of Rs 10-40 lakh per wedding, concentrated in October-March.
    - Allocation: banquet 30%, jewellery 30%, clothes 10%, catering 20%, gifts and other 10%.
    - Financed in this order: harvest cash, then NRI money, then an arhtiya loan.
15. **Freight flows between regions.** Use `logistics.flows` as annual targets and distribute them by season. The Moga-to-tricity link mostly runs **via Ludhiana C&F hubs**, so route general goods through a Ludhiana node rather than directly.

### 4.3 Calibration checks

- Moga arhtiya commission pool ≈ Rs 90-100 cr/yr. Punjab-wide ≈ Rs 1,400-1,800 cr.
- Moga procurement: wheat ≈ 7-8 LMT, paddy ≈ 12-14 LMT (14.5 LMT in the record 2020 season [s33]).
- Nestle milk intake ≈ 1.1 million kg/day average (1.3-1.5 million in flush) [s16].
- A 10-wheeler Moga-Chandigarh round trip ≈ Rs 14-15k at 2026 diesel prices.
- Chandigarh GST ≈ Rs 230-300 cr/month [s18].

### 4.4 Known gaps (next research steps)

- No post-2011 official Moga establishment counts were found. Udyam district counts sit behind indiastat, and Economic Census-6 Chandigarh microdata is available on microdata.gov.in but was not pulled.
- No 2025-26 district cluster transport tender rates (SOR per qtl per km) were found. The values in `freightRates` for mandi-to-godown are estimates.
- 2026 rates for the Gurhe toll plaza were not published in the sources found; the figure is extrapolated from 2022-23.
- No current Moga-specific procurement totals were found. The flows are scaled from Punjab totals using Moga's historical share of about 6-7%.

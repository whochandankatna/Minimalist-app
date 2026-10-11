# Psychographic agent profiles: Moga district and Chandigarh tricity

Compiled 2026-10-11. Data file: `src/data/psychographics.json` (18 profiles: 12 Moga, 6 Chandigarh).

## 1. Method

1. **Anchor the money first.** Income and consumption levels are pinned to official surveys: HCES 2023-24 MPCE [s1, s2], the NSS 77th-round Situation Assessment Survey (SAS 2019) [s3, s4], NAFIS 2021-22 [s5], MSP notifications [s26, s27] and the Punjab minimum-wage schedule [s28]. Older nominal figures were rolled forward to roughly 2025-26 prices using about 6-7% nominal growth a year. **That growth rate is a modelling assumption.**
2. **Set segment sizes.** Census 2011 gives Moga's demography: 995,746 people, 77% rural and 36.5% SC [s6]. The Agricultural Census gives the Punjab holding-size mix [s10]. Shares are household weights for agents, not survey estimates (see §4).
3. **Derive traits.** Each trait is a 0-1 parameter, except `lossAversion`, which is the prospect-theory λ. Values start from a regional or national prior and move per segment only where a source supports a direction, such as the arhtiya credit tie-in, migration intensity or wedding signalling. **Where no Punjab-specific measurement exists, the value is a labelled modelling assumption.** This applies to all `religiosity` values, all `lossAversion` values and all payment-mix splits.
4. **Validate.** A build script checks that `consumptionShares`, `paymentMix` and `incomeSources` each sum to exactly 1.0 (the residual goes into `other`, `cash` and the largest income source). It also checks that shares in each region sum to 1.0, that traits lie in [0,1] and that every `sourceId` resolves.

### Key anchor numbers (verified against primary or official secondary sources)

| Quantity | Value | Source |
|---|---|---|
| Punjab average MPCE, rural / urban, 2023-24 | Rs 5,817 / Rs 7,359 (2022-23: 5,315 / 6,544) | s1, Table 2 |
| All-India average MPCE, rural / urban, 2023-24 | Rs 4,122 / Rs 6,996 | s1 |
| Punjab consumption Gini, rural / urban, 2023-24 | 0.190 / 0.218 (among the lowest of the major states) | s1, Table 5 |
| Chandigarh MPCE, rural / urban, 2023-24 | Rs 8,857 / Rs 13,425 (highest of all UTs) | s2 (secondary; check against the MoSPI report tables) |
| All-India food share of MPCE, rural / urban, 2023-24 | about 47% / about 40%; conveyance 7.59% (rural) and 8.46% (urban); urban rent 6.58% | s1 |
| All-India SC rural MPCE vs. all-household rural MPCE | Rs 3,878 vs Rs 4,122 | s1, Table 3 |
| Punjab agricultural household income, 2018-19 | Rs 26,701/month (2nd highest after Meghalaya) | s4 |
| Punjab average outstanding loan per agricultural household, 2018-19 | Rs 2,03,249 (all-India Rs 74,121); 54.4% of households indebted | s3 |
| NAFIS 2021-22 all-India rural household income | Rs 12,698/month (agricultural households Rs 13,661) | s5 |
| Punjab SC population; SC share of operated land | 31.94% of population; 3.58% of operated area (AgCensus 2015-16) | s7, s9, s8 |
| Moga SC population | 363,417 (36.5%) | s6 |
| MSP: common paddy KMS 2025-26; wheat RMS 2026-27 | Rs 2,369/qtl; Rs 2,585/qtl | s27, s26 |
| Punjab agriculture minimum wage (Mar 2024) | Rs 437.26/day without meals | s28 |
| Migrant workers in Punjab | 1.6 million (1991) rising to 2.32 million (2011) | s24 |
| Opioid dependence in Punjab (2015) | about 232,000 dependent; 99% male; 56% rural | s21 |
| Chandigarh per-capita NSDP, 2023-24 | Rs 2,56,912 (4th highest of states/UTs) | s30 |
| Youth (15-29) unemployment, all-India, 2023-24 | 10.2% | s35 |

### Region-level sanity checks

- **Moga**
  - The weighted median household income across agents is about Rs 42,000/month.
  - HCES implies average household consumption of about Rs 28,000 rural (5,817 × about 4.8 persons) and about Rs 31,000 urban (7,359 × about 4.2), or roughly Rs 30-33k in 2025-26 prices.
  - That implies a 20-25% average saving or debt-service margin. This is plausible given the high debt-service burden of farm households [s3], but it is a calibration target to tune.
  - The weighted food share is 41%. That is below all-India rural (47%), as Engel's law predicts for higher-MPCE Punjab.
- **Chandigarh**
  - The weighted median income is about Rs 74,000/month.
  - Urban MPCE of Rs 13,425 × about 3.8 persons gives about Rs 51,000 of consumption.
  - That implies an average saving rate near 30%. Taxes are partly included in HCES consumption, so treat this as an upper bound.
  - The weighted food share is 34%, below all-India urban (about 40%).

Household-size multipliers are **assumptions**. Use the HCES/NFHS-5 household-size tables when calibrating.

## 2. Trait priors (apply unless overridden)

- **riskAversion: base 0.6.** Binswanger's experiments in rural India found that at high stakes "virtually all individuals are moderately risk-averse". Wealth reduced risk aversion only slightly and not significantly [s11]. Variation across profiles is therefore kept modest (0.40-0.85). Poorer and older agents sit at the higher end, which is a modelling assumption. Punjab's assured MSP procurement of wheat and paddy (about 90% of market arrivals procured, per [s33]) lowers *price* risk. Farmers in turn resist diversifying out of MSP crops. That behaviour is encoded in decision rules rather than as a trait.
- **lossAversion: base 2.25** [s36]. Values range from 1.8 to 2.6 and are scaled up for low-buffer, indebted households. **This is an assumption.** No Punjab field estimate was found.
- **socialConformity and trust.** Hofstede scores India 77 on power distance, 48 on individualism (intermediate-collectivist) and 40 on uncertainty avoidance, as commonly reported; the Hofstede site has revised some scores, so recheck [s32]. These support moderate-to-high conformity priors (0.6-0.75) in rural profiles and lower ones (0.4) for IT professionals. Hofstede is national-level and should not be read as Punjab-specific.
- **statusConsumption.** The evidence on wedding spending as status signalling comes from rural India [s15, s38]. Punjab fieldwork lists "aspirational consumption" among the drivers of farm debt [s14]. Land-owning and NRI households get higher values because they have the means and the visibility. For landless households, CRRID found that marriage was only 14% of debt, behind illness (20%) and housing (24%) [s22]. Their status and ceremony parameters are therefore kept low, which avoids the "lavish Dalit wedding" stereotype.
- **digitalAdoption and paymentMix.** Chandigarh ranks near the top of Indian states and UTs for per-capita UPI use [s29]. No Punjab rural UPI share was found. **Rural payment splits are modelling assumptions** that put cash and udhaar higher for low-income and harvest-cycle households. Re-calibrate with NPCI state data or the RBI Digital Payments Index when available.
- **religiosity.** This is **an assumption for every profile.** It is set at a uniform 0.6-0.7 for rural households and older pensioners, and 0.35-0.55 for students and IT professionals. It is used only to scale gurdwara or mandir donations and religious-ceremony spending. No caste, religion or region is assigned extra religiosity without data.

## 3. Per-profile justification

Unless noted otherwise, income ranges are household-level and in about 2025-26 nominal INR. Consumption shares start from the HCES 2023-24 item structure [s1]: food, fuel and light, clothing/bedding/footwear, education, medical, conveyance, durables and rent. They are then tilted with income using Engel's law. `ceremonies` is carved out of HCES miscellaneous and services spending and is **an assumption** (an annualised average of weddings, bhog/path and similar events). `other` covers toiletries, mobile and internet, tobacco and intoxicants, entertainment and consumer services.

### Moga (Malwa)

**marginal_farmer: under 2.5 acres (share 0.04)**
- **Holdings.** Punjab's holding mix is skewed towards larger farms compared with India. Marginal holdings were only about 15.6% of holdings in 2010-11 (164k of 1,053k) [s10]. Many marginal owners lease out their land and are counted under labour, so the weight is small.
- **Income.** About Rs 18k median. The crop margin assumes about Rs 5,000-5,500 per acre per month from paddy and wheat combined. That figure is **an assumption** based on typical Punjab yields of about 26 qtl/acre paddy and about 20 qtl/acre wheat at MSP [s26, s27], less paid-out costs. Dairy and wages are added on top. Dairy made up 43-55% of farm business income on marginal Punjab farms [s23]; here it is 25% of total income because wages are also counted.
- **Credit and savings.** High creditAppetite out of necessity, low savings (3%) and a high udhaar share. The basis is Punjab's high indebtedness [s3], heavier debt severity among marginal and small farmers [s37], and arhtiya credit tie-in [s12].
- **Loss aversion and risk.** Highest among farmers (λ 2.5, riskAversion 0.75). **This is an assumption** reflecting the lack of a buffer.

**small_farmer: 2.5-5 acres (0.05)**
- **Income.** About Rs 30k median, based on the same per-acre logic. Small holdings were about 18.5% of holdings in 2010-11 [s10].
- **Behaviour.** Mixes KCC and cooperative credit with arhtiya credit. PAU research found indebted farmers stay with the same agent because they cannot clear debt in one season [s12].
- **Migration.** migrationAspiration of 0.65 reflects the broad farm-family base of study-visa aspirants [s16, s17].

**jat_medium_farmer: 5-10 acres (0.08)**
- **Holdings and income.** Semi-medium holdings (2-4 ha) are the modal class in Punjab, at about 31% of holdings [s10]. The Rs 52k median is consistent with SAS 2019 (Rs 26.7k average across all sizes in 2018-19 [s4]) once rolled forward and adjusted for above-average land.
- **Naming and caste.** The id keeps the requested "jat" label because land in this class is predominantly held by non-SC households: SCs operate only about 3.6% of the area [s8, s9]. The **traits are tied to land size and economic position, not caste**. They should not be read as claims about Jat Sikhs as people.
- **Status and decisions.** statusConsumption of 0.65 draws on wedding signalling [s15] and the aspirational consumption found in Sangrur fieldwork [s14]. The rule "sells through the same arhtiya even at ~1% worse terms" is supported by [s12]. Readiness to sell or mortgage land for a study visa comes from [s16] and reporting on Malwa families selling land or taking loans [s18].

**large_farmer_arhtiya: 10+ acres and/or commission agent (0.07)**
- **Holdings.** Medium plus large holdings (over 4 ha) were about 35% of Punjab holdings in 2010-11 [s10]. The household weight is lower than that because many such holdings belong to NRI or absentee owners (they appear under nri_remittance_household).
- **Income and lending.** Business income (35%) represents arhtiya commission, which is 2.5% of procurement value, plus interest on loans to farmers at about 15-18% (PAU) or 15-28% (press reports) [s12]. Informal arhtiya credit has been econometrically linked to farmer suicides in Punjab [s13]. That finding feeds the *borrower* profiles' triggers, not this profile's traits.
- **Traits.** riskAversion is the lowest of the Moga profiles (0.45) and savings the highest (25%). **These are assumptions** consistent with Binswanger's weak wealth gradient [s11].

**dalit_agri_labourer: landless SC labour household (0.22)**
- **Weight.** Moga is 36.5% SC [s6], and SCs hold very little land [s8, s9]. Not every SC household is a labourer, so the 0.22 weight also absorbs non-farm casual labour.
- **Income.** About Rs 20k median from about two earners. Male farm or construction work is priced near or above the Rs 437/day minimum wage [s28], with seasonal peaks. **Days worked are an assumption.** The figure is cross-checked against the lower SC MPCE (all-India SC rural MPCE is about 6% below the rural average [s1]).
- **Debt purposes.** These follow CRRID: illness 20%, house construction 24%, marriage 14% [s22]. Health is therefore kept relatively high and ceremonies relatively low (4%).
- **Triggers.** Mechanisation and the shift to direct-seeded rice reduce labour days [s25]. Social conflicts over wages and common land are included as a *trigger*, not a trait. They are documented in Punjab reporting, but their magnitude should be calibrated rather than assumed.

**migrant_labourer: UP/Bihar (0.06)**
- **Background.** Migrant workers numbered 2.32 million in Punjab in 2011, about 6% of workers [s24]. Paddy transplanting depends on them.
- **Saving behaviour.** Seasonal workers carry home Rs 35-40k after about a month, roughly a year's income at home [s25]. This motivates savingsRate = 0.35, interpreted as the share remitted.
- **Housing.** A high housing share (10%) reflects shared rented rooms. **This is an assumption.**

**dairy_household: 8-20 animals (0.05)**
- **Income.** Dairy is a major supplement for marginal and small farmers [s23]. The 70% dairy income share and the buyer-loyalty rules (Verka/Milkfed societies, private dairies) are **modelling assumptions** based on standard Punjab milk marketing channels.

**nri_remittance_household (0.09)**
- **Evidence.** A Punjabi University survey of 2,597 rural households found 13.6% of households had entirely migrated abroad [s17]. A separate 2023 survey across eight universities and villages, reported in the press and not independently verified, found 31.5% of families already had someone abroad. Punjab students spent an estimated US$3.7 bn on Canadian education in 2023-24 [s18]. The RBI's 2023-24 remittance survey reports rising inflows to Punjab but does not give the state share in its summary [s31].
- **Spending.** Remittance use goes to durables, cars, furniture, housing and loan repayment [s34]. Hence high statusConsumption (0.8) and durables/transport shares.
- **Land.** Land is leased out (theka). **This is an assumption** based on common practice; leasing rates should be calibrated.

**small_town_trader (0.14)**
- **Weight.** Covers Moga's urban population (23% [s6]) and mandi-town households. Salaried urban households, such as factory staff and teachers, are folded in here; see the limitations.
- **Credit and payments.** Udhaar extended to farm customers and harvest-cycle revenue are assumptions consistent with [s12]. UPI acceptance is **assumed** at 50% of receipts.

**ielts_aspirant (0.06)**
- **Agent framing.** The agent is the youth, but the income range is the household's.
- **Evidence.** Qualitative work with Punjabi students shows a blurring of "migration for education" and "education for migration". It also shows a strong desire to move to a "more liberal" society, especially among women [s16]. Canada's policy shift reduced Indian study permits sharply: about 50% lower in 2025 [s19]. IELTS test-taking in Punjab fell steeply after the Student Direct Stream ended in November 2024 [s20].
- **Triggers.** These include destination switching (Australia, UK, Germany), reported in [s20].

**truck_owner_operator (0.04)**
- **Evidence.** Thin. The income split and triggers are **modelling assumptions** based on grain-movement seasonality, which follows the procurement calendars in [s26, s27]. Overseas trucking as a migration path is an assumption drawn from general reporting and needs a source before it is relied on.

**unemployed_rural_youth (0.10)**
- **Unemployment.** National youth unemployment was 10.2% in 2023-24 [s35]. A Punjab-specific PLFS youth rate was not retrieved; pull it from the PLFS annual report state tables.
- **Substance use.** The 2015 opioid survey estimated about 232,000 opioid-dependent people, 99% male and 56% rural [s21]. That is roughly 1% of Punjab's population, so dependence is encoded as a **small probability** inside the profile, not a defining trait.
- **Trust.** trustInInstitutions is set low (0.25). **This is an assumption** reflecting job-market frustration also visible in migration motives [s16].

### Chandigarh tricity

The tricity's urban MPCE (Rs 13,425) is almost double the all-India urban figure [s2], and per-capita NSDP is about Rs 2.57 lakh [s30]. The segment mix is **an assumption**: no public table splitting tricity households by these six occupations was found. Calibrate it with PLFS urban Chandigarh tables (regular salaried vs. self-employed vs. casual) and Census 2011 B-series.

- **govt_employee (0.26).** Chandigarh is a capital for two states and a UT, which justifies the largest weight. Rules follow secure-salary logic: housing and car loans, safe assets, and Pay Commission/DA triggers. trustInInstitutions is high (0.75). **This is an assumption.**
- **it_professional (0.14).** Covers Mohali and Chandigarh IT Park employment. The ecommerce/quick-commerce defaults and card use are consistent with Chandigarh's top-tier per-capita UPI use [s29]. Equity SIP behaviour and the low loss-aversion value (1.8) are **assumptions**.
- **business_owner (0.14).** High status consumption, property investment and children studying abroad. Supported by [s15] and the student-migration literature [s16]; magnitudes are assumptions.
- **retired_pensioner (0.12).** Health share 14% (more than double HCES all-India rural medical at 6.83% [s1], scaled for age), FD preference, and high riskAversion (0.85) and λ (2.5). **These are assumptions.**
- **student (0.10).** Income is parental transfers, coded under `remittance`. UPI share is 85%. **These are assumptions**, consistent with [s29].
- **domestic_informal_worker (0.24).** Many are inter-state migrants [s24]. Housing share of 12% reflects colony rents, and udhaar is extended at local kiryanas. Wage levels are anchored above the Punjab minimum wage schedule [s28]. **The weight is an assumption** and should be calibrated against PLFS casual and self-employed shares.

## 4. Limitations

1. **Shares are agent weights, not estimates.** They are triangulated from Census 2011 demography, Agricultural Census holding-size distributions and judgement. They are not drawn from a district-level survey. Census 2011 is 15 years old, and the Agricultural Census counts holdings, not households.
2. **Income is extrapolated.** SAS 2019 and NAFIS 2021-22 figures were rolled to 2025-26 at an assumed 6-7% nominal growth. NAFIS Punjab state values could not be retrieved; secondary reports say Punjab ranks highest for agricultural household income in NAFIS. Per-acre crop margins are assumptions, not CACP cost-of-cultivation figures. Replace them with CACP Punjab A2+FL data when calibrating.
3. **Item shares are mostly all-India.** The Punjab and Chandigarh state-level HCES item-group tables were not extracted, so all-India 2023-24 shares tilted by income were used. Extract Statement tables from the MoSPI final report to calibrate.
4. **No direct Punjab measurement for several traits.** Risk preference, loss aversion, religiosity, brand loyalty and payment mixes have no direct Punjab estimate. Binswanger [s11] is nearly 45 years old and from semi-arid southern India. Hofstede [s32] is national.
5. **Caste and group labels.** Profile names that reference caste (Jat, Dalit) describe *economic positions* correlated with caste in Punjab's land structure [s8, s9]. Behavioural parameters are set by income, assets and credit position. Do not use caste as a behavioural driver in simulation logic.
6. **Migration has changed quickly.** Study-visa flows changed sharply in 2024-26 [s19, s20]. migrationAspiration should be read as desire, with realised migration modelled separately and gated by policy.
7. **Drug dependence data is from 2015.** The opioid estimate [s21] covers opioids only and should not be extrapolated to all substances.
8. **Not verified in full:** the PAU arhtiya study (via a press summary [s12]); the CRRID debt split (via a press summary [s22]); the Chandigarh MPCE (via a secondary summary [s2]); the youth unemployment figure (via a parliamentary reply [s35]).
9. **Missing segments.** Moga salaried urban households (for example teachers and Nestlé-plant staff) and Chandigarh middle-income private-sector non-IT workers are not modelled separately. They are absorbed into the trader and government profiles.

## 5. Sources

The full list with URLs is in `meta.sources` of the JSON (s1-s38).

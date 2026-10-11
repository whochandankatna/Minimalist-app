# Geography: Moga district to Chandigarh corridor

Compiled 2026-10-11. Data file: `src/data/geography.json` (74 places, 7 highways, 5 railway lines).

## The corridor

Moga (Census 2011: 163,397, Municipal Council with outgrowth; district 995,746) sits in the wheat-paddy belt of Malwa, south of the Sutlej. The main axis eastward is **NH-5** (formerly NH-95). It runs Ferozepur – Talwandi Bhai – Moga – Ajitwal – Jagraon – Mullanpur Dakha – Ludhiana – Samrala – Morinda – Kharar – Mohali – Chandigarh, then continues to Zirakpur [Wikipedia NH-5][s3]. It is four-lane for most of its length. The Kharar–Mohali stretch is an elevated six-lane road.

Ludhiana is the hinge of the corridor. NH-5 crosses **NH-44** (the old GT Road, NH-1) there, which runs Jalandhar – Phagwara – Ludhiana – Khanna – Sirhind/Mandi Gobindgarh – Rajpura – Shambhu – Ambala and is six-lane. Chandigarh is also reached from the south by **NH-7** (old NH-64): Bathinda – Barnala – Sangrur – Patiala – Rajpura – Banur – Zirakpur [Wikipedia NH-7][s6].

Feeder roads out of Moga:
- **NH-703** runs north to Dharamkot – Shahkot – Nakodar – Jalandhar and south-east to Badhni Kalan – Barnala – Mansa [Wikipedia NH-703][s4]. It is mostly two-lane. NHAI has a four-lane greenfield Jalandhar–Moga alignment in the works.
- **NH-105B** is a spur from NH-5 at Moga to Bagha Purana and Bajakhana, where it meets NH-54 [Wikipedia NH-105B][s11].
- The **Moga–Kotkapura road** is historically SH-16. Its Singhawala toll was made free in 2023 [Tribune][s15]. Kotkapura–Bathinda is **NH-54** [Wikipedia NH-54][s5].

## Road distances (OSRM over OpenStreetMap, free-flow)

| From → To | km | approx. hours |
|---|---|---|
| Moga → Chandigarh (Sector 17), via NH-5 Jagraon–Ludhiana–Samrala–Kharar | 167 | 2.2 |
| Moga → Mohali | 160 | 2.1 |
| Moga → Ludhiana | 68 | 0.9 |
| Moga → CONCOR ICD Dhandari Kalan | 79 | 1.1 |
| Ludhiana → Chandigarh | 100 | 1.3 |
| Moga → Jalandhar (NH-703) | 80 | 1.05 |
| Moga → Barnala (NH-703) | 71 | 0.9 |
| Moga → Bathinda (fastest, via NH-105B/Bajakhana) | 78 | 1.0 |
| Moga → Bathinda (via Kotkapura) | 104 | 1.4 |
| Moga → Ferozepur | 60 | 1.0 |

Real truck times are longer: about 1.5–2 times the free-flow figure, because of urban crossings at Ludhiana, Kharar and Zirakpur and mandi-season congestion.

## Freight flows to model

1. **Grain (wheat in April–May, paddy in October–November).** Farm villages deliver to a Moga-district mandi. Mandis feed FCI/state-agency godowns or the **Adani Agri Logistics silos at Dagru**. The silos have a rail siding and hold roughly 2 lakh tonnes (some reports say 3) under a 20-year FCI guarantee [Tribune][s10], [Adani][s16]. Grain leaves by rail rake from Moga or Dagru on the Ferozepur–Ludhiana line toward Ludhiana and the national network. Moga district mandis in the file: the Moga main yard plus sub-yards and purchase centres at Dharamkot, Bagha Purana, Nihal Singh Wala, Kot Ise Khan, Buttar/Badhni, Daudhar, Charik Road, Joge Wala and Kotla Rai Ka.
2. **Milk.** Village collection centres feed the **Nestlé Moga factory**, which has run since 15 November 1961 and draws milk from about 30,000 km² [Nestlé][s9], [Third World Centre][s17]. Milk also goes to Milkfed **Verka plants** in Ludhiana and Mohali.
3. **Manufactured and container goods.** The Ludhiana Focal Point industrial estate ships through the **CONCOR ICD at Dhandari Kalan** and the **GRFL ICD at Sahnewal**. Chandigarh Industrial Area Phases I/II and the Mohali industrial phases are the eastern demand and supply nodes.
4. **Consumption.** Chandigarh Sector 26 (grain and vegetable mandi) and the Sector 17 commercial centre.

Rail lines in the file:
- Ferozepur Cantt – Talwandi – Dagru – Moga – Ajitwal – Jagraon – Mullanpur – Ludhiana, 124 km [etrain][s14].
- Ludhiana – Jalandhar on the main line.
- Ludhiana – Khanna – Sirhind – Rajpura – Ambala, then Lalru – Chandigarh. There is no direct Rajpura–Mohali line.
- Chandigarh – Mohali – Kharar – New Morinda – Samrala – Sahnewal – Ludhiana, opened 2006–2013 [Wikipedia][s13].

## Data caveats

- **Coordinates.** Towns, stations and most mandis come from OpenStreetMap Nominatim. The following are approximate and flagged in their `notes`:
  - the Moga main mandi, placed on Dana Mandi Road
  - the Adani Dagru silo, placed next to Dagru station
  - the representative FCI/PUNGRAIN/Markfed godown point, whose location is assumed
  - Verka Ludhiana, the Mohali industrial point, the Khanna mandi, Sector 26, and the PAU/PU centroids
- **Highway geometry.** This is OSRM's route over OSM, resampled about every 6 km. It follows the real carriageway but gives no lane-level detail.
- **Toll plazas.** Positions were snapped to the route from the village each toll is named after, so they are approximate.
  - Ladhowal (NH-44) is well documented [Tribune][s12]. The Shambhu (NH-44) and Ghulal (NH-5) names are reasonably supported.
  - The NH-7 names (Lehra Bega, Badbar, Kalajhar, Dharheri Jattan) are from memory and not verified this session.
  - No toll plaza could be confirmed on NH-5 between Ferozepur and Ludhiana.
  - Punjab closed several state-highway tolls in 2022–24, and the Ladhowal toll saw protest closures, so operating status changes over time.
- **Highway designation.** The Moga–Kotkapura road (SH-16 vs. NH-105B/NH-54 segments) is uncertain. NH-703's routing through Dharamkot is inferred from OSM `ref` tags.
- **Populations.** City and town figures are Census 2011 [CityPopulation][s7], [Wikipedia][s8]. Panchkula (211,355) was not re-verified. Village-cluster, Ajitwal and Nihal Singh Wala populations are rough estimates for agent sizing only.

[s3]: https://en.wikipedia.org/wiki/National_Highway_5_(India)
[s4]: https://en.wikipedia.org/wiki/National_Highway_703_(India)
[s5]: https://en.wikipedia.org/wiki/National_Highway_54_(India)
[s6]: https://en.wikipedia.org/wiki/National_Highway_7_(India)
[s7]: https://www.citypopulation.de/en/india/punjab/
[s8]: https://en.wikipedia.org/wiki/List_of_cities_in_Punjab,_India_by_population
[s9]: https://www.nestle.in/csv/communities/dairy-farmers
[s10]: https://www.tribuneindia.com/news/punjab/liquidate-wheat-stock-fci-to-moga-faridkot-admns-317485
[s11]: https://en.wikipedia.org/wiki/National_Highway_105B_(India)
[s12]: https://www.tribuneindia.com/news/ladhowal-toll-plaza-7th-highest-collector-in-country
[s13]: https://en.wikipedia.org/wiki/Chandigarh%E2%80%93Sahnewal_line
[s14]: https://etrain.info/train/Fzr-Ldh-Passenger-54052/schedule
[s15]: https://www.tribuneindia.com/news/punjab/singhawala-toll-plaza-on-moga-kotakpura-road-made-free-cm-mann-said-the-operator-was-flouting-norms-523026
[s16]: https://adani.com/businesses/agri-logistics
[s17]: https://thirdworldcentre.org/2014/09/creating-shared-value-how-nestle-succeeded-in-indian-city-of-moga/

// User-adjustable levers. Every module reads these live, so changes apply mid-run.
export interface Policy {
  mspWheatMult: number;
  mspPaddyMult: number;
  maizeAssuredProcurement: boolean;
  diversificationIncentivePerHa: number;   // INR/ha paid for non-paddy kharif crops
  dieselPrice: number | null;              // null = use researched price
  freightRegime: 'open' | 'cartel';
  freightRatePerTkm: number;               // INR per tonne-km base
  tollMult: number;
  arhtiyaCommissionPct: number | null;     // null = researched value
  bankRatePct: number;                     // KCC / formal lending, % per year
  informalRatePct: number;                 // arhtiya / moneylender, % per year
  remittanceMult: number;
  visaSuccessProb: number;                 // per application, after caps
  stubbleFinePerHa: number;
  stubbleEnforcement: number;              // detection probability 0..1
  stubbleSubsidyPerHa: number;             // in-situ management support
  monsoon: number;                         // 1 = normal rainfall, affects yields
  upiPush: number;                         // added to digital adoption 0..0.5
  liftingCapacityMult: number;             // scales state lifting contracts
}

export const defaultPolicy = (): Policy => ({
  mspWheatMult: 1, mspPaddyMult: 1, maizeAssuredProcurement: false, diversificationIncentivePerHa: 0,
  dieselPrice: null, freightRegime: 'open', freightRatePerTkm: 4.8, tollMult: 1,
  arhtiyaCommissionPct: null, bankRatePct: 7, informalRatePct: 18, remittanceMult: 1,
  visaSuccessProb: 0.45, stubbleFinePerHa: 12500, stubbleEnforcement: 0.15, stubbleSubsidyPerHa: 0,
  monsoon: 1, upiPush: 0, liftingCapacityMult: 1,
});

export interface PolicyControl {
  key: keyof Policy; label: string; min?: number; max?: number; step?: number;
  kind: 'range' | 'toggle' | 'select'; options?: string[]; help: string;
}

export const POLICY_CONTROLS: PolicyControl[] = [
  { key: 'mspWheatMult', label: 'Wheat MSP ×', kind: 'range', min: 0.8, max: 1.4, step: 0.01, help: 'Scales the wheat Minimum Support Price.' },
  { key: 'mspPaddyMult', label: 'Paddy MSP ×', kind: 'range', min: 0.8, max: 1.4, step: 0.01, help: 'Scales the paddy MSP. Drives kharif crop choice.' },
  { key: 'maizeAssuredProcurement', label: 'Assured maize procurement at MSP', kind: 'toggle', help: 'Diversification policy: the state buys maize at MSP like paddy.' },
  { key: 'diversificationIncentivePerHa', label: 'Diversification incentive ₹/ha', kind: 'range', min: 0, max: 40000, step: 1000, help: 'Cash per hectare moved out of paddy.' },
  { key: 'dieselPrice', label: 'Diesel ₹/L', kind: 'range', min: 60, max: 130, step: 1, help: 'Feeds truck operating costs and farm machinery.' },
  { key: 'freightRegime', label: 'Truck freight regime', kind: 'select', options: ['open', 'cartel'], help: 'Cartel: truck-union rate card +55% (industry estimate), jobs allotted by turn. Open: nearest truck, rates float with demand.' },
  { key: 'freightRatePerTkm', label: 'Base freight ₹/tonne-km', kind: 'range', min: 1.5, max: 6, step: 0.1, help: 'Base road freight rate.' },
  { key: 'tollMult', label: 'Toll ×', kind: 'range', min: 0, max: 2, step: 0.1, help: 'Scales heavy-vehicle toll charges.' },
  { key: 'arhtiyaCommissionPct', label: 'Arhtiya commission %', kind: 'range', min: 0, max: 3, step: 0.1, help: 'Commission paid to commission agents on procured grain.' },
  { key: 'bankRatePct', label: 'Bank / KCC rate %', kind: 'range', min: 4, max: 14, step: 0.5, help: 'Formal lending rate.' },
  { key: 'informalRatePct', label: 'Informal lending rate %', kind: 'range', min: 10, max: 36, step: 1, help: 'Arhtiya and moneylender rate.' },
  { key: 'remittanceMult', label: 'Remittances ×', kind: 'range', min: 0.3, max: 1.5, step: 0.05, help: 'Shock to NRI remittance inflows.' },
  { key: 'visaSuccessProb', label: 'Study-visa success rate', kind: 'range', min: 0.05, max: 0.9, step: 0.05, help: 'Lower it to model student permit caps abroad.' },
  { key: 'stubbleFinePerHa', label: 'Stubble burning fine ₹/ha', kind: 'range', min: 0, max: 50000, step: 500, help: 'Environmental compensation per hectare burned.' },
  { key: 'stubbleEnforcement', label: 'Burning detection rate', kind: 'range', min: 0, max: 1, step: 0.05, help: 'Probability a fire is detected and fined.' },
  { key: 'stubbleSubsidyPerHa', label: 'Crop-residue support ₹/ha', kind: 'range', min: 0, max: 10000, step: 250, help: 'Cash support per hectare for not burning.' },
  { key: 'monsoon', label: 'Monsoon / weather', kind: 'range', min: 0.5, max: 1.2, step: 0.05, help: '1 = normal. Below 0.8 approximates drought or flood damage.' },
  { key: 'upiPush', label: 'Digital payments push', kind: 'range', min: 0, max: 0.5, step: 0.05, help: 'Raises every agent\'s digital adoption.' },
  { key: 'liftingCapacityMult', label: 'Grain lifting capacity ×', kind: 'range', min: 0.3, max: 2, step: 0.1, help: 'How many trucks the state contracts for mandi lifting.' },
];

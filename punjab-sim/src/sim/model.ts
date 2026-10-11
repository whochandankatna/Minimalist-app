// Agent and world state types shared by all simulation modules.
import type { ConsumptionCategory, Profile, Sector, TraitKey } from '../data/types';
import type { Route } from './roads';

export type Region = 'moga' | 'chandigarh';

/** Behavioural archetype a researched sector maps onto. */
export type Archetype =
  | 'arhtiya' | 'rice_mill' | 'flour_mill' | 'input_dealer' | 'retail_grocery' | 'retail_cloth'
  | 'retail_electronics' | 'jeweller' | 'education' | 'immigration' | 'health' | 'fuel'
  | 'transporter' | 'food_service' | 'auto_dealer' | 'it_services' | 'real_estate' | 'events'
  | 'finance' | 'dairy' | 'hospitality' | 'manufacturing' | 'wholesale' | 'ecommerce' | 'cold_store'
  | 'repair' | 'other';

const RULES: [RegExp, Archetype][] = [
  [/arhti|commission agent|aadhti/i, 'arhtiya'],
  [/rice|sheller|paddy mill/i, 'rice_mill'],
  [/flour|atta|chakki/i, 'flour_mill'],
  [/cold stor/i, 'cold_store'],
  [/seed|fertili|pesticide|agro.?input|agri.?input/i, 'input_dealer'],
  [/ielts|immigra|visa|study abroad|travel agen/i, 'immigration'],
  [/school|coaching|college|universit|education|tuition/i, 'education'],
  [/kiryana|kirana|grocery|provision|general store|supermarket/i, 'retail_grocery'],
  [/cloth|apparel|garment|textile|hosiery|boutique|tailor/i, 'retail_cloth'],
  [/mobile|electronic|appliance/i, 'retail_electronics'],
  [/jewel|gold|sarraf/i, 'jeweller'],
  [/hospital|clinic|pharma|chemist|diagnostic|health|medical/i, 'health'],
  [/petrol|fuel|diesel|filling/i, 'fuel'],
  [/truck|transport|logistic|freight|courier/i, 'transporter'],
  [/restaurant|cafe|dhaba|food|sweet|bakery|halwai/i, 'food_service'],
  [/tractor|auto|vehicle|car dealer|two.?wheeler|implement|machinery dealer/i, 'auto_dealer'],
  [/repair|workshop|mechanic|service centre/i, 'repair'],
  [/\bit\b|ites|software|bpo|tech|it\/|it park/i, 'it_services'],
  [/real estate|construction|brick|builder|cement|hardware|property/i, 'real_estate'],
  [/banquet|wedding|marriage|palace|tent|event|dj/i, 'events'],
  [/bank|cooperative|co-operative|mfi|microfinance|nbfc|moneylend|finance|insurance/i, 'finance'],
  [/dairy|milk|chilling|nestl|verka/i, 'dairy'],
  [/hotel|hospitality|guest house|resort/i, 'hospitality'],
  [/e-?commerce|delivery|quick.?commerce|online/i, 'ecommerce'],
  [/wholesale|distribut|stockist/i, 'wholesale'],
  [/manufactur|industr|factory|forging|steel|engineering|auto part|cycle/i, 'manufacturing'],
];

export function classifySector(s: Sector): Archetype {
  const text = `${s.id} ${s.name}`;
  for (const [re, a] of RULES) if (re.test(text)) return a;
  return 'other';
}

/** Which archetypes a household visits for each consumption category, in preference order. */
export const CATEGORY_SHOPS: Record<ConsumptionCategory, Archetype[]> = {
  food: ['retail_grocery', 'food_service', 'ecommerce'],
  fuel_light: ['fuel', 'retail_grocery'],
  clothing: ['retail_cloth', 'ecommerce'],
  education: ['education', 'immigration'],
  health: ['health'],
  transport: ['fuel', 'auto_dealer', 'repair'],
  durables: ['retail_electronics', 'auto_dealer', 'ecommerce'],
  ceremonies: ['jeweller', 'events', 'retail_cloth'],
  housing: ['real_estate'],
  other: ['food_service', 'hospitality', 'retail_grocery', 'other'],
};

/** Share of revenue that is purchased goods (restocked via trucks) by archetype. */
export const GOODS_SHARE: Partial<Record<Archetype, number>> = {
  retail_grocery: 0.85, retail_cloth: 0.7, retail_electronics: 0.88, jeweller: 0.85, fuel: 0.95,
  auto_dealer: 0.9, input_dealer: 0.88, ecommerce: 0.8, food_service: 0.4, health: 0.45, real_estate: 0.5,
  wholesale: 0.9, manufacturing: 0.6,
};

/** Wage bill as share of revenue. */
export const WAGE_SHARE: Partial<Record<Archetype, number>> = {
  education: 0.5, immigration: 0.3, health: 0.3, it_services: 0.55, food_service: 0.25, hospitality: 0.3,
  events: 0.25, real_estate: 0.25, finance: 0.3, manufacturing: 0.15, transporter: 0.2, repair: 0.4,
};

export type Traits = Record<TraitKey, number>;

export const DEFAULT_TRAITS: Traits = {
  riskAversion: 0.6, timePreference: 0.5, priceSensitivity: 0.6, socialConformity: 0.6, statusConsumption: 0.5,
  brandLoyalty: 0.5, digitalAdoption: 0.5, creditAppetite: 0.5, trustInInstitutions: 0.5,
  migrationAspiration: 0.4, religiosity: 0.6, lossAversion: 2.0,
};

export interface Decision { day: number; kind: string; text: string }

export interface Farm {
  ha: number;
  villageId: string;
  mandiId: string;
  crop: string | null;          // currently in the ground
  sownDay: number;
  harvestDay: number;
  stock: { crop: string; qtl: number; heldSince: number } | null;
  lastKharif: string; lastRabi: string;
  animals: number;
  milkLpd: number;
  dairyBuyer: string;
  stubble: 'none' | 'standing' | 'burned' | 'managed';
}

export type MigrationStage = 'none' | 'ielts' | 'applied' | 'abroad';

export interface Household {
  id: number;
  profile: Profile;
  region: Region;
  placeId: string;
  x: number; z: number;
  weight: number;               // real households this agent represents
  traits: Traits;
  expectedIncome: number;       // INR / month (per household)
  wageIncomeExpected: number;   // part of expectedIncome from wages
  salaryExpected: number;
  remitExpected: number;
  businessIncomeExpected: number;
  cash: number;                 // per household
  debtBank: number; debtArhtiya: number; udhaar: number;
  arhtiyaId: number | null;
  loyalty: Partial<Record<Archetype, number>>;
  farm: Farm | null;
  sentiment: number;            // 0..1
  incomeMonth: number; spendMonth: number; incomeLastMonth: number; spendLastMonth: number;
  migration: MigrationStage; migrationTimer: number; membersAbroad: number;
  weddingPlannedDay: number | null;
  log: Decision[];
  custom: boolean;
}

export interface Business {
  id: number;
  sector: Sector;
  archetype: Archetype;
  name: string;
  region: Region;
  placeId: string;
  x: number; z: number;
  weight: number;               // real firms represented
  cash: number;                 // aggregate across represented firms
  inventory: number;            // INR at cost
  inventoryTarget: number;
  priceIndex: number;           // 1 = typical market price
  baseDailyRevenue: number;     // aggregate expected revenue/day
  revenueDay: number; revenueMonth: number; revenueLastMonth: number;
  costMonth: number; profitLastMonth: number;
  customersDay: number;
  receivables: number;          // udhaar owed by households
  loanBook: number;             // arhtiya / finance lending
  grainQtl: number;             // rice mills & arhtiyas
  restockPending: boolean;
  supplierPlace: string;
  history: number[];            // monthly revenue
  log: Decision[];
}

export type Commodity = 'wheat' | 'paddy' | 'rice' | 'milk' | 'fmcg' | 'goods' | 'fertilizer' | 'basmati' | 'maize' | 'potato' | 'other';

export interface Job {
  id: number;
  from: string; to: string;
  commodity: Commodity;
  tonnes: number;
  pay: number;                  // aggregate INR for the whole job
  createdDay: number;
  payerKind: 'biz' | 'gov' | 'ext'; payerId: number;
  onDeliver?: (w: unknown) => void;
  takenBy: number | null;
}

export type TruckState = 'idle' | 'toPickup' | 'loading' | 'loaded' | 'unloading' | 'returning';

export interface Truck {
  id: number;
  typeId: string; typeName: string;
  payload: number; kmpl: number;
  ownerBizId: number | null;
  home: string;
  at: string;                   // current place when stationary
  state: TruckState;
  route: Route | null; d: number; timer: number;
  job: Job | null;
  x: number; z: number; heading: number;
  color: number;
  kmMonth: number; earnMonth: number; fuelMonth: number; tollMonth: number;
  kmTotal: number; earnTotal: number; tripsTotal: number;
  idleHours: number; busyHours: number;
}

export interface Flow { x0: number; z0: number; x1: number; z1: number; kind: string; amount: number; t0: number }

export interface TrainRun { route: Route; d: number; tonnes: number; commodity: Commodity }

export interface WorldEvent { day: number; text: string; kind: 'info' | 'warn' | 'policy' | 'market' }

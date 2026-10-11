// Shapes of the research JSON files in src/data/. Research agents fill these from
// public sources; every field is optional-tolerant because the loader normalizes.

export interface Source { id: string; title: string; url?: string }
export interface Meta { compiledOn?: string; notes?: string; sources?: Source[]; [k: string]: unknown }

export type PlaceType =
  | 'city' | 'town' | 'village_cluster' | 'mandi' | 'industrial' | 'plant'
  | 'godown' | 'railhead' | 'dairy' | 'education';

export interface Place {
  id: string; name: string; type: PlaceType; lat: number; lon: number;
  population?: number | null; district?: string; notes?: string; sourceIds?: string[];
}
export interface TollPlaza { name: string; lat: number; lon: number }
export interface Highway {
  id: string; name: string; lanes?: number; waypoints: [number, number][];
  tollPlazas?: TollPlaza[]; notes?: string; sourceIds?: string[];
}
export interface Railway { id: string; name: string; waypoints: [number, number][] }
export interface Geography { meta?: Meta; places: Place[]; highways: Highway[]; railways?: Railway[] }

export interface Crop {
  id: string; name: string; season: 'rabi' | 'kharif' | 'annual' | 'zaid' | string;
  sowMonth: number; harvestMonth: number; growDays?: number;
  yieldQtlPerHa: number | null;
  msp?: { year?: string; inrPerQtl: number | null } | null;
  privatePriceInrPerQtl?: number | null;
  inputCostInrPerHa?: { total?: number | null; [k: string]: number | null | undefined } | null;
  mogaAreaHa?: number | null; procurementShare?: number | null; strawUse?: string; sourceIds?: string[];
}
export interface Agriculture {
  meta?: Meta;
  crops: Crop[];
  dairy?: {
    milkLitresPerAnimalPerDay?: Record<string, number | null>;
    procurementPriceInrPerLitre?: Record<string, number | string | null>;
    buyers?: { id: string; name: string; shareOfMarketedMilkMoga?: number | null; share?: number | null; notes?: string }[];
    feedCostInrPerAnimalPerDay?: number | null;
    avgHerdSmallFarm?: number | null;
    [k: string]: unknown;
  };
  mandiSystem?: {
    arhtiyaCommissionPct?: number | null; marketFeePct?: number | null; rdfPct?: number | null;
    paymentDaysTypical?: number | null; [k: string]: unknown;
  };
  landholdings?: {
    categories?: { name: string; shareOfHoldings?: number | null; shareOfArea?: number | null; avgHa?: number | null }[];
    leasingRentInrPerAcrePerYear?: number | null; landPriceInrPerAcre?: number | null; [k: string]: unknown;
  };
  credit?: {
    avgOutstandingDebtPerFarmHouseholdInr?: number | null; institutionalShare?: number | null;
    arhtiyaLendingInterestPctPerYear?: number | null; kccInterestPct?: number | null; [k: string]: unknown;
  };
  calendar?: { month: number; events: string[] }[];
  inputs?: { dieselInrPerLitre?: number | null; [k: string]: unknown };
  [k: string]: unknown;
}

export interface Sector {
  id: string; name: string; region: 'moga' | 'chandigarh' | 'both' | string;
  estimatedCount?: number | null; employeesTypical?: number | null;
  annualRevenueInrTypical?: number | null; grossMarginPct?: number | null;
  buysFrom?: string[]; sellsTo?: string[]; paymentTerms?: string; creditPractice?: string;
  seasonality?: string; informalShare?: number | null; notes?: string; sourceIds?: string[];
}
export interface Businesses { meta?: Meta; sectors: Sector[] }

export interface TruckType {
  id: string; name: string; payloadTonnes: number; kmPerLitreLoaded?: number | null;
  capexInr?: number | null; driverWageInrPerMonth?: number | null; share?: number | null;
}
export interface Logistics {
  meta?: Meta;
  fuel?: { dieselInrPerLitrePunjab?: number | null; dieselInrPerLitreChandigarh?: number | null; [k: string]: unknown };
  truckTypes?: TruckType[];
  freightRates?: { lane: string; km?: number | null; inrPerTonne?: number | null; inrPerTripFullTruck?: number | null; basis?: string }[];
  tolls?: { plaza: string; highway?: string; inrPerTripHeavy?: number | null }[];
  flows?: { from: string; to: string; commodity: string; mode?: string; tonnesPerYear?: number | null; season?: string; notes?: string }[];
  unionDynamics?: string;
  [k: string]: unknown;
}

export type TraitKey =
  | 'riskAversion' | 'timePreference' | 'priceSensitivity' | 'socialConformity' | 'statusConsumption'
  | 'brandLoyalty' | 'digitalAdoption' | 'creditAppetite' | 'trustInInstitutions'
  | 'migrationAspiration' | 'religiosity' | 'lossAversion';

export type ConsumptionCategory =
  | 'food' | 'fuel_light' | 'clothing' | 'education' | 'health' | 'transport'
  | 'durables' | 'ceremonies' | 'housing' | 'other';

export interface Profile {
  id: string; name: string; region: 'moga' | 'chandigarh' | string; shareOfHouseholds: number;
  monthlyIncomeInr: { min: number; median: number; max: number };
  incomeSources: Record<string, number>;
  traits: Partial<Record<TraitKey, number>>;
  savingsRate?: number;
  consumptionShares: Partial<Record<ConsumptionCategory, number>>;
  paymentMix: Record<string, number>;
  shopsAt?: string[]; decisionRules?: string[]; triggers?: string[]; sourceIds?: string[];
}
export interface Psychographics { meta?: Meta; profiles: Profile[] }

export interface Dataset {
  geography: Geography;
  agriculture: Agriculture;
  businesses: Businesses;
  logistics: Logistics;
  psychographics: Psychographics;
  /** which files came from research (true) vs built-in fallback seed (false) */
  provenance: Record<keyof Omit<Dataset, 'provenance'>, boolean>;
}

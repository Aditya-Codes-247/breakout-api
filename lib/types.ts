export interface BreakoutCandidate {
  symbol: string;
  name: string;
  currentPrice: number;
  marketCap: number;
  pe: number;
  roe: number;
  roce: number;
  brs: number;
  signals: {
    earningsInflection: boolean;
    opmExpanding: boolean;
    debtDeclining: boolean;
    positiveCashFlow: boolean;
    roceInflecting: boolean;
    promoterStable: boolean;
    institutionalEntry: boolean;
    priceMismatch: boolean;
  };
  metrics: {
    patGrowthLatestQ: number;
    patGrowthPrevQ: number;
    opmLatest: number;
    opmPrev: number;
    debtToEquity: number;
    debtToEquityPrevYear: number;
    operatingCashFlow: number;
    roce3yr: number[];
    promoterHoldingChange: number;
    mfCountChange: number;
    fiiChange: number;
    earningsGrowth3yr: number;
    priceReturn1yr: number;
    mismatchScore: number;
  };
  screenerUrl: string;
  tvSymbol: string;
  fetchedAt: string;
}

export interface ScanResult {
  candidates: BreakoutCandidate[];
  totalScanned: number;
  totalPassed: number;
  scanDurationMs: number;
  fetchedAt: string;
  stages: {
    afterStage1: number;
    afterStage2: number;
    afterStage3: number;
    afterStage4: number;
    afterStage5: number;
    afterStage6: number;
  };
}

export interface ParsedFinancials {
  quarterLabels: string[];
  revenueByQ: number[];
  patByQ: number[];
  opmByQ: number[];
  yearLabels: string[];
  revenueByYear: number[];
  patByYear: number[];
  debtToEquityByYear: number[];
  operatingCFByYear: number[];
  roceByYear: number[];
  roeByYear: number[];
  promoterByQ: number[];
  fiiByQ: number[];
  diiByQ: number[];
  mfCountByQ: number[];
}

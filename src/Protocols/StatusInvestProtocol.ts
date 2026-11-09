export type Pause = (ms: number) => Promise<void>;

export type FiiRentField = "receitalaluguel" | "receitavendaimovel" | "receitaoutras" | "receitatotal";

export type FiiExpenseField
  = "rendimentosdistribuir"
    | "taxaadministracao"
    | "taxaperformance"
    | "aquisicoesimoveis"
    | "outrasdespesas"
    | "totaldespesas";

export type FiiCashField
  = "totalnecessidadeliquidez"
    | "disponibilidades"
    | "titulospublicos"
    | "titulosprivados"
    | "fundosrendafixa";

export type FiiNetWorthField = "value";

export type FundCategory = "fundamentals" | "fund_data";

export type StatusInvestKey = {
  market: string;
  ticker: string;
  asset_type: string;
};

export type KeyColumn = "market" | "ticker" | "asset_type" | "period" | "source" | "version" | "source_file";

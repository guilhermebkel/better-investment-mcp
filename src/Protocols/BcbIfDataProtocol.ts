export type IfDataAccount = {
  account: string;
  metric: string;
};

export type IfDataValue = {
  codInst: string;
  saldo: number | null;
};

export type IfDataQuarterEndMonth = "03" | "06" | "09" | "12";

export type IfDataQuarterPeriod = {
  reference_time_start: string;
  reference_time_end: string;
};

export type PdfTable = {
  page: number;
  rows: string[][];
};

export type PdfToolsPort = {
  runOcr(bytes: Uint8Array): Promise<Uint8Array>;
  findTables(bytes: Uint8Array): Promise<PdfTable[]>;
};

export type PdfToolsOptions = {
  python?: string;
  ocrmypdf?: string;
};

export type RunResult = {
  stdout: Buffer;
  stderr: string;
};

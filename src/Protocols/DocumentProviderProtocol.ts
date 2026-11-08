export type DocumentProvider = {
  category: "documents";
  vendor: string;
  markets: readonly string[];
  assetTypes: readonly string[];
  fetchDocument(url: string): Promise<Uint8Array>;
};

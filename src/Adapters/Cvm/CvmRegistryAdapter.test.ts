import { copyFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CvmRegistryAdapter } from "@/Adapters/Cvm/CvmRegistryAdapter.ts";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";

const FIXTURE = join(import.meta.dirname, "..", "..", "Testing", "fixtures", "cvm-registry", "cad_cia_aberta-sample.csv");
const PETROBRAS_CNPJ = "33.000.167/0001-01";
const NOT_USED = "not used";

const buildHttp = (): HttpPort => ({
  getText: () => Promise.reject(new Error(NOT_USED)),
  getBytes: () => Promise.reject(new Error(NOT_USED)),
  postForm: () => Promise.reject(new Error(NOT_USED)),
  getCookies: () => Promise.reject(new Error(NOT_USED)),
  downloadToFile: (_url: string, filePath: string) => {
    copyFileSync(FIXTURE, filePath);
    return Promise.resolve(1);
  },
});

describe("CvmRegistryAdapter.fetchTables()", () => {
  it("writes the registry of a stock from CVM's company file, found by its CNPJ", async () => {
    const adapter = new CvmRegistryAdapter(buildHttp(), () => Promise.resolve(PETROBRAS_CNPJ));

    const result = await adapter.fetchTables({ market: "BR", ticker: "PETR4", assetType: "stock" });

    expect(result.tables.company_registry).toStrictEqual([{
      market: "BR", ticker: "PETR4", asset_type: "stock", legal_id: PETROBRAS_CNPJ,
      company_name: "PETRÓLEO BRASILEIRO S.A. - PETROBRAS", trade_name: "PETROBRAS",
      sector: "Petróleo e Gás", situation: "ATIVO", cvm_code: "9512", source: "cvm",
    }]);
  });

  it("reports a ticker with no CNPJ as unmapped, and writes nothing", async () => {
    const adapter = new CvmRegistryAdapter(buildHttp(), () => Promise.resolve(undefined));

    await expect(adapter.fetchTables({ market: "BR", ticker: "XPTO3", assetType: "stock" })).rejects.toThrow("unmapped: BR:XPTO3 is pending");
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CvmTickerAdapter } from "@/Adapters/Cvm/CvmTickerAdapter.ts";
import { HttpFailureError } from "@/Errors/HttpFailureError.ts";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";
import { FakeHttp } from "@/Testing/FakeHttp.ts";
import { ZipFixture } from "@/Testing/ZipFixture.ts";

const FIXTURES = join(import.meta.dirname, "..", "..", "Testing", "fixtures", "cvm");
const COMPANY_LIST = readFileSync(join(FIXTURES, "recorded-fca-valor-mobiliario-2025-sample.csv"), "latin1");
const FCA_2025 = "https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/FCA/DADOS/fca_cia_aberta_2025.zip";
const FCA_2024 = "https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/FCA/DADOS/fca_cia_aberta_2024.zip";
const CURRENT_YEAR = 2025;
const PETROBRAS = "33.000.167/0001-01";
const VALE = "33.592.510/0001-54";
const IRDM_FUND = "28.830.325/0001-10";

const buildCompanyZip = (): Uint8Array => ZipFixture.buildZipOf({ "fca_cia_aberta_valor_mobiliario_2025.csv": COMPANY_LIST });

const buildAdapter = (http: HttpPort): CvmTickerAdapter => new CvmTickerAdapter(http, "https://dados.cvm.gov.br", () => CURRENT_YEAR);

describe("CvmTickerAdapter.resolveCnpj()", () => {
  it("maps a stock ticker to its company CNPJ from the company list (S5)", async () => {
    const { http } = FakeHttp.buildServing({ [FCA_2025]: buildCompanyZip() });
    await expect(buildAdapter(http).resolveCnpj("BR", "PETR4")).resolves.toBe(PETROBRAS);
    await expect(buildAdapter(http).resolveCnpj("BR", "VALE3")).resolves.toBe(VALE);
  });

  it("maps a fund ticker from the fund list, with no company list read (S5)", async () => {
    const { http, urls } = FakeHttp.buildServing({});
    await expect(buildAdapter(http).resolveCnpj("BR", "IRDM11")).resolves.toBe(IRDM_FUND);
    expect(urls).toStrictEqual([]);
  });

  it("gives no CNPJ for a ticker that no list holds, so the answer can name it as pending (AC8)", async () => {
    const { http } = FakeHttp.buildServing({ [FCA_2025]: buildCompanyZip() });
    await expect(buildAdapter(http).resolveCnpj("BR", "ZZZZ3")).resolves.toBeUndefined();
  });

  it("gives no CNPJ for a market this list does not serve, and reads nothing", async () => {
    const { http, urls } = FakeHttp.buildServing({ [FCA_2025]: buildCompanyZip() });
    await expect(buildAdapter(http).resolveCnpj("US", "PETR4")).resolves.toBeUndefined();
    expect(urls).toStrictEqual([]);
  });

  it("reads the company list once for many lookups, and reads the year before it too", async () => {
    const { http, urls } = FakeHttp.buildServing({ [FCA_2025]: buildCompanyZip() });
    const adapter = buildAdapter(http);
    await adapter.resolveCnpj("BR", "PETR4");
    await adapter.resolveCnpj("BR", "VALE3");
    expect(urls).toStrictEqual([FCA_2025, FCA_2024]);
  });

  it("does not keep a company list that failed to read, so the next lookup reads it again", async () => {
    let calls = 0;
    const http: HttpPort = {
      getText: () => Promise.reject(new Error("not used")),
      postForm: () => Promise.reject(new Error("not used")),
      getCookies: () => Promise.reject(new Error("not used")),
      getBytes: (url: string) => {
        if (url === FCA_2024) {
          return Promise.reject(new HttpFailureError("the vendor answered with status 404", 404));
        }
        calls += 1;
        return calls === 1
          ? Promise.reject(new HttpFailureError("the vendor answered with status 500", 500))
          : Promise.resolve(buildCompanyZip());
      },
    };
    const adapter = buildAdapter(http);
    await expect(adapter.resolveCnpj("BR", "PETR4")).rejects.toThrow("HTTP error");
    await expect(adapter.resolveCnpj("BR", "PETR4")).resolves.toBe(PETROBRAS);
  });
});

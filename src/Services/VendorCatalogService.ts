import { B3ListingAdapter } from "@/Adapters/B3/B3ListingAdapter.ts";
import { B3CotahistAdapter } from "@/Adapters/B3/B3CotahistAdapter.ts";
import { BcbAdapter } from "@/Adapters/Bcb/BcbAdapter.ts";
import { BcbFocusAdapter } from "@/Adapters/Bcb/BcbFocusAdapter.ts";
import { CvmAdapter } from "@/Adapters/Cvm/CvmAdapter.ts";
import { CvmDocumentAdapter } from "@/Adapters/Cvm/CvmDocumentAdapter.ts";
import { CvmFundMonthlyAdapter } from "@/Adapters/Cvm/CvmFundMonthlyAdapter.ts";
import { CvmFundAdapter } from "@/Adapters/Cvm/CvmFundAdapter.ts";
import { CvmRegistryAdapter } from "@/Adapters/Cvm/CvmRegistryAdapter.ts";
import { BcbPtaxAdapter } from "@/Adapters/Bcb/BcbPtaxAdapter.ts";
import { CvmStatementAdapter } from "@/Adapters/Cvm/CvmStatementAdapter.ts";
import { CvmTickerAdapter } from "@/Adapters/Cvm/CvmTickerAdapter.ts";
import { HttpAdapter } from "@/Adapters/Http/HttpAdapter.ts";
import { StatusInvestAdapter } from "@/Adapters/StatusInvest/StatusInvestAdapter.ts";
import { TesouroAdapter } from "@/Adapters/Tesouro/TesouroAdapter.ts";
import { YahooAdapter } from "@/Adapters/Yahoo/YahooAdapter.ts";
import { YfinanceAdapter } from "@/Adapters/Yfinance/YfinanceAdapter.ts";
import type { CategoryToVendors } from "@/Protocols/ProviderProtocol.ts";
import { ProviderRegistryService } from "@/Services/ProviderRegistryService.ts";

const CVM_FILE_TIMEOUT_MS = 120_000;

export class VendorCatalogService {
  static build(): CategoryToVendors {
    // Why: the adapters are built here, in a service, because the entry points in src/Setup/ never import an adapter.
    const yahooHttp = new HttpAdapter({ allowedHosts: YahooAdapter.HOSTS, headers: YahooAdapter.HEADERS });
    const bcbHttp = new HttpAdapter({ allowedHosts: [BcbAdapter.HOST] });
    const cvmHttp = new HttpAdapter({
      allowedHosts: [CvmAdapter.HOST],
      maxBytes: CvmAdapter.MAX_FILE_BYTES,
      timeoutMs: CVM_FILE_TIMEOUT_MS,
    });
    const cvmDocumentHttp = new HttpAdapter({
      allowedHosts: CvmDocumentAdapter.HOSTS,
      maxBytes: CvmDocumentAdapter.MAX_DOCUMENT_BYTES,
      timeoutMs: CvmDocumentAdapter.TIMEOUT_MS,
    });
    const statusInvestHttp = new HttpAdapter({ allowedHosts: [StatusInvestAdapter.HOST] });
    const tesouroHttp = new HttpAdapter({
      allowedHosts: [TesouroAdapter.HOST],
      maxBytes: TesouroAdapter.MAX_FILE_BYTES,
      timeoutMs: TesouroAdapter.TIMEOUT_MS,
    });
    const focusHttp = new HttpAdapter({
      allowedHosts: [BcbFocusAdapter.HOST],
      maxBytes: BcbFocusAdapter.MAX_RESPONSE_BYTES,
      timeoutMs: BcbFocusAdapter.TIMEOUT_MS,
    });
    // Why: one ticker-to-CNPJ lookup serves every CVM adapter, so the company list is read once for all of them.
    const b3Http = new HttpAdapter({ allowedHosts: [B3ListingAdapter.HOST] });
    const b3Listing = new B3ListingAdapter(b3Http);
    const b3CotahistHttp = new HttpAdapter({
      allowedHosts: [B3CotahistAdapter.HOST],
      maxBytes: B3CotahistAdapter.MAX_FILE_BYTES,
      timeoutMs: B3CotahistAdapter.TIMEOUT_MS,
    });
    const findFundCnpj = async (ticker: string): Promise<string | undefined> => {
      return (await b3Listing.findFund(ticker))?.legalId;
    };
    const cvmTicker = new CvmTickerAdapter(cvmHttp, CvmAdapter.BASE_URL, undefined, findFundCnpj);
    return {
      ...ProviderRegistryService.buildEmptyCatalog(),
      quotes: {
        yahoo: new YahooAdapter("quotes", yahooHttp),
        yfinance: new YfinanceAdapter("quotes"),
        b3: new B3CotahistAdapter(b3CotahistHttp),
      },
      dividends: { yahoo: new YahooAdapter("dividends", yahooHttp), yfinance: new YfinanceAdapter("dividends") },
      fundamentals: { statusinvest: new StatusInvestAdapter("fundamentals", statusInvestHttp) },
      fund_data: {
        statusinvest: new StatusInvestAdapter("fund_data", statusInvestHttp),
        cvm: new CvmFundMonthlyAdapter(cvmHttp, cvmTicker.resolveCnpj),
      },
      filings: { cvm: new CvmAdapter(cvmHttp, cvmTicker.resolveCnpj) },
      statements: { cvm: new CvmStatementAdapter(cvmHttp, cvmTicker.resolveCnpj) },
      documents: { cvm: new CvmDocumentAdapter(cvmDocumentHttp) },
      macro: { bcb: new BcbAdapter(bcbHttp) },
      treasury: { tesouro: new TesouroAdapter(tesouroHttp) },
      expectations: { bcb: new BcbFocusAdapter(focusHttp) },
      identifiers: { b3: b3Listing },
      registry: { cvm: new CvmRegistryAdapter(cvmHttp, cvmTicker.resolveCnpj) },
      fx: { bcb: new BcbPtaxAdapter(focusHttp) },
      fund: { cvm: new CvmFundAdapter(cvmHttp) },
    };
  }
}

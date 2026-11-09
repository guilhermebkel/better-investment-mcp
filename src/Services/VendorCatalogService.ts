import { BcbAdapter } from "@/Adapters/Bcb/BcbAdapter.ts";
import { BcbFocusAdapter } from "@/Adapters/Bcb/BcbFocusAdapter.ts";
import { CvmAdapter } from "@/Adapters/Cvm/CvmAdapter.ts";
import { CvmDocumentAdapter } from "@/Adapters/Cvm/CvmDocumentAdapter.ts";
import { CvmFundMonthlyAdapter } from "@/Adapters/Cvm/CvmFundMonthlyAdapter.ts";
import { CvmStatementAdapter } from "@/Adapters/Cvm/CvmStatementAdapter.ts";
import { CvmTickerAdapter } from "@/Adapters/Cvm/CvmTickerAdapter.ts";
import { HttpAdapter } from "@/Adapters/Http/HttpAdapter.ts";
import { StatusInvestAdapter } from "@/Adapters/StatusInvest/StatusInvestAdapter.ts";
import { TesouroAdapter } from "@/Adapters/Tesouro/TesouroAdapter.ts";
import { YahooAdapter } from "@/Adapters/Yahoo/YahooAdapter.ts";
import type { CategoryToVendors } from "@/Protocols/ProviderProtocol.ts";
import { ProviderRegistryService } from "@/Services/ProviderRegistryService.ts";

export class VendorCatalogService {
  static build(): CategoryToVendors {
    // Why: the adapters are built here, in a service, because the entry points in src/Setup/ never import an adapter.
    const yahooHttp = new HttpAdapter({ allowedHosts: YahooAdapter.HOSTS, headers: YahooAdapter.HEADERS });
    const bcbHttp = new HttpAdapter({ allowedHosts: [BcbAdapter.HOST] });
    const cvmHttp = new HttpAdapter({ allowedHosts: [CvmAdapter.HOST], maxBytes: CvmAdapter.MAX_FILE_BYTES });
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
    const cvmTicker = new CvmTickerAdapter(cvmHttp);
    return {
      ...ProviderRegistryService.buildEmptyCatalog(),
      quotes: { yahoo: new YahooAdapter("quotes", yahooHttp) },
      dividends: { yahoo: new YahooAdapter("dividends", yahooHttp) },
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
    };
  }
}

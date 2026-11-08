import { BcbAdapter } from "@/Adapters/Bcb/BcbAdapter.ts";
import { CvmAdapter } from "@/Adapters/Cvm/CvmAdapter.ts";
import { CvmDocumentAdapter } from "@/Adapters/Cvm/CvmDocumentAdapter.ts";
import { HttpAdapter } from "@/Adapters/Http/HttpAdapter.ts";
import { StatusInvestAdapter } from "@/Adapters/StatusInvest/StatusInvestAdapter.ts";
import { YahooAdapter } from "@/Adapters/Yahoo/YahooAdapter.ts";
import type { LegalIdLookup } from "@/Protocols/CvmProtocol.ts";
import type { CategoryToVendors } from "@/Protocols/ProviderProtocol.ts";
import { ProviderRegistryService } from "@/Services/ProviderRegistryService.ts";

export class VendorCatalogService {
  static build(): CategoryToVendors {
    // Why: the adapters are built here, in a service, because the entry points in src/Setup/ never import an adapter.
    const yahooHttp = new HttpAdapter({ allowedHosts: YahooAdapter.HOSTS, headers: YahooAdapter.HEADERS });
    const bcbHttp = new HttpAdapter({ allowedHosts: [BcbAdapter.HOST] });
    const cvmHttp = new HttpAdapter({ allowedHosts: [CvmAdapter.HOST], maxBytes: CvmAdapter.MAX_YEAR_FILE_BYTES });
    const cvmDocumentHttp = new HttpAdapter({
      allowedHosts: [CvmDocumentAdapter.HOST],
      maxBytes: CvmDocumentAdapter.MAX_DOCUMENT_BYTES,
      timeoutMs: CvmDocumentAdapter.TIMEOUT_MS,
    });
    const statusInvestHttp = new HttpAdapter({ allowedHosts: [StatusInvestAdapter.HOST] });
    return {
      ...ProviderRegistryService.buildEmptyCatalog(),
      quotes: { yahoo: new YahooAdapter("quotes", yahooHttp) },
      dividends: { yahoo: new YahooAdapter("dividends", yahooHttp) },
      fundamentals: { statusinvest: new StatusInvestAdapter("fundamentals", statusInvestHttp) },
      fund_data: { statusinvest: new StatusInvestAdapter("fund_data", statusInvestHttp) },
      filings: { cvm: new CvmAdapter(cvmHttp, VendorCatalogService.resolveNoLegalId) },
      documents: { cvm: new CvmDocumentAdapter(cvmDocumentHttp) },
      macro: { bcb: new BcbAdapter(bcbHttp) },
    };
  }

  private static readonly resolveNoLegalId: LegalIdLookup = () => Promise.resolve(undefined);
}

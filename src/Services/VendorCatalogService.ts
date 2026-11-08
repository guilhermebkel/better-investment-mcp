import { BcbAdapter } from "@/Adapters/Bcb/BcbAdapter.ts";
import { CvmAdapter } from "@/Adapters/Cvm/CvmAdapter.ts";
import { HttpAdapter } from "@/Adapters/Http/HttpAdapter.ts";
import { StatusInvestAdapter } from "@/Adapters/StatusInvest/StatusInvestAdapter.ts";
import { YahooAdapter } from "@/Adapters/Yahoo/YahooAdapter.ts";
import type { LegalIdLookup } from "@/Protocols/CvmProtocol.ts";
import type { CategoryToVendors } from "@/Protocols/ProviderProtocol.ts";
import { ProviderRegistryService } from "@/Services/ProviderRegistryService.ts";

export class VendorCatalogService {
  static build(): CategoryToVendors {
    // Why: the adapters are built here, in a service, because the entry points in src/Setup/ never import an adapter.
    const yahooHttp = new HttpAdapter({ allowedHosts: [YahooAdapter.HOST] });
    const bcbHttp = new HttpAdapter({ allowedHosts: [BcbAdapter.HOST] });
    const cvmHttp = new HttpAdapter({ allowedHosts: [CvmAdapter.HOST], maxBytes: CvmAdapter.MAX_YEAR_FILE_BYTES });
    const statusInvestHttp = new HttpAdapter({ allowedHosts: [StatusInvestAdapter.HOST] });
    return {
      ...ProviderRegistryService.buildEmptyCatalog(),
      quotes: { yahoo: new YahooAdapter("quotes", yahooHttp) },
      dividends: { yahoo: new YahooAdapter("dividends", yahooHttp) },
      fundamentals: { statusinvest: new StatusInvestAdapter("fundamentals", statusInvestHttp) },
      fund_data: { statusinvest: new StatusInvestAdapter("fund_data", statusInvestHttp) },
      filings: { cvm: new CvmAdapter(cvmHttp, VendorCatalogService.resolveNoLegalId) },
      macro: { bcb: new BcbAdapter(bcbHttp) },
    };
  }

  private static readonly resolveNoLegalId: LegalIdLookup = () => Promise.resolve(undefined);
}

import type { LegalIdLookup } from "@/Protocols/CvmProtocol.ts";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";
import type { ProviderRequest, ProviderResult } from "@/Protocols/ProviderProtocol.ts";
import { CvmUtil } from "@/Utils/CvmUtil.ts";

export abstract class CvmBaseAdapter {
  protected readonly http: HttpPort;
  protected readonly lookup: LegalIdLookup;
  protected readonly baseUrl: string;
  protected readonly currentYear: () => number;

  constructor(
    http: HttpPort,
    lookup: LegalIdLookup,
    baseUrl: string = CvmUtil.BASE_URL,
    currentYear: () => number = () => new Date().getUTCFullYear(),
  ) {
    this.http = http;
    this.lookup = lookup;
    this.baseUrl = baseUrl;
    this.currentYear = currentYear;
  }

  fetchTables(request: ProviderRequest): Promise<ProviderResult> {
    return CvmUtil.guardFailure(() => this.collectTables(request));
  }

  protected abstract collectTables(request: ProviderRequest): Promise<ProviderResult>;
}

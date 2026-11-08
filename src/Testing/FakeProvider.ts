import type { CacheCategory } from "@/Protocols/CacheProtocol.ts";
import type { FakeProviderOptions } from "@/Protocols/FakeProviderProtocol.ts";
import type { ProviderPort, ProviderRequest, ProviderResult } from "@/Protocols/ProviderProtocol.ts";

export class FakeProvider<Category extends CacheCategory> implements ProviderPort<Category> {
  readonly category: Category;
  readonly vendor: string;
  readonly markets: readonly string[];
  readonly assetTypes: readonly string[];
  calls = 0;
  private readonly respond: (request: ProviderRequest) => Promise<ProviderResult>;

  constructor(options: FakeProviderOptions<Category>) {
    this.category = options.category;
    this.vendor = options.vendor;
    this.markets = options.markets;
    this.assetTypes = options.assetTypes;
    this.respond = options.respond;
  }

  fetchTables(request: ProviderRequest): Promise<ProviderResult> {
    this.calls += 1;
    return this.respond(request);
  }
}

import type { CacheCategory } from "@/Protocols/CacheProtocol.ts";
import type { ProviderRequest, ProviderResult } from "@/Protocols/ProviderProtocol.ts";

export type FakeProviderOptions<Category extends CacheCategory> = {
  category: Category;
  vendor: string;
  markets: readonly string[];
  assetTypes: readonly string[];
  respond: (request: ProviderRequest) => Promise<ProviderResult>;
};

import type { ProviderPort } from "@/Protocols/ProviderProtocol.ts";

export type IndexMembershipProvider = ProviderPort<"index_membership">;

export type B3Index = "ISEE" | "ICO2" | "GPTW" | "IDVR";

export type B3IndexPortfolio = {
  header: { date: string };
  results: {
    cod: string;
    part: string | null;
  }[] | null;
};

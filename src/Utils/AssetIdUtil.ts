import type { AssetIdParts } from "@/Protocols/AssetIdProtocol.ts";
const ASSET_ID_PATTERN = /^([A-Z]{2,6}):([a-z_]+):([A-Z0-9._/-]+)$/u;
const CODE_INVALID = /[^A-Z0-9._/-]/gu;

export class AssetIdUtil {
  static build(parts: AssetIdParts): string {
    // Why: the id names the asset in every table, so it has one form: market, asset type and code, each separated by a colon.
    return `${parts.market}:${parts.assetType}:${parts.code}`;
  }

  static parse(assetId: string): AssetIdParts | undefined {
    const match = ASSET_ID_PATTERN.exec(assetId);
    if (match === null) {
      return undefined;
    }
    const [, market = "", assetType = "", code = ""] = match;
    return { market, assetType, code };
  }

  static normalizeCode(code: string): string {
    // Why: a code is the publisher's code in upper case; a character outside the allowed set is replaced by an underscore, and the mapping is written in the data map.
    return code.toUpperCase().replace(CODE_INVALID, "_");
  }
}

import { createHash, timingSafeEqual } from "node:crypto";

export class TimingSafeCompareUtil {
  static isSecretMatching(candidate: string, expected: string): boolean {
    // Why: both values are hashed to the same length first, because timingSafeEqual needs equal lengths and must not reveal the secret's length.
    const candidateDigest = TimingSafeCompareUtil.buildSha256Digest(candidate);
    const expectedDigest = TimingSafeCompareUtil.buildSha256Digest(expected);
    return timingSafeEqual(candidateDigest, expectedDigest);
  }

  private static buildSha256Digest(value: string): Buffer {
    return createHash("sha256").update(value, "utf8").digest();
  }
}

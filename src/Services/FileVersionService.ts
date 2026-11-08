import type { DatabasePort } from "@/Protocols/DatabaseProtocol.ts";
import type { ProviderFile } from "@/Protocols/ProviderProtocol.ts";

export class FileVersionService {
  static async record(writer: DatabasePort, files: readonly ProviderFile[], fetchedAt: string): Promise<void> {
    for (const file of files) {
      // Why: a new hash for a known URL makes the new copy current, and the old copy stays on record.
      await writer.run("UPDATE cvm_files SET is_current = FALSE WHERE url = ? AND sha256 <> ?", [file.url, file.sha256]);
      const known = await writer.readRows(
        "SELECT CAST(count(*) AS INTEGER) AS knownCount FROM cvm_files WHERE url = ? AND sha256 = ?",
        [file.url, file.sha256],
      );
      const [row] = known;
      if (Number(row?.knownCount ?? 0) > 0) {
        await writer.run(
          "UPDATE cvm_files SET is_current = TRUE, fetched_at = CAST(? AS TIMESTAMPTZ) WHERE url = ? AND sha256 = ?",
          [fetchedAt, file.url, file.sha256],
        );
      } else {
        await writer.run(
          "INSERT INTO cvm_files (url, dataset, reference_year, sha256, size_bytes, fetched_at, is_current) VALUES (?, ?, ?, ?, ?, CAST(? AS TIMESTAMPTZ), TRUE)",
          [file.url, file.dataset, file.referenceYear, file.sha256, file.sizeBytes, fetchedAt],
        );
      }
    }
  }
}

import type { DatabasePort } from "@/Protocols/DatabaseProtocol.ts";
import type { PortugueseStopWord } from "@/Protocols/FullTextProtocol.ts";

// Why: a short list of the most frequent Portuguese function words; they are not indexed, so they do not raise every score.
const PORTUGUESE_STOP_WORDS: readonly PortugueseStopWord[] = [
  "a", "ao", "aos", "as", "até", "com", "como", "da", "das", "de", "do", "dos", "e", "ela", "elas", "ele", "eles",
  "em", "entre", "era", "essa", "esse", "esta", "este", "eu", "foi", "há", "isso", "isto", "já", "mais", "mas", "me",
  "mesmo", "na", "nas", "no", "nos", "o", "os", "ou", "para", "pela", "pelas", "pelo", "pelos", "por", "qual", "quando",
  "que", "se", "sem", "ser", "seu", "sua", "seus", "suas", "também", "te", "um", "uma", "umas", "uns", "é",
];

export class FullTextIndexService {
  static readonly SEARCH_TABLE = "chunk_search";
  static readonly INDEX_SCHEMA = "fts_main_chunk_search";
  static readonly STOP_WORD_TABLE = "pt_stopwords";
  static readonly MACRO = "search_chunks";
  // Why: the default ignore pattern drops digits, so numbers would not be searchable; this one keeps 0 to 9 (docs/product/search.md).
  static readonly IGNORE_PATTERN = "(\\.|[^a-z0-9])+";

  static async buildIndex(writer: DatabasePort): Promise<void> {
    await writer.loadFullText();
    // Why: the rebuild is one transaction, so a reader sees the index from before it or from after it, never a state without the index; a failed rebuild rolls back to the index that worked.
    await writer.run("BEGIN TRANSACTION");
    try {
      await FullTextIndexService.buildIndexSteps(writer);
      await writer.run("COMMIT");
    } catch (error) {
      await writer.run("ROLLBACK");
      throw error;
    }
  }

  private static async buildIndexSteps(writer: DatabasePort): Promise<void> {
    await writer.run(`DROP TABLE IF EXISTS ${FullTextIndexService.SEARCH_TABLE}`);
    await writer.run(`CREATE TABLE ${FullTextIndexService.SEARCH_TABLE} AS SELECT filing_id || ':' || CAST(seq AS VARCHAR) AS chunk_id, text FROM asset_filing_chunks`);
    await writer.run(`CREATE OR REPLACE TABLE ${FullTextIndexService.STOP_WORD_TABLE} (word VARCHAR)`);
    const values = PORTUGUESE_STOP_WORDS.map((word) => `('${word.replaceAll("'", "''")}')`).join(", ");
    await writer.run(`INSERT INTO ${FullTextIndexService.STOP_WORD_TABLE} VALUES ${values}`);
    await writer.run([
      `PRAGMA create_fts_index('${FullTextIndexService.SEARCH_TABLE}', 'chunk_id', 'text',`,
      `  stemmer = 'portuguese', stopwords = '${FullTextIndexService.STOP_WORD_TABLE}', ignore = '${FullTextIndexService.IGNORE_PATTERN}', overwrite = 1)`,
    ].join(" "));
    await writer.run(FullTextIndexService.buildMacro());
  }

  static buildMacro(): string {
    // Why: the macro's arguments are the filters the SQL guard reads (asset_id, document_type, section) and the search mode; the score is BM25 from the index. Only the text mode exists for now; any other mode returns no rows, and the guard refuses it before the query runs.
    return [
      `CREATE OR REPLACE MACRO ${FullTextIndexService.MACRO}(q_text, q_asset_id, q_document_type, q_section, q_mode) AS TABLE`,
      "SELECT c.asset_id, c.document_type, c.filing_id, c.section, c.item, c.page, c.seq, c.text, s.score",
      `FROM (SELECT chunk_id, ${FullTextIndexService.INDEX_SCHEMA}.match_bm25(chunk_id, q_text) AS score FROM ${FullTextIndexService.SEARCH_TABLE}) s`,
      "JOIN asset_filing_chunks c ON c.filing_id || ':' || CAST(c.seq AS VARCHAR) = s.chunk_id",
      "WHERE s.score IS NOT NULL AND q_mode = 'text' AND c.asset_id = q_asset_id",
      "AND c.document_type = q_document_type AND (q_section IS NULL OR c.section = q_section)",
      "ORDER BY s.score DESC",
    ].join(" ");
  }
}

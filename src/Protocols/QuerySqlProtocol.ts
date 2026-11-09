import type { DatabasePort } from "@/Protocols/DatabaseProtocol.ts";
import type { LoaderPort } from "@/Protocols/LoaderProtocol.ts";
import type { SqlGuardPort } from "@/Protocols/SqlGuardProtocol.ts";
import type { LoadJobRegistry } from "@/Protocols/LoadJobProtocol.ts";

export type QuerySqlInput = { sql: string };

export type QuerySqlDependencies = {
  guard: SqlGuardPort;
  loader: LoaderPort;
  openReader: () => Promise<DatabasePort>;
  jobs?: LoadJobRegistry;
  backgroundAfterMs?: number;
  ensureSearchIndex?: () => Promise<string | undefined>;
};

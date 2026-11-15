import type { PeriodWindow } from "@/Protocols/PeriodProtocol.ts";

export type GdeltSearchWindow = PeriodWindow & { isClamped: boolean };

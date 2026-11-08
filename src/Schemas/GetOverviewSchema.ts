import { z } from "zod";
import type { GetOverviewInput } from "@/Protocols/GetOverviewProtocol.ts";

export const GetOverviewInputSchema: z.ZodType<GetOverviewInput> = z.strictObject({});

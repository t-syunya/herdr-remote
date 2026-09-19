import { hc } from "hono/client";
import type { AppType } from "@herdr/server/app";

export const api = hc<AppType>("/");

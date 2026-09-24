import { hc } from "hono/client";
import type { AppType } from "@herdr/server/app";

const fetchWithTimeout: typeof fetch = (input, init) =>
  fetch(input, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(15000),
  });

export const api = hc<AppType>("/", { fetch: fetchWithTimeout });

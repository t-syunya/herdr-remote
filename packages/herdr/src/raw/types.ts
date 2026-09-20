export type RawRequest = {
  id: string;
  method: string;
  params: Record<string, unknown>;
};
export type RawSuccess = { id: string; result: Record<string, unknown> };
export type RawFailure = {
  id: string;
  error: { code: string; message: string };
};
export type RawResponse = RawSuccess | RawFailure;

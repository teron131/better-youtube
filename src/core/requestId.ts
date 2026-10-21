/** Prefixed request IDs, such as `caption_<uuid>`, that let each surface recognize and discard results from superseded requests. */

export type RequestId = string;

export function createRequestId(prefix: string = "req"): RequestId {
  const globalCrypto = globalThis.crypto;
  if (globalCrypto && "randomUUID" in globalCrypto) {
    return `${prefix}_${(globalCrypto as Crypto).randomUUID()}`;
  }

  const rand = Math.random().toString(16).slice(2);
  return `${prefix}_${Date.now().toString(16)}_${rand}`;
}

/**
 * Builds a `fetch` that transparently pays x402 challenges with the configured
 * Solana wallet, using the official Coinbase x402 client packages.
 *
 * Flow handled for us by `wrapFetchWithPayment` + `ExactSvmScheme`:
 *   1. send the request
 *   2. on HTTP 402, read the advertised PaymentRequirements
 *   3. build + sign an SPL-token `exact` transfer (gasless; the API's
 *      `extra.feePayer` sponsors the fee)
 *   4. retry the request with the `X-PAYMENT` header
 */

import { base58 } from "@scure/base";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import { x402Client } from "@x402/core/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { ExactSvmScheme } from "@x402/svm/exact/client";
import type { RecapfyConfig } from "./config.js";

export type FetchLike = typeof fetch;

export async function createPayingFetch(config: RecapfyConfig): Promise<FetchLike> {
  let secretBytes: Uint8Array;
  try {
    secretBytes = base58.decode(config.svmPrivateKey);
  } catch {
    throw new Error(
      "SVM_PRIVATE_KEY is not valid base58. Provide the base58-encoded Solana secret key.",
    );
  }

  const signer = await createKeyPairSignerFromBytes(secretBytes);

  const client = new x402Client();
  // The API advertises a CAIP-2 Solana network id (e.g. "solana:<genesis>").
  // Register the exact-SVM scheme for any Solana network.
  client.register("solana:*", new ExactSvmScheme(signer));

  return wrapFetchWithPayment(fetch, client);
}

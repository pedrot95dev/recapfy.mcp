/**
 * Runtime configuration, read from environment variables.
 *
 * The MCP server is meant to be run locally by each agent/user, configured with
 * that user's own Solana wallet — so every caller pays with their own funds.
 */

export interface RecapfyConfig {
  /** Base URL of the Recapfy API, no trailing slash. */
  apiBaseUrl: string;
  /** Base58-encoded Solana secret key used to sign x402 payments. */
  svmPrivateKey: string;
  /** Allow self-signed TLS (local dev only). */
  allowInsecureTls: boolean;
}

class ConfigError extends Error {}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new ConfigError(
      `Missing required environment variable ${name}. See .env.example for setup.`,
    );
  }
  return value;
}

export function loadConfig(): RecapfyConfig {
  const apiBaseUrl = required("RECAPFY_API_BASE_URL").replace(/\/+$/, "");
  const svmPrivateKey = required("SVM_PRIVATE_KEY");
  const allowInsecureTls = process.env.RECAPFY_ALLOW_INSECURE_TLS?.trim() === "1";

  return { apiBaseUrl, svmPrivateKey, allowInsecureTls };
}

export { ConfigError };

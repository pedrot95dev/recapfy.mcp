#!/usr/bin/env node
/**
 * Entry point. Wires config -> paying fetch -> MCP server over stdio.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ConfigError, loadConfig } from "./config.js";
import { createPayingFetch } from "./payment.js";
import { buildServer } from "./server.js";

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      // stderr: stdout is reserved for the MCP stdio transport.
      console.error(`[recapfy-mcp] ${err.message}`);
      process.exit(1);
    }
    throw err;
  }

  if (config.allowInsecureTls) {
    // Local dev with a self-signed cert only.
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }

  const payingFetch = await createPayingFetch(config);
  const server = buildServer(config, payingFetch);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("[recapfy-mcp] ready (stdio)");
}

main().catch((err) => {
  console.error("[recapfy-mcp] fatal:", err);
  process.exit(1);
});

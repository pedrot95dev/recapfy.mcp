/**
 * The Recapfy MCP server. Exposes a single tool, `ask`, that calls the paid
 * Recapfy x402 endpoint and returns the agent's answer. Payment is handled
 * transparently by the wrapped fetch (see payment.ts).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { RecapfyConfig } from "./config.js";
import type { FetchLike } from "./payment.js";

const ASK_PATH = "/api/v1/agents/ask";

// Matches AskAgentResponse(string Answer) on the API.
interface AskAgentResponse {
  answer: string;
}

const inputSchema = {
  videoUrl: z
    .string()
    .url()
    .describe("Absolute http(s) URL of the YouTube video to ask about."),
  // The API validator currently requires a non-empty prompt. The long-term
  // plan is to allow omitting it for a standard summary; until the API relaxes
  // that rule we require it here to avoid a guaranteed 400.
  prompt: z
    .string()
    .min(1)
    .describe("What to ask about the video (e.g. a question or 'summarize')."),
};

export function buildServer(config: RecapfyConfig, payingFetch: FetchLike): McpServer {
  const server = new McpServer({
    name: "recapfy",
    version: "0.1.0",
  });

  server.registerTool(
    "ask",
    {
      title: "Ask about a YouTube video",
      description:
        "Ask anything about a YouTube video (or request a summary). This is a paid " +
        "tool: each call costs 0.01 USDC on Solana, paid automatically from the " +
        "configured wallet via the x402 protocol.",
      inputSchema,
    },
    async ({ videoUrl, prompt }) => {
      const url = `${config.apiBaseUrl}${ASK_PATH}`;

      let response: Response;
      try {
        response = await payingFetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoUrl, prompt }),
        });
      } catch (err) {
        return toError(
          `Request failed (could not reach API or payment could not be completed): ${describe(err)}`,
        );
      }

      if (!response.ok) {
        const body = await safeText(response);
        return toError(
          `Recapfy API returned ${response.status} ${response.statusText}.` +
            (body ? `\n${body}` : ""),
        );
      }

      let data: AskAgentResponse;
      try {
        data = (await response.json()) as AskAgentResponse;
      } catch (err) {
        return toError(`Could not parse API response as JSON: ${describe(err)}`);
      }

      const settlement = response.headers.get("x-payment-response");

      return {
        content: [{ type: "text", text: data.answer }],
        structuredContent: {
          answer: data.answer,
          paymentSettled: settlement !== null,
        },
      };
    },
  );

  return server;
}

function toError(message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}

async function safeText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 2000);
  } catch {
    return "";
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

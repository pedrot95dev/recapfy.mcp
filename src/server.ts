/**
 * The Recapfy MCP server. Exposes paid tools that call the Recapfy x402
 * endpoints: `ask` (query an agent about a video) and `get_transcript` (fetch a
 * video's full transcript). Payment is handled transparently by the wrapped
 * fetch (see payment.ts).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { RecapfyConfig } from "./config.js";
import type { FetchLike } from "./payment.js";

const ASK_PATH = "/api/v1/agents/ask";
const GET_TRANSCRIPT_PATH = "/api/v1/agents/get-transcript";

// Matches AskAgentResponse(string Answer) on the API.
interface AskAgentResponse {
  answer: string;
}

// Matches GetTranscriptResponse on the API. `transcript` is the ordered list of
// timestamped segments that make up the video's captions.
interface TranscriptSegment {
  timestampInSeconds: number;
  text: string;
}

interface GetTranscriptResponse {
  title: string;
  channelName: string;
  durationSeconds: number;
  transcript: TranscriptSegment[];
}

const askInputSchema = {
  videoUrl: z
    .string()
    .url()
    .describe("Absolute http(s) URL of the YouTube video to ask about."),
  // The API requires a non-empty prompt (confirmed against the live endpoint:
  // omitting it returns 400, despite the docs hinting it is optional).
  prompt: z
    .string()
    .min(1)
    .describe("What to ask about the video (e.g. a question or 'summarize')."),
  // Required in practice: the API rejects requests where this is missing/<=0,
  // and the price is dynamic in this value (more tokens = higher USDC cost).
  maxOutputTokens: z
    .number()
    .int()
    .positive()
    .default(1024)
    .describe(
      "Maximum tokens in the answer. Drives the per-call price (more tokens cost more USDC).",
    ),
};

const getTranscriptInputSchema = {
  videoUrl: z
    .string()
    .url()
    .describe("Absolute http(s) URL of the YouTube video to transcribe."),
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
        "tool: each call costs a dynamic amount of USDC on Solana (scales with " +
        "maxOutputTokens), paid automatically from the configured wallet via the x402 protocol.",
      inputSchema: askInputSchema,
    },
    async ({ videoUrl, prompt, maxOutputTokens }) => {
      const result = await postPaid<AskAgentResponse>(payingFetch, `${config.apiBaseUrl}${ASK_PATH}`, {
        videoUrl,
        prompt,
        maxOutputTokens,
      });
      if (!result.ok) return result.error;

      return {
        content: [{ type: "text", text: result.data.answer }],
        structuredContent: {
          answer: result.data.answer,
          paymentSettled: result.settled,
        },
      };
    },
  );

  server.registerTool(
    "get_transcript",
    {
      title: "Get a YouTube video transcript",
      description:
        "Fetch the full transcript of a YouTube video as timestamped segments, " +
        "along with its title, channel, and duration. This is a paid tool: each " +
        "call costs a flat amount of USDC on Solana, paid automatically from the " +
        "configured wallet via the x402 protocol.",
      inputSchema: getTranscriptInputSchema,
    },
    async ({ videoUrl }) => {
      const result = await postPaid<GetTranscriptResponse>(
        payingFetch,
        `${config.apiBaseUrl}${GET_TRANSCRIPT_PATH}`,
        { videoUrl },
      );
      if (!result.ok) return result.error;

      const { title, channelName, durationSeconds, transcript } = result.data;
      const text = formatTranscript(result.data);

      return {
        content: [{ type: "text", text }],
        structuredContent: {
          title,
          channelName,
          durationSeconds,
          transcript,
          paymentSettled: result.settled,
        },
      };
    },
  );

  return server;
}

type PostResult<T> =
  | { ok: true; data: T; settled: boolean }
  | { ok: false; error: ReturnType<typeof toError> };

/**
 * POSTs `body` as JSON to `url` through the paying fetch, settling any x402
 * challenge, and returns the parsed response. Network, HTTP, and parse failures
 * are normalized into a tool error result.
 */
async function postPaid<T>(
  payingFetch: FetchLike,
  url: string,
  body: unknown,
): Promise<PostResult<T>> {
  let response: Response;
  try {
    response = await payingFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return {
      ok: false,
      error: toError(
        `Request failed (could not reach API or payment could not be completed): ${describe(err)}`,
      ),
    };
  }

  if (!response.ok) {
    const text = await safeText(response);
    return {
      ok: false,
      error: toError(
        `Recapfy API returned ${response.status} ${response.statusText}.` +
          (text ? `\n${text}` : ""),
      ),
    };
  }

  let data: T;
  try {
    data = (await response.json()) as T;
  } catch (err) {
    return { ok: false, error: toError(`Could not parse API response as JSON: ${describe(err)}`) };
  }

  // x402 v2 settlement header is PAYMENT-RESPONSE; X-PAYMENT-RESPONSE is the
  // v1 name kept as a fallback.
  const settled =
    response.headers.get("payment-response") !== null ||
    response.headers.get("x-payment-response") !== null;

  return { ok: true, data, settled };
}

function formatTranscript(data: GetTranscriptResponse): string {
  const header =
    `${data.title} — ${data.channelName} (${data.durationSeconds}s)`;
  const lines = data.transcript.map(
    (seg) => `[${formatTimestamp(seg.timestampInSeconds)}] ${seg.text}`,
  );
  return [header, "", ...lines].join("\n");
}

function formatTimestamp(seconds: number): string {
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
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

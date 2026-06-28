# Recapfy MCP

An [MCP](https://modelcontextprotocol.io) server that exposes Recapfy's paid
`ask` endpoint as a tool. Ask anything about a YouTube video (or get a summary)
straight from an MCP-capable agent — Claude Desktop, Cursor, Cline, etc.

Each call costs **0.01 USDC on Solana**, paid automatically via the
[x402](https://x402.org) protocol.

## Why a local MCP server (and why you bring your own wallet)

"MCP server" is a protocol role, not a hosted service. This is a **local stdio
server**: each user runs their own copy and configures it with their **own
Solana wallet**, so every caller pays with their own funds. That's the only model
that makes per-agent payment work — a single shared hosted server can't hold
everyone's wallet. It's published to npm so an agent host can add it in one step,
and it hides the whole x402 dance (402 → sign → retry) behind a single tool call.

## Tool

### `ask`

| Input             | Type    | Required | Description                                                              |
| ----------------- | ------- | -------- | ------------------------------------------------------------------------ |
| `videoUrl`        | string  | yes      | Absolute http(s) URL of the YouTube video.                               |
| `prompt`          | string  | yes      | What to ask (a question, or "summarize").                                |
| `maxOutputTokens` | integer | no       | Max tokens in the answer (defaults to 1024). **Drives the dynamic price.** |

Returns the agent's answer as text. Payment is settled transparently before the
answer is returned.

> The per-call price is **dynamic**: the API quotes the USDC amount in the 402
> challenge based on `maxOutputTokens`. The configured wallet pays whatever is
> quoted, so keep `maxOutputTokens` sensible.

## Configuration

Set via environment variables (see [`.env.example`](./.env.example)):

| Variable                     | Required | Description                                                                 |
| ---------------------------- | -------- | --------------------------------------------------------------------------- |
| `RECAPFY_API_BASE_URL`       | yes      | Base URL of the Recapfy API, no trailing slash.                             |
| `SVM_PRIVATE_KEY`            | yes      | Base58-encoded Solana **secret key**. Pays 0.01 USDC per call. Keep funded. |
| `RECAPFY_ALLOW_INSECURE_TLS` | no       | Set to `1` to accept self-signed TLS (local dev over https only).           |

## Install & build

```bash
npm install
npm run build
```

## Use with Claude Desktop

Add to your MCP config (`claude_desktop_config.json`):

```jsonc
{
  "mcpServers": {
    "recapfy": {
      "command": "node",
      "args": ["C:/Developer/Repositories/Recapfy/recapfy.mcp/dist/index.js"],
      "env": {
        "RECAPFY_API_BASE_URL": "https://api.recapfy.ai",
        "SVM_PRIVATE_KEY": "<your base58 Solana secret key>"
      }
    }
  }
}
```

Once published to npm this becomes `"command": "npx", "args": ["-y", "recapfy-mcp"]`.

## How payment works

Built on the official Coinbase x402 **v2** client packages
(`@x402/fetch`, `@x402/svm`, `@x402/core`) plus `@solana/kit` for signing. The
deployed API is a proper x402 v2 server, so the off-the-shelf client is wire
compatible — confirmed against the live endpoint and `.well-known/x402` manifest:

1. The tool POSTs to `${RECAPFY_API_BASE_URL}/api/v1/agents/ask`.
2. The API replies `402` with the requirements in the **`PAYMENT-REQUIRED`**
   header (`exact` SVM scheme, USDC, dynamic `amount`, and a facilitator
   `feePayer` that sponsors the network fee).
3. The wrapped fetch builds and signs a gasless SPL-token transfer with your
   wallet and retries with the **`PAYMENT-SIGNATURE`** header (x402 v2).
4. The API verifies, settles, and returns the answer plus a **`PAYMENT-RESPONSE`**
   settlement header.

Verified against the live API (`api.recapfy.ai`):

- `x402Version: 2`, network `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` (mainnet),
  asset USDC, amount `dynamic` (quoted per request from `maxOutputTokens`).
- Field name is `amount` — correct for x402 **v2** (v1 used `maxAmountRequired`);
  `@x402/core` parses both, keyed off `x402Version`.

## Status

- ✅ MCP server boots over stdio and advertises the `ask` tool (with
  `maxOutputTokens`).
- ✅ Wire format verified compatible with the live x402 v2 endpoint.
- ⏳ A real *paid* call still needs a funded mainnet USDC wallet; not yet
  exercised end-to-end from here.

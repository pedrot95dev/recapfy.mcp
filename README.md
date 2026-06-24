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

| Input      | Type   | Required | Description                                   |
| ---------- | ------ | -------- | --------------------------------------------- |
| `videoUrl` | string | yes      | Absolute http(s) URL of the YouTube video.    |
| `prompt`   | string | yes      | What to ask (a question, or "summarize").     |

> The API currently **requires** a prompt. The longer-term plan is to allow
> omitting it for a standard summary; this tool will relax the rule once the API
> does.

Returns the agent's answer as text. Payment is settled transparently before the
answer is returned.

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

Once published to npm this becomes `"command": "npx", "args": ["-y", "@recapfy/mcp"]`.

## How payment works

Built on the official Coinbase x402 client packages
(`@x402/fetch`, `@x402/svm`, `@x402/core`) plus `@solana/kit` for signing:

1. The tool POSTs to `${RECAPFY_API_BASE_URL}/api/v1/agents/ask`.
2. The API replies `402` with the payment requirements (`exact` SVM scheme,
   USDC, and a facilitator `feePayer` that sponsors the network fee).
3. The wrapped fetch builds and signs a gasless SPL-token transfer with your
   wallet and retries with the `X-PAYMENT` header.
4. The API verifies, settles, and returns the answer.

## Status / to verify against a live API

- ✅ MCP server boots over stdio and advertises the `ask` tool.
- ⏳ A real paid call needs a funded wallet on the advertised network and a
  reachable API. Not yet exercised end-to-end here.
- ⚠️ **Wire-format check:** the API serializes the 402 challenge's amount field
  as `amount`; canonical x402 v2 often uses `maxAmountRequired`. If the official
  client's parser disagrees with what the API emits, the auto-payment won't
  trigger. Confirm the field names line up (and fix on whichever side is wrong)
  during the first live test.

# Recapfy MCP

An [MCP](https://modelcontextprotocol.io) server that exposes Recapfy's paid
`ask` endpoint as a tool — ask anything about a YouTube video (or get a summary)
straight from an MCP-capable agent like Claude Desktop, Cursor, or Cline.

Each call is paid in **USDC on Solana** (dynamic price, scales with
`maxOutputTokens`), settled automatically via the [x402](https://x402.org)
protocol. You bring your own wallet; you pay only for what you call.

📦 npm: [`recapfy-mcp`](https://www.npmjs.com/package/recapfy-mcp)

## Why a local server, and why you bring your own wallet

"MCP server" is a protocol role, not a hosted service. This runs as a **local
stdio server**: each user launches their own copy, configured with their **own
Solana wallet**, so every caller pays with their own funds. That's the only model
that makes per-agent payment work — a single shared server can't hold everyone's
wallet. It hides the whole x402 dance (`402 → sign → retry`) behind one tool call.

## Prerequisites

- **Node.js ≥ 20.**
- A **Solana wallet funded with USDC on mainnet.** You do *not* need SOL for fees
  — the API's facilitator sponsors the network fee.
- That wallet's **secret key, base58-encoded** (the 64-byte form that Phantom's
  "Export Private Key" gives you, or `solana-keygen`).

> ⚠️ The key signs real payments. Use a dedicated low-balance wallet, never share
> it, and never commit it.

## Install

No clone or build needed. Add this to your MCP client config (Claude Desktop:
`claude_desktop_config.json`) and restart the client:

```jsonc
{
  "mcpServers": {
    "recapfy": {
      "command": "npx",
      "args": ["-y", "recapfy-mcp"],
      "env": {
        "RECAPFY_API_BASE_URL": "https://api.recapfy.ai",
        "SVM_PRIVATE_KEY": "<your base58 Solana secret key>"
      }
    }
  }
}
```

## Configuration

| Variable                     | Required | Description                                                       |
| ---------------------------- | -------- | ----------------------------------------------------------------- |
| `RECAPFY_API_BASE_URL`       | yes      | Base URL of the Recapfy API, no trailing slash.                   |
| `SVM_PRIVATE_KEY`            | yes      | Base58-encoded Solana secret key. Pays per call. Keep it funded.  |
| `RECAPFY_ALLOW_INSECURE_TLS` | no       | Set to `1` to accept self-signed TLS (local dev over https only). |

## Tool: `ask`

| Input             | Type    | Required | Description                                                                 |
| ----------------- | ------- | -------- | --------------------------------------------------------------------------- |
| `videoUrl`        | string  | yes      | Absolute http(s) URL of the YouTube video.                                  |
| `prompt`          | string  | yes      | What to ask (a question, or "summarize").                                   |
| `maxOutputTokens` | integer | no       | Max tokens in the answer (default 1024). **Drives the dynamic price.**       |

Returns the agent's answer as text. Payment is settled before the answer returns.
The per-call price is **dynamic**: the API quotes the USDC amount in the `402`
challenge based on `maxOutputTokens`, and your wallet pays whatever is quoted — so
keep `maxOutputTokens` sensible.

## How payment works

Built on the official Coinbase x402 **v2** client packages (`@x402/fetch`,
`@x402/svm`, `@x402/core`) plus `@solana/kit` for signing:

1. The tool POSTs to `${RECAPFY_API_BASE_URL}/api/v1/agents/ask`.
2. The API replies `402` with requirements in the `PAYMENT-REQUIRED` header
   (`exact` SVM scheme, USDC, dynamic amount, and a facilitator `feePayer` that
   sponsors the network fee).
3. The wrapped fetch signs a gasless SPL-token transfer with your wallet and
   retries with the `PAYMENT-SIGNATURE` header.
4. The API verifies, settles, and returns the answer plus a `PAYMENT-RESPONSE`
   settlement header.

## Verify it works

Inspect the tool without spending anything using the MCP Inspector (it only signs
a payment when you actually invoke `ask`, so any key is fine just to browse):

```bash
RECAPFY_API_BASE_URL=https://api.recapfy.ai SVM_PRIVATE_KEY=<key> \
  npx @modelcontextprotocol/inspector npx -y recapfy-mcp
```

Open the printed URL → **Tools → ask**. Invoking it with a funded wallet performs
a real paid call; verify the spend on a Solana explorer.

## Troubleshooting

| Symptom                                          | Cause / fix                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------- |
| `Missing required environment variable ...`      | `RECAPFY_API_BASE_URL` or `SVM_PRIVATE_KEY` not set.                |
| `SVM_PRIVATE_KEY is not valid base58`            | Needs base58 of the 64-byte secret key.                             |
| `400 ... maxOutputTokens must be greater than 0` | Pass a positive `maxOutputTokens` (the tool defaults to 1024).      |
| `400 ... prompt`                                 | `prompt` is required and non-empty.                                 |
| 402 loop / "Failed to create payment payload"    | Wallet has no USDC on mainnet, or wrong network. Fund it.           |
| TLS error against a local API over https         | Set `RECAPFY_ALLOW_INSECURE_TLS=1` (localhost dev only).            |

## Development

```bash
git clone https://github.com/pedrot95dev/recapfy.mcp.git
cd recapfy.mcp
npm install
npm run build      # outputs dist/
```

Run a local checkout from your MCP client by pointing at the build:

```jsonc
{
  "mcpServers": {
    "recapfy": {
      "command": "node",
      "args": ["/absolute/path/to/recapfy.mcp/dist/index.js"],
      "env": {
        "RECAPFY_API_BASE_URL": "https://api.recapfy.ai",
        "SVM_PRIVATE_KEY": "<your base58 Solana secret key>"
      }
    }
  }
}
```

Releases are automated: publishing a GitHub Release runs
[`.github/workflows/release.yml`](./.github/workflows/release.yml), which
publishes to npm via OIDC trusted publishing (with provenance, no token).

## License

MIT

# Recapfy MCP

An [MCP](https://modelcontextprotocol.io) server that exposes Recapfy's paid
endpoints as tools — ask anything about a YouTube video (or get a summary) and
fetch a video's full transcript — straight from an MCP-capable agent like Claude
Desktop, Cursor, or Cline.
It runs locally — there's no hosted Recapfy MCP endpoint; you launch your own copy.

Each call is paid in **USDC on Solana** (dynamic price, scales with
`maxOutputTokens`), settled automatically via the [x402](https://x402.org)
protocol. You bring your own wallet; you pay only for what you call.

📦 npm: [`recapfy-mcp`](https://www.npmjs.com/package/recapfy-mcp)

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
      "args": ["-y", "recapfy-mcp@latest"],
      "env": {
        "SVM_PRIVATE_KEY": "<your base58 Solana secret key>"
      }
    }
  }
}
```

> **Always use `recapfy-mcp@latest`.** A bare `npx -y recapfy-mcp` reuses
> whatever is in npx's cache and never re-checks the registry, so you can stay
> pinned to an old build (and miss new tools) indefinitely. The `@latest` tag
> forces npx to resolve the newest published version on every launch.

## Updating

New versions (including new tools/endpoints) are picked up automatically **when
two things happen**, because of two independent caches:

1. **npx package cache** — using `recapfy-mcp@latest` (as above) makes npx fetch
   the newest published version each launch. Without `@latest`, npx serves the
   cached copy and you stay on an old build.
2. **MCP client tool list** — clients read the server's tool list **once per
   session**. New tools only appear after you **fully restart the MCP client**
   (Claude Desktop, Cursor, Cline, …) so it relaunches the server and re-reads
   the tools.

So after a release: keep `@latest` and **restart your client**. If a brand-new
tool still doesn't show up, force a clean fetch:

```bash
npx clear-npx-cache    # or: rm -rf "$(npm config get cache)/_npx"
```

then restart the client again.

## Configuration

| Variable                     | Required | Description                                                                          |
| ---------------------------- | -------- | ----------------------------------------------------------------------------------- |
| `SVM_PRIVATE_KEY`            | yes      | Base58-encoded Solana secret key. Pays per call. Keep it funded.                    |
| `RECAPFY_API_BASE_URL`       | no       | Override the API base URL (defaults to `https://api.recapfy.ai`). For local dev.    |
| `RECAPFY_ALLOW_INSECURE_TLS` | no       | Set to `1` to accept self-signed TLS (local dev over https only).                   |

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

## Tool: `get_transcript`

| Input      | Type   | Required | Description                                |
| ---------- | ------ | -------- | ------------------------------------------ |
| `videoUrl` | string | yes      | Absolute http(s) URL of the YouTube video. |

Returns the video's full transcript as timestamped segments, plus its `title`,
`channelName`, and `durationSeconds`. The text content is a readable, timestamped
transcript; the structured content carries the raw `transcript` array (each
segment is `{ timestampInSeconds, text }`). The per-call price is **flat** USDC,
quoted in the `402` challenge and paid automatically.

## How payment works

Built on the official Coinbase x402 **v2** client packages (`@x402/fetch`,
`@x402/svm`, `@x402/core`) plus `@solana/kit` for signing:

1. The tool POSTs to the matching endpoint under `${RECAPFY_API_BASE_URL}`
   (`/api/v1/agents/ask` or `/api/v1/agents/get-transcript`).
2. The API replies `402` with requirements in the `PAYMENT-REQUIRED` header
   (`exact` SVM scheme, USDC, dynamic amount, and a facilitator `feePayer` that
   sponsors the network fee).
3. The wrapped fetch signs a gasless SPL-token transfer with your wallet and
   retries with the `PAYMENT-SIGNATURE` header.
4. The API verifies, settles, and returns the answer plus a `PAYMENT-RESPONSE`
   settlement header.

## Verify it works

Inspect the tools without spending anything using the MCP Inspector (it only signs
a payment when you actually invoke a tool, so any key is fine just to browse):

```bash
SVM_PRIVATE_KEY=<key> npx @modelcontextprotocol/inspector npx -y recapfy-mcp@latest
```

Open the printed URL → **Tools → ask / get_transcript**. Invoking a tool with a
funded wallet performs a real paid call; verify the spend on a Solana explorer.

## Troubleshooting

| Symptom                                          | Cause / fix                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------- |
| `Missing required environment variable ...`      | `SVM_PRIVATE_KEY` not set.                                          |
| `SVM_PRIVATE_KEY is not valid base58`            | Needs base58 of the 64-byte secret key.                             |
| `400 ... maxOutputTokens must be greater than 0` | Pass a positive `maxOutputTokens` (the tool defaults to 1024).      |
| `400 ... prompt`                                 | `prompt` is required and non-empty.                                 |
| New tool/endpoint missing after an update        | Pin `recapfy-mcp@latest`, **restart the client**, then clear the npx cache (see [Updating](#updating)). |
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
        "SVM_PRIVATE_KEY": "<your base58 Solana secret key>"
      }
    }
  }
}
```

Releases are fully automated from **Conventional Commits** — there's no manual
version bump or GitHub Release step. Every push to `main` runs
[`.github/workflows/release.yml`](./.github/workflows/release.yml), which uses
[semantic-release](https://semantic-release.gitbook.io) to decide the next
version, then publishes to npm (OIDC trusted publishing, with provenance) and the
MCP Registry (GitHub OIDC), and creates the git tag + GitHub Release. No tokens.

| Commit type                         | Release           |
| ----------------------------------- | ----------------- |
| `fix: …`                            | patch (0.1.6 → 0.1.7) |
| `feat: …`                           | minor (0.1.6 → 0.2.0) |
| `feat!: …` / `BREAKING CHANGE:`     | major (0.1.6 → 1.0.0) |
| `docs:`, `chore:`, `refactor:`, …   | no release        |

The version bump is **not** committed back to `main`; semantic-release reads the
last `v*` tag to compute the next version, so commit `package.json`'s `version`
field as-is and let the pipeline own it.

## License

MIT

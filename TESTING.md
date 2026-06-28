# Testing & Deploying the Recapfy MCP

This is the practical guide: how to configure, expose, and test the server. For
architecture/why, see [README.md](./README.md).

## TL;DR of what this is

A **local stdio MCP server**. It is not a hosted service — each user runs their
own copy, configured with their own Solana wallet, and pays per call. "Deploying"
it means **publishing the package + telling an MCP client how to launch it**, not
standing up a server.

---

## 1. Prerequisites

- Node.js >= 20 (developed on v24).
- A Solana wallet **funded with USDC on mainnet** (the API advertises
  `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`). You also need a tiny bit of SOL is
  *not* required — fees are sponsored by the API's facilitator (`feePayer`).
- That wallet's **secret key, base58-encoded** (64-byte form). This is what
  Phantom's "Export Private Key" gives you, or:
  `solana-keygen new -o wallet.json` then base58-encode the 64-byte array.

## 2. Configure

Set two env vars (see `.env.example`):

| Variable               | Value                                            |
| ---------------------- | ------------------------------------------------ |
| `RECAPFY_API_BASE_URL` | `https://api.recapfy.ai` (no trailing slash)     |
| `SVM_PRIVATE_KEY`      | your base58 Solana secret key                    |

Never commit the real key.

## 3. Build

```bash
npm install
npm run build      # outputs dist/
```

---

## 4. Test it — three levels

### Level A — Plumbing only (no wallet, no payment, free)

Confirms the server boots and advertises the `ask` tool. Either:

**MCP Inspector (recommended, interactive UI):**
```bash
RECAPFY_API_BASE_URL=https://api.recapfy.ai SVM_PRIVATE_KEY=<key> \
  npx @modelcontextprotocol/inspector node dist/index.js
```
Open the printed URL, go to **Tools → ask**. You'll see `videoUrl`, `prompt`,
`maxOutputTokens`. (You can stop here without calling it — calling it spends USDC.)

> A throwaway/unfunded key is fine for Level A; the server only *signs* when the
> tool is actually invoked.

### Level B — Wire into a real MCP client (Claude Desktop / Cursor)

Add to the client's MCP config (Claude Desktop: `claude_desktop_config.json`):
```jsonc
{
  "mcpServers": {
    "recapfy": {
      "command": "node",
      "args": ["C:/Developer/Repositories/Recapfy/recapfy.mcp/dist/index.js"],
      "env": {
        "RECAPFY_API_BASE_URL": "https://api.recapfy.ai",
        "SVM_PRIVATE_KEY": "<your base58 key>"
      }
    }
  }
}
```
Restart the client. The `recapfy` tool should appear in its tool list. Asking the
agent "summarize this YouTube video: <url>" will trigger a **real paid call**.

### Level C — Real paid call (costs USDC) ⚠️

The only true end-to-end test. From the Inspector or an agent, call `ask` with a
funded wallet:
```json
{ "videoUrl": "https://www.youtube.com/watch?v=...", "prompt": "summarize", "maxOutputTokens": 512 }
```
Expected: an `answer` string. Behind the scenes the wrapped fetch did
`402 → sign SPL transfer → retry with PAYMENT-SIGNATURE → 200`. Price is
**dynamic** in `maxOutputTokens` (~0.031 USDC at 256 tokens in testing).

Verify the spend on a Solana explorer against your wallet / the recipient
`36CMVqozGDD5cUbwU71zs9ce6qt94yLWcSs2F8VEFvo7`.

---

## 5. "Deploy" = publish for distribution

The agent-discovery goal (see the API repo's X402 strategy doc, Tier 1 #1):

1. `npm publish --access public` (package is `@recapfy/mcp`). Then users launch it
   with `npx -y @recapfy/mcp` instead of a local path — update the config snippet
   accordingly.
2. List it on MCP registries: official MCP registry, Smithery, mcp.so, PulseMCP,
   Glama.
3. Register the endpoint in the x402 ecosystem (Bazaar / awesome-x402).

---

## Troubleshooting

| Symptom                                            | Likely cause / fix                                                                 |
| -------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `Missing required environment variable ...`        | `RECAPFY_API_BASE_URL` or `SVM_PRIVATE_KEY` not set.                                |
| `SVM_PRIVATE_KEY is not valid base58`              | Wrong key format — needs base58 of the 64-byte secret key.                          |
| `400 ... maxOutputTokens must be greater than 0`   | API requires `maxOutputTokens > 0`; the tool defaults to 1024, so this means a bad explicit value. |
| `400 ... prompt`                                   | `prompt` is required and non-empty.                                                |
| 402 loop / "Failed to create payment payload"      | Wallet has no USDC on mainnet, or wrong network. Fund it.                           |
| TLS error against a local API over https           | Set `RECAPFY_ALLOW_INSECURE_TLS=1` (localhost dev only).                            |

# Contributing

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

## Releases

Releases are fully automated from **Conventional Commits** — there's no manual
version bump or GitHub Release step. Every push to `main` runs
[`.github/workflows/release.yml`](./.github/workflows/release.yml), which uses
[semantic-release](https://semantic-release.gitbook.io) to decide the next
version, then publishes to npm (OIDC trusted publishing, with provenance) and the
MCP Registry (GitHub OIDC), and creates the git tag + GitHub Release. No tokens.

| Commit type                         | Release           |
| ----------------------------------- | ----------------- |
| `fix: …`                            | patch (0.1.6 → 0.1.7) |
| `docs: …`                           | patch — refreshes the npm + MCP Registry pages |
| `feat: …`                           | minor (0.1.6 → 0.2.0) |
| `feat!: …` / `BREAKING CHANGE:`     | major (0.1.6 → 1.0.0) |
| `chore:`, `refactor:`, …            | no release        |

`docs:` is mapped to a patch via a `releaseRules` override in
[`.releaserc.json`](./.releaserc.json) — without it, README/manifest changes
would never reach npm or the MCP Registry, which only re-render on publish.

> The `description` in [`server.json`](./server.json) must be **≤ 100
> characters** — the MCP Registry rejects the publish (HTTP 422) otherwise, and
> since npm publishes first that leaves npm and the registry on different
> versions. Keep it short.

The version bump is **not** committed back to `main`; semantic-release reads the
last `v*` tag to compute the next version, so commit `package.json`'s `version`
field as-is and let the pipeline own it.

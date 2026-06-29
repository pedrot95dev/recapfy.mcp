#!/usr/bin/env bash
# Publishes the already-bumped package to npm and the official MCP Registry.
# Invoked by semantic-release (see .releaserc.json) with the new version as $1.
# Run only in CI: relies on OIDC (id-token: write) for both registries — no tokens.
set -euo pipefail

VERSION="${1:?usage: release-publish.sh <version>}"

# npm: Trusted Publishing (OIDC) authenticates the publish; provenance is
# attached automatically. Requires npm >= 11.5.1 (the workflow upgrades it).
npm publish --access public

# Stamp server.json to the just-published version so the MCP Registry record
# always matches the npm package, then publish it.
jq --arg v "$VERSION" '.version = $v | .packages[0].version = $v' server.json > server.tmp
mv server.tmp server.json

# MCP Registry: GitHub OIDC, no secret.
mcp-publisher login github-oidc
mcp-publisher publish

# Releasing `recapfy-mcp` to npm

How this package gets published so anyone can `npx -y recapfy-mcp`.

## Background: what npm is (30 seconds)

[npmjs.com](https://www.npmjs.com) is the public package registry for Node.js —
the place `npx`/`npm install` download from. Publishing this package there is what
makes it installable by other people's MCP clients. There is no server to run;
"release" just means "push a new version to npm."

We publish via a **GitHub Action using Trusted Publishing (OIDC)**: GitHub proves
the workflow's identity to npm directly, so we never store an npm token, and npm
attaches **provenance** (a verifiable link from the package back to this repo and
commit). See [.github/workflows/release.yml](./.github/workflows/release.yml).

---

## One-time bootstrap (must be done manually, once)

Trusted publishing is configured on a package's settings page, which means the
package has to exist first. So the very first publish is manual:

1. **Create an npm account** at https://www.npmjs.com/signup and verify the email.
   (If you'd rather use a scoped name like `@yourscope/recapfy-mcp`, create an npm
   org first and rename `name` in `package.json` accordingly.)
2. **Check the name is free:** https://www.npmjs.com/package/recapfy-mcp should 404.
   If taken, pick another name and update `name` in `package.json`.
3. **Log in and publish once, locally:**
   ```bash
   npm login
   npm publish --access public
   ```
   (`prepublishOnly` builds `dist/` automatically.)
4. **Enable trusted publishing** so future releases are automated:
   - Go to the package page → **Settings** → **Trusted Publisher**.
   - Provider: **GitHub Actions**.
   - Organization/user: `pedrot95dev` · Repository: `recapfy.mcp`
   - Workflow filename: `release.yml` · Environment: `npm`
5. **Create the `npm` environment in GitHub:** repo → Settings → Environments →
   New environment → name it `npm`. (Matches `environment: npm` in the workflow.)

After this, you never run `npm publish` by hand again.

---

## Cutting a release (every time after bootstrap)

1. Bump the version: `npm version patch` (or `minor` / `major`). This commits a
   tag like `v0.1.1`.
2. Push: `git push --follow-tags`.
3. On GitHub: **Releases → Draft a new release**, pick the tag, publish it.
4. The **Release** workflow runs and publishes the new version to npm with
   provenance. Verify at `https://www.npmjs.com/package/recapfy-mcp`.

> The workflow triggers on a *published GitHub Release*, not just a tag — so
> nothing publishes until you click "Publish release."

---

## Notes

- The npm package name (`recapfy-mcp`) and the GitHub repo name (`recapfy.mcp`)
  don't have to match; npm doesn't allow `.` the same way, hence the `-`.
- Listing on the **official MCP registry** + aggregators (Smithery, mcp.so,
  PulseMCP, Glama) is a separate, later step (needs a `server.json` + `mcpName`
  in `package.json`). Not set up yet — intentionally out of scope for now.

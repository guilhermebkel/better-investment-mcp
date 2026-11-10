# Releasing

A release publishes the npm package, the Docker image and a GitHub release. The workflow is `.github/workflows/release.yml`; it runs `pnpm check` first and publishes nothing when the check fails.

## One-time setup (the owner)

1. **npm trusted publishing.** On the package page on npmjs.com, add a trusted publisher: GitHub Actions, owner `guilhermebkel`, repository `better-investment-mcp`, workflow file `release.yml`, no environment. The workflow then publishes with OIDC and provenance, without a long-lived token. npm allows this setting only for a package that exists: if the package is not on npm yet, publish its first version once from the owner's account, then add the publisher.
2. **GitHub Container Registry.** The workflow pushes `ghcr.io/guilhermebkel/better-investment-mcp` with the workflow's own token (it declares `packages: write`). After the first push, set the package to public in its settings, so `docker run` works without a login.
3. **Actions permissions.** Nothing else: the workflow needs no secret.

## Each release

1. Merge what the release should ship into `main`.
2. In Actions, run **Release** on `main` and choose `patch`, `minor` or `major` (`none` releases the version in `package.json` as is, for the first release).
3. The workflow bumps `package.json`, sets the version and the date on the landing page (`scripts/site-version.mjs`), runs `pnpm check`, commits `package.json` and `site/` as `release: vX.Y.Z [skip ci]`, tags the commit and pushes. Then it publishes the npm package with provenance, creates the GitHub release with generated notes, and starts `pages.yml` so the landing page shows the new version. The `image` job pushes `ghcr.io/guilhermebkel/better-investment-mcp` for `linux/amd64` only. An arm64 image is not built: PyMuPDF has no musllinux arm64 wheel, so the arm64 build would compile it under emulation, and a failure would come after npm is published.
4. The workflow publishes nothing when `pnpm check` fails. If a step fails after the tag, run it again with `none`: it resumes and skips what is already done.

## The landing page

`site/` is the GitHub Pages site, served at `better-investment-mcp.guilherr.me` (`site/CNAME`). `.github/workflows/pages.yml` publishes it on every push to `main` that touches `site/`. One-time setup (the owner): in Settings, Pages, set the source to GitHub Actions; point a `CNAME` DNS record for `better-investment-mcp` at `guilhermebkel.github.io`; then enable Enforce HTTPS.

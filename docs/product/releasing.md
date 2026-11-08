# Releasing

A release publishes the npm package, the Docker image and a GitHub release. The workflow is `.github/workflows/release.yml`; it runs `pnpm check` first and publishes nothing when the check fails.

## One-time setup (the owner)

1. **npm trusted publishing.** On the package page on npmjs.com, add a trusted publisher: GitHub Actions, owner `guilhermebkel`, repository `better-investment-analysis-mcp`, workflow file `release.yml`, no environment. The workflow then publishes with OIDC and provenance, without a long-lived token. npm allows this setting only for a package that exists: if the package is not on npm yet, publish its first version once from the owner's account, then add the publisher.
2. **GitHub Container Registry.** The workflow pushes `ghcr.io/guilhermebkel/better-investment-analysis-mcp` with the workflow's own token (it declares `packages: write`). After the first push, set the package to public in its settings, so `docker run` works without a login.
3. **Actions permissions.** Nothing else: the workflow needs no secret.

## Each release

1. In a pull request, set the version in `package.json` and turn the `## [Unreleased]` section of `CHANGELOG.md` into `## [x.y.z] - YYYY-MM-DD`, with an empty `## [Unreleased]` above it. The release notes are the text under that heading.
2. Merge the pull request.
3. Run a dry run first: in Actions, run **Release** with `dry_run` set to `true`. It runs the check, the publish dry run and the image build, and it publishes nothing.
4. Tag the commit and push the tag: `git tag vx.y.z && git push origin vx.y.z`.
5. The tag run publishes npm and the image, then creates the GitHub release from the changelog section. The workflow fails if the tag and `package.json` disagree.

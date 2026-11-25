# Absolute Memory 0.1.0 release checklist

The release candidate is ready for owner review after local verification. Build notes and verification results are in the [build log](BUILD-LOG.md).

## Owner actions before publishing

- [x] Choose the repository licence: [PolyForm Noncommercial 1.0.0](../LICENSE.md), with [commercial terms](../COMMERCIAL.md).
- [ ] Set up a contributor licence agreement bot before accepting outside pull requests.
- [ ] Owner: run an independent similarity audit before publishing.
- [ ] Review the GitHub repository, tracked tree, and history before changing visibility. Enable private vulnerability reporting. Confirm the owner and contact path in [CODEOWNERS](../.github/CODEOWNERS) and the [security policy](../SECURITY.md).
- [ ] Set the repository Actions variable `PUBLISH_IMAGES` to `true` when ready to publish the image. After creating the release tag, verify the AMD64 and ARM64 manifest and provenance. Run the [image quick start](../README.md#use-the-prebuilt-image) on a fresh machine.
- [ ] Record a short demo with sample data and place it at `docs/media/demo.gif`. Uncomment the README image after adding the recording.
- [ ] Review [TRADEMARKS.md](../TRADEMARKS.md) and the [third-party notices](../THIRD_PARTY_NOTICES.md) before distributing the source and image.
- [ ] Verify a retrieval tool in the signed-in Claude Desktop and Cursor editor using the [MCP setup](mcp.md). Claude Code connected and the Cursor CLI discovered the tool list. Use a temporary read key and revoke it after testing.
- [ ] Run `npm run check:release` and review the GitHub Actions logs after the repository is available. Review [CHANGELOG.md](../CHANGELOG.md), then create the release and tag.

## Verification commands

```sh
npm ci
npx playwright install chromium
npm run check:release
npm run docs:check
git status --short
```

Use the [Standard deployment guide](getting-started.md#standard) to verify the separate worker and PostgreSQL in the target environment. Live credentials for hosted AI, OAuth and SMTP are optional. The automated suite uses a local provider and synthetic accounts.

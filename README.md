# RepoGuard Action 🛡️

Automated security scanner for GitHub Actions workflows. Detects remote code execution vectors, obfuscated malware, hardcoded secrets, supply chain threats, and more — running directly in your CI pipeline with no external server required.

> **Want the full experience?**
> The [**RepoGuard GitHub App**](https://github.com/apps/repoguard-ifecodes) gives you everything this Action does, _plus_ automated Fix PRs, inline PR review suggestions, Slack alerts, MongoDB-backed scan history, and the `/fix` issue comment command. Install it once and it protects every repo you add — no workflow files required.

---

## Quick Start

Create `.github/workflows/repoguard.yml` in your repository:

```yaml
name: "RepoGuard Security Scan"

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

jobs:
  security-scan:
    runs-on: ubuntu-latest
    permissions:
      contents: read # Needed to read .repoguard.yml from default branch
    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Run RepoGuard
        uses: ALADETAN-IFE/repoguard-action@v1
        with:
          minimum-severity: "medium"
          fail-on: "high"
```

> `github-token` defaults to `${{ github.token }}` automatically — you don't need to pass it unless you want to use a custom token.

---

## Why is `github-token` needed — and where does it come from?

**You don't create it. GitHub provides it automatically** to every workflow run in every repository, for free. It exists as `secrets.GITHUB_TOKEN` or `github.token` without any setup.

The input in `action.yml` has `default: "${{ github.token }}"` — so users don't need to pass it at all. GitHub injects it silently.

The token is used for one specific security purpose: **fetching `.repoguard.yml` from the default branch**, not from the PR branch being scanned.

Without this, a malicious contributor could submit a PR that includes a `.repoguard.yml` disabling all detection rules, push malware in the same PR, and the action would scan using the attacker's config — detecting nothing.

By fetching the config from the **already-reviewed default branch** via the GitHub API (which requires the token), RepoGuard ensures the config in effect is one previously merged and approved by your team — not one injected by the PR under review.

```
PR branch:      .repoguard.yml (attacker's: curl-pipe-bash: off) ← IGNORED
Default branch: .repoguard.yml (your team's approved config)      ← USED ✅
```

The `github-token` GitHub automatically provides is read-only and scoped to the current repository — it has no extra permissions beyond what the action needs.

---

## Inputs

| Input              | Description                                                          | Required | Default               |
| ------------------ | -------------------------------------------------------------------- | -------- | --------------------- |
| `github-token`     | Token for fetching `.repoguard.yml` from the default branch securely | No       | `${{ github.token }}` |
| `minimum-severity` | Minimum severity to report: `critical`, `high`, `medium`, `low`      | No       | `medium`              |
| `fail-on`          | Severity that causes the workflow step to fail                       | No       | `high`                |
| `config-path`      | Path to config file relative to repository root                      | No       | `.repoguard.yml`      |

## Outputs

| Output           | Description                |
| ---------------- | -------------------------- |
| `findings-count` | Total findings detected    |
| `critical-count` | Critical severity findings |
| `high-count`     | High severity findings     |

---

## Repository Configuration (`.repoguard.yml`)

To customize scanner behavior, add a `.repoguard.yml` file to the **root (base directory)** of your repository on your default branch:

```yaml
# .repoguard.yml
rules:
  workflow-unpinned-action: off    # Disable unpinned action warnings
  hardcoded-secret: warn           # Downgrade to medium severity

ignore:
  paths:
    - docs/
    - examples/
    - courses/

severity:
  minimum: high                    # Only report high and critical

whitelist:
  patterns:
    - "sk-test-*"                  # Ignore test API keys
    - "EXAMPLE_*"                  # Ignore documentation placeholders

notifications:
  slack: "https://hooks.slack.com/services/xxx/yyy/zzz"
```

> ⚠️ **Security note:** Critical malware & RCE rules (`curl-pipe-bash`, `reverse-shell`, `obfuscated-base64`, etc.) **cannot be disabled** via `.repoguard.yml`, even if you set them to `off`. This protects against attackers committing a config that hides their malware. These rules will always fire.

---

## Action vs GitHub App

| Feature                   | RepoGuard Action      | RepoGuard GitHub App |
| ------------------------- | --------------------- | -------------------- |
| Setup                     | Add a workflow file   | One-click install    |
| Runs on                   | GitHub's free runners | Your Render server   |
| Detects malware & secrets | ✅                    | ✅                   |
| `repoguard.yml` support   | ✅                    | ✅                   |
| Inline PR suggestions     | ❌                    | ✅                   |
| Automated Fix PRs         | ❌                    | ✅                   |
| `/fix` issue command      | ❌                    | ✅                   |
| Scan history              | ❌                    | ✅                   |
| Cost                      | Free                  | Server hosting cost  |
<!-- | Slack alerts              | ❌                    | ✅                   | -->

**Install the app →** [github.com/apps/repoguard-ifecodes](https://github.com/apps/repoguard-ifecodes)

---

## License

MIT © [IfeCodes](https://github.com/ALADETAN-IFE)

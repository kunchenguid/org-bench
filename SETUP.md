# Setup

## GitHub CLI auth

The operator must authenticate the GitHub CLI before running any benchmark workflow that pushes branches, opens PRs, or reads repo settings.

1. Install `gh` if it is not already available on your `PATH`.
2. Run `gh auth login`.
3. Choose `GitHub.com`.
4. Choose `HTTPS` as the git protocol.
5. When prompted about git credential storage, accept the option that matches your local setup.
6. Authenticate in the browser when `gh` opens the device or browser flow.
7. Verify the session with `gh auth status`.

The benchmark harness assumes `gh auth status` succeeds before it tries to create labels, push run branches, open PRs, or fetch PR snapshots.

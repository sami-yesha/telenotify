# Automatic deploys (hosted service)

Every push to `main` deploys the hosted service by itself (`.github/workflows/deploy.yml`):

1. GitHub runs the API tests and type-checks the portal. If anything fails, nothing is deployed.
2. GitHub's runner connects to the server over SSH with a dedicated deploy key.
3. On the server, that key can only do one thing: `git pull`, then `deploy/auto-deploy.sh` (build, restart, clean old images).
4. The workflow waits until `https://telenotify-api.duckdns.org/health` answers.

Pushes that only change docs, Markdown files or the SDK are not deployed. To deploy by hand, open **Actions → Deploy → Run workflow** on GitHub.

Because GitHub connects from its own network, deploys work even when your own connection to the server is bad.

## One-time setup

### 1. Let the deploy key in (on the server)

In Hostinger's **Browser terminal** (hPanel → VPS → Browser terminal), run this once, as root, all on one line. Replace `PUBLIC_KEY` with the contents of `telenotify_deploy.pub`:

```bash
echo 'command="cd /opt/telenotify && git pull --ff-only && bash deploy/auto-deploy.sh",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty PUBLIC_KEY' >> /root/.ssh/authorized_keys
```

The `command="…"` part is the safety: even if the key leaked, it could only redeploy the current code from GitHub. It can't open a shell, read files or change anything else.

### 2. Give GitHub the private key

On GitHub: repository → **Settings → Secrets and variables → Actions → New repository secret**.

- Name: `DEPLOY_SSH_KEY`
- Secret: the whole contents of the private key file `telenotify_deploy`, including the `-----BEGIN` and `-----END` lines.

Then delete the private key file from your computer. GitHub keeps the only copy, and you can always make a new pair.

### 3. Try it

**Actions → Deploy → Run workflow**. The log shows the build and ends with `Live`.

## If something goes wrong

- **"Add the DEPLOY_SSH_KEY secret"**: step 2 is missing.
- **"Permission denied (publickey)"**: the line from step 1 isn't in `/root/.ssh/authorized_keys`, or the public and private keys don't match.
- **"Host key verification failed"**: the server was rebuilt and has a new SSH host key. Update `SERVER_HOST_KEY` in the workflow with the output of `ssh-keyscan -t ed25519 76.13.159.7`.
- **`git pull` fails**: someone changed a tracked file directly on the server. Run `cd /opt/telenotify && git status` there and undo the change.
- **To stop automatic deploys**: remove the line from `authorized_keys`, or disable the workflow under **Actions**.
- **To roll back**: revert the bad commit on `main` and push; the revert is deployed like any other change.

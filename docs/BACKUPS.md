# Backups

`deploy/backup/backup.sh` runs every night at 02:30 (server time) and:

1. dumps the Postgres database (`pg_dump --format=custom`),
2. adds `deploy/.env.production` (it holds `ENCRYPTION_KEY`; without it live bot tokens and customers' phone numbers, Telegram IDs and messages can't be decrypted),
3. encrypts both with `BACKUP_PASSPHRASE` (AES-256, PBKDF2),
4. keeps the file in `/opt/telenotify/backups` for 14 days,
5. sends a copy to a private Telegram chat, so it survives the loss of the server,
6. sends a Telegram alert if any step fails.

Logs: `/var/log/telenotify-backup.log`.

## One-time setup on the server

1. Create a bot with @BotFather (e.g. "Telenotify Backups"), copy its token, and send it `/start` from your Telegram.
2. On the server:
   ```bash
   cd /opt/telenotify && git pull
   cd deploy/backup && ./install.sh          # creates backup.env and stops
   openssl rand -base64 24                    # a passphrase; save it in your password manager too
   ./telegram-chat-id.sh <backup-bot-token>   # prints your chat id
   nano backup.env                            # fill BACKUP_PASSPHRASE, BACKUP_TELEGRAM_BOT_TOKEN, BACKUP_TELEGRAM_CHAT_ID
   ./install.sh                               # installs the nightly job and runs a first backup
   ```
3. Check that the backup file arrived in Telegram.

**Keep the passphrase outside the server** (password manager). A backup can't be opened without it.

## Restore

```bash
cd /opt/telenotify/deploy
docker compose -f docker-compose.vps.yml stop api
./backup/restore.sh /opt/telenotify/backups/telenotify-YYYYMMDD-HHMMSS.tar.gz.enc   # asks for the passphrase, then type RESTORE
docker compose -f docker-compose.vps.yml start api
```

A backup from Telegram works the same way: copy the file to the server (`scp`) and pass its path.
To look inside a backup without touching live data, restore into a scratch database:
`RESTORE_DB=restore_check ./backup/restore.sh <file>` (create it first with `createdb`).

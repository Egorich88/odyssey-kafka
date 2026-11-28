# Installation and security

## First Docker installation

Download the source tree for the desired tag from [GitHub Releases](https://github.com/Egorich88/odyssey-kafka/releases). The Compose file includes the HTTPS setup and storage initialization services. From the source root, with Docker Compose and Python 3 available:

```bash
export COMPOSE_PROJECT_NAME=odyssey
export ODYSSEY_PUBLIC_HOST=localhost
export ODYSSEY_PUBLIC_ORIGIN=https://localhost:8443
docker compose --profile setup build
docker compose up -d frontend-service
```

Open [the local setup wizard](http://localhost:8787/setup/) and follow its Docker-host command. Automatic setup uses Odyssey Local CA for localhost. On a public DNS name it requires Certbot and successful Let's Encrypt HTTP-01 validation on port 80. For a custom certificate, specify the local PEM chain and matching private key in the command shown by the wizard.

Create the owner in the Docker-host terminal after HTTPS activation. For localhost, download the public CA from the wizard, verify its SHA-256 against the Docker-host command, and explicitly add it to your trust store before opening [Odyssey over HTTPS](https://localhost:8443/).

## Storage and migration

Keep the owner data, separate encryption key, and certificate volumes through upgrades. The encrypted store is intended for one backend process. Preserve the original browser origin during legacy migration, and keep the existing browser data until migrated profiles have been verified. Do not replace an existing encryption key with a new one.

Before adding Kafka profiles, configure the server's allowed Kafka networks and ports. Include both bootstrap and advertised listener endpoints. Kafka TLS/mTLS is independent of browser HTTPS.

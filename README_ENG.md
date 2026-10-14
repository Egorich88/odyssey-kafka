<img width="1254" height="1254" alt="Startt" src="https://github.com/user-attachments/assets/834dcd94-cf62-42b7-97d7-055ec4a46647" />

# Odyssey

[Русский](README.md) | **English**

## Docker Hub Statistics

![ODYSSEY Docker Hub Statistics](https://raw.githubusercontent.com/Egorich88/odyssey-kafka/main/.github/assets/dockerhub-card.svg)


Odyssey is a modern web interface (Kafka Monitoring & Management) for administering
Apache Kafka. Built with Go and React from scratch: from console utilities to
a production-ready microservice with CI/CD, containerization, release
notifications and Kubernetes deployment.

> The project was previously called Kafka System Control (KSC). The new name —
> Odyssey — reflects the essence of the tool: to be a reliable helm and map
> for the engineer in the stormy sea of Apache Kafka data.

## 🌊 Why Odyssey

**A strong brand instead of a faceless name**

Kafka System Control described the technical essence well, but sounded bland
and cumbersome. Odyssey is a short, memorable name that is easy to type in the
console, quick to search for and immediately forms a unique brand.

**A metaphor for SRE and DevOps**

In Greek mythology, Odysseus was a great navigator and captain who passed
through reefs, storms and traps of the raging sea. Apache Kafka is that vast
and unpredictable sea of data, where every day storms with consumer lags,
broker failures and expired SSL certificates. Odyssey acts as a reliable helm
and map for the engineer.

**The spirit of solo development**

Odysseus relied on his own cunning and intellect, winning where entire armies
failed. This reflects the DNA of the project: it is maintained by a single
engineer acting simultaneously as architect, backend and frontend developer.

**Clear positioning**

The word System in the old name could confuse: administrators might think the
project was a replacement for Apache Kafka. The new positioning of Odyssey —
**Kafka Monitoring & Management** — immediately states that it is a visual,
lightweight and powerful tool for control, analysis and management.

## ✨ Features and Development Status

### 📌 Implemented

- ✅ **Intuitive UI** — dark and light themes, sidebar, switching between multiple Kafka clusters.
- ✅ **Sidebar** — fully reworked: collapse, quick logo for switching themes (light/dark).
- ✅ **Custom logo** — the Odyssey brand mark.
- ✅ **Loading page** — displayed inside pages during navigation.
- ✅ **Top horizontal bar** — for pages with selectable display period and auto-refresh time.
- ✅ **Topic management** — view, create, delete, edit configuration (retention, cleanup.policy, etc.).
- ✅ **Message search** — reading messages from a selected partition with offset and limit filters.
- ✅ **Multi-cluster support** — adding clusters with different authentication types (PLAINTEXT, SASL/SCRAM, mTLS planned).
- ✅ **Release notifications** — automatic broadcast to Telegram and MAX on new version, with screenshot and changelog.
- ✅ **CI/CD out of the box** — build, publish images to Docker Hub and create GitHub Release on tag push.
- ✅ **Containerization** — ready-to-use Docker images for backend and frontend.
- ✅ **K8s deployment** — manifests and Terraform for Yandex Cloud.

### 🔄 In progress

- 🛠️ **Overview (dashboard)** — ~90% done. Remaining: connect the backend to the
  "Kafka Certificates" panel, minor visual improvements, add a `critical` level
  to the "Recent Events" panel, rework the "Cluster State" panel, the
  "Consumer Group" panel has been changed — statuses added and display updated.
- 🛠️ **Audit** — done on mock data, minor edits remain.
- 🛠️ **Topics** — works. Message creation needs to be added (either on this page
  or in "Message Search").
- 🛠️ **User** — on mock data.
- 🛠️ **Settings** — interface language selection (only English added so far),
  various known themes.
- 🛠️ **Pages with mock data** — ksqlDB, Schema Registry, Kafka Connect.

### 📝 In development

- ⏳ **Brokers page**.
- ⏳ **Notifications page**.
- ⏳ **Console page** (web-shell for Kafka CLI).
- ⏳ **ACL** — access control list management.
- ⏳ **Consumer group management** — view, reset offsets.

## 🏗️ Architecture

![Architecture diagram](https://github.com/user-attachments/assets/ccdf7bc3-770c-4159-94f3-24129e8ed8bd)

| Component | Technologies |
|---|---|
| Frontend | React, Vite, Axios, CSS Modules |
| Backend | Go, Sarama (Kafka Admin API), net/http |
| Infrastructure | Docker, Docker Compose, GitHub Actions, Docker Hub, Terraform, Yandex Cloud |
| Orchestration | Kubernetes (Yandex Managed Kubernetes) |
| Notifications | Telegram Bot API, MAX Bot API |

## 🚀 Quick Start

### Local development

1. Clone the repository:

    ```bash
    git clone https://github.com/Egorich88/odyssey-kafka.git
    cd odyssey-kafka
    ```

2. Start the backend (requires running Kafka on `localhost:9092`):

    ```bash
    cd backend
    go run main.go
    ```

3. Start the frontend (in another terminal):

    ```bash
    cd frontend
    npm install
    npm run dev
    ```

4. Open `http://localhost:5173` — the interface is ready.

### Docker Compose (all-in-one)

```bash
docker-compose up --build
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8080/api/topics`

## 🔁 CI/CD (GitHub Actions)

The workflow is split into three independent jobs:

- **verify** — runs on push to `main`. Only builds backend and frontend to
  verify the code compiles. Nothing is published to Docker Hub.
- **release** — runs only on tag `v*`. Builds and publishes images to Docker
  Hub, creates GitHub Release.
- 🧪 **deploy-to-kubernetes** — runs only manually via `workflow_dispatch` with
  the `deploy=true` flag.

Published images:

- `egorich27/kafka-control-backend`
- `egorich27/kafka-control-frontend`

## 🔔 Release Notifications

When a new `v*` tag is pushed, a notification is automatically sent to two channels:

- **Telegram** — message with changelog and release screenshot.
- **MAX** — message with changelog and attached image.

Notifications are generated from commits between the previous and the current tag.
Screenshots are stored in `docs/screenshots/` and matched by name equal to the
tag (e.g. `v4.2.24.png`).

## 📦 Releases

Full version history is available on the
[Releases](https://github.com/Egorich88/odyssey-kafka/releases) page.

Each release includes:

- Ready-to-use Docker images.
- Detailed changelog, automatically generated from commits.
- Source code archive.

## 🤝 Author

**Egorich88**

The project was created as a demonstration of modern DevOps practices:
from console scripts to production-ready microservices with full CI/CD.

> "Movement – life!"

## 📄 License

This project is licensed under the **Apache License 2.0**.
See [LICENSE](LICENSE) for details.

## ⚠️ Trademark

The name "Kafka" and the Kafka logo are registered trademarks of
The Apache Software Foundation (ASF). Odyssey is an independent open-source
tool designed to manage Apache Kafka clusters. Odyssey is not part of Apache
Kafka, not endorsed or sponsored by ASF. All references to "Kafka" are used
purely in a technical sense to denote compatible technology.

## Powered by

<img width="461" height="176" alt="Монтажная область 1" src="https://github.com/user-attachments/assets/65593be3-d1f2-4c96-90a3-210702ea3c29" />
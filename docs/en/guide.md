# User guide

## Kafka connections

Use one or more bootstrap addresses and choose the authentication mode for the listener. Odyssey supports PLAINTEXT, mTLS, and SASL over TLS with PLAIN or SCRAM-SHA-256/512. GSSAPI is temporarily disabled. Kafka 3.x in ZooKeeper mode and Kafka 4.x in KRaft mode connect through the Kafka protocol.

## Screens

| Screen | What it shows or does |
| --- | --- |
| Overview | Cluster KPIs, brokers, certificates, throughput, consumer groups, and events. |
| Brokers | Broker addresses and available broker metadata. Expanded Overview offers cards, a list, search, and filters. |
| Topics | Topics, partitions, and configuration. Mutations require owner authorization and Kafka permissions. |
| Consumer Groups | Group state, members, offsets, and lag when available. |
| Search | Reads messages from the selected topic using the configured search parameters. |
| ACL | Shows and manages Kafka authorization rules when broker permissions allow it. |

## Monitoring and troubleshooting

Odyssey uses the Kafka protocol and derives throughput from observed offset changes. An unknown broker state means there is insufficient availability evidence. Disk data, Kafka version, and controller roles depend on available evidence. CPU, memory, and continuous cluster uptime may be unavailable. Missing values appear as N/A.

If a connection fails, check the allowed server-side addresses and ports, advertised listeners, TLS chain, credentials, and Kafka ACLs. Settings contains language, themes, and version checks. In Docker, HTTPS settings show certificate details and local replacement or renewal commands. Upgrade using the release instructions and preserve the private volumes.

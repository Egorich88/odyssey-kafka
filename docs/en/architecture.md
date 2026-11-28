# Architecture

The React and Vite frontend calls the Go REST backend. The backend uses IBM Sarama for Kafka metadata, administrative operations, and monitoring. Kafka permissions still apply to owner-authorized administrative actions.

Core provides one local owner, server sessions, CSRF protection, encrypted server-side Kafka profiles and outbound Kafka address restrictions. The encryption key is stored separately. The Compose installation terminates browser TLS in Nginx and verifies the backend certificate when proxying to the Go service.

The public build provides the Core interface and exposes the `@odyssey/registry` extension contract. The public Enterprise registry is empty. Enterprise modules are distributed separately.

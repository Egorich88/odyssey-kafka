# ==========================================
# STAGE 1: СБОРКА СТАТИКИ (BUILDER)
# ==========================================
# Node 18 устарел (EOL). Переходим на актуальную стабильную LTS-версию Node 24.
FROM node:24-alpine AS builder

WORKDIR /app

# Копируем манифесты зависимостей
COPY package*.json ./

# Чистая установка строго по package-lock.json без изменения самого файла
RUN npm ci && npm cache clean --force

# Копируем исходный код фронтенда
COPY . .

# Сборка production-bundle (на выходе папка dist)
RUN npm run build

# ==========================================
# STAGE 2: PRODUCTION (БЕЗОПАСНЫЙ ROOTLESS NGINX)
# ==========================================
# Используем ОФИЦИАЛЬНЫЙ unprivileged-образ от создателей Nginx на базе стабильного Alpine
FROM nginxinc/nginx-unprivileged:stable-alpine

# Конфигурация HTTPS и проверяемого TLS-соединения с backend.
COPY --chmod=0555 https-context.sh /docker-entrypoint.d/35-odyssey-context.sh
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Копируем собранную статику из первого стейджа в стандартную директорию Nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# Публичный HTTPS; API повторно шифруется до backend с проверкой сертификата.
EXPOSE 8443

# Метаданные образа
LABEL org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.source="https://github.com/Egorich88/odyssey-kafka"

# Инструкция USER и CMD уже встроены в базовый образ nginxinc, дублировать их не требуется.
# Контейнер автоматически запустится в безопасном rootless-режиме.

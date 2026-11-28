# HTTPS в Docker

Для проверки используйте отдельный проект Compose. Запускайте из корня этой ветки в Ubuntu/WSL с доступным Docker Engine и Python 3.

```bash
export COMPOSE_PROJECT_NAME="odyssey-https-test-$(date +%s)"
export ODYSSEY_SETUP_PORT=18787 ODYSSEY_HTTPS_PORT=19443
export ODYSSEY_PUBLIC_HOST=localhost ODYSSEY_PUBLIC_ORIGIN=https://localhost:19443
export ODYSSEY_HTTPS_BIND=127.0.0.1
unset COMPOSE_PROFILES ODYSSEY_KAFKA_ALLOWED_NETWORKS ODYSSEY_KAFKA_ALLOWED_PORTS
docker compose --profile setup build
docker compose up -d frontend-service
```

Откройте http://localhost:18787/setup/. В мастере выберите автоматическую настройку и выполните команду из мастера в WSL.

```bash
python3 docker/https_setup.py --project "$COMPOSE_PROJECT_NAME"
```

Введите новый тестовый пароль в терминале. В браузере появится шаг «Доверие сертификату». Скачайте публичный CA и сравните SHA-256 файла с выводом команды из мастера. На Windows используйте `Get-FileHash` в PowerShell. После сверки откройте сертификат и подтвердите установку для текущего пользователя в хранилище «Доверенные корневые центры сертификации». Chrome использует это хранилище для локального доверия. После установки нажмите «Повторно открыть Odyssey по HTTPS». После входа выберите «Настройки → Безопасность · HTTPS».

```bash
docker compose restart
curl --fail --cacert "/tmp/$COMPOSE_PROJECT_NAME-ca.crt" "$ODYSSEY_PUBLIC_ORIGIN/api/health"
```

**Свой сертификат.** Задайте публичный хост и соответствующий HTTPS origin до запуска Compose. Подготовьте fullchain PEM (листовой сертификат первым), отдельный ключ PEM без парольной фразы с приватными правами на хосте и при необходимости публичный корневой CA. Команда использует локальные монтирования только для чтения.

```bash
python3 docker/https_setup.py --project "$COMPOSE_PROJECT_NAME" --mode custom \
  --cert /absolute/fullchain.pem --key /absolute/server.key --ca /absolute/root-ca.pem
```

**Let’s Encrypt.** Нужны установленный на хосте Certbot, публичный DNS, доступный извне TCP 80 для HTTP-01 и права на его привязку. Также настройте доступ клиентов к опубликованному HTTPS-порту. Автоматический режим на публичном имени вызывает Certbot и применяет выданный fullchain. Для повторного выпуска запустите ту же команду с `--renew`. Отдельно запланируйте регулярное продление и применение сертификата.

**Восстановление после аварии.** Если предыдущий процесс CLI точно остановлен, выполните `python3 docker/https_setup.py --project "$COMPOSE_PROJECT_NAME" --recover`. Завершённая активация определяется по идентификатору поколения. Для незавершённой активации восстанавливается прежняя ссылка на сертификат и перечитывается конфигурация Nginx. После этого можно повторить выбранный способ настройки. Если HTTPS уже подтверждён, а ввод пароля прервался, используйте `docker compose run --rm owner-init`.

Для остановки только тестовой установки используйте `docker compose stop` из того же терминала с тем же значением COMPOSE_PROJECT_NAME. Тома сохранятся.

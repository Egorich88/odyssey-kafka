# HTTPS в Docker

Запускайте из корня исходников выбранного релиза на хосте с Docker Compose и Python 3. Выберите постоянное имя проекта для сохранения томов между запусками. Для отдельной проверки используйте другое имя проекта и свободные порты.

```bash
export COMPOSE_PROJECT_NAME=odyssey
export ODYSSEY_SETUP_PORT=8787 ODYSSEY_HTTPS_PORT=8443
export ODYSSEY_PUBLIC_HOST=localhost ODYSSEY_PUBLIC_ORIGIN=https://localhost:8443
export ODYSSEY_HTTPS_BIND=127.0.0.1
docker compose --profile setup build
docker compose up -d frontend-service
```

Откройте http://localhost:8787/setup/. В мастере выберите автоматическую настройку и выполните показанную команду на Docker-хосте. Перед созданием Kafka-профилей задайте [политику адресов](docker-owner.md).

```bash
python3 docker/https_setup.py --project "$COMPOSE_PROJECT_NAME"
```

Задайте пароль владельца в терминале Docker-хоста. В браузере появится шаг «Доверие сертификату». Скачайте публичный CA и сравните SHA-256 файла с выводом команды из мастера. На Windows используйте `Get-FileHash` в PowerShell. После сверки откройте сертификат и подтвердите установку для текущего пользователя в хранилище «Доверенные корневые центры сертификации». Chrome использует это хранилище для локального доверия. После установки нажмите «Повторно открыть Odyssey по HTTPS». После входа выберите «Настройки → Безопасность · HTTPS».

```bash
docker compose restart
docker compose exec -T frontend-service cat /run/tls/ca.crt > "/tmp/$COMPOSE_PROJECT_NAME-ca.crt"
curl --fail --cacert "/tmp/$COMPOSE_PROJECT_NAME-ca.crt" "$ODYSSEY_PUBLIC_ORIGIN/api/health"
```

**Свой сертификат.** Задайте публичный хост и соответствующий HTTPS origin до запуска Compose. Подготовьте fullchain PEM (листовой сертификат первым), отдельный ключ PEM без парольной фразы с приватными правами на хосте и при необходимости публичный корневой CA. Команда использует локальные монтирования только для чтения.

```bash
python3 docker/https_setup.py --project "$COMPOSE_PROJECT_NAME" --mode custom \
  --cert /absolute/fullchain.pem --key /absolute/server.key --ca /absolute/root-ca.pem
```

**Let’s Encrypt.** Нужны установленный на хосте Certbot, публичный DNS, доступный извне TCP 80 для HTTP-01 и права на его привязку. Также настройте доступ клиентов к опубликованному HTTPS-порту. Автоматический режим на публичном имени вызывает Certbot и применяет выданный fullchain. Для повторного выпуска запустите ту же команду с `--renew`. Отдельно запланируйте регулярное продление и применение сертификата.

**Восстановление после аварии.** Если предыдущий процесс CLI точно остановлен, выполните `python3 docker/https_setup.py --project "$COMPOSE_PROJECT_NAME" --recover`. Завершённая активация определяется по идентификатору поколения. Для незавершённой активации восстанавливается прежняя ссылка на сертификат и перечитывается конфигурация Nginx. После этого можно повторить выбранный способ настройки. Если HTTPS уже подтверждён, а ввод пароля прервался, используйте `docker compose run --rm owner-init`.

Для остановки выбранной установки используйте `docker compose stop` из того же терминала с тем же значением COMPOSE_PROJECT_NAME. Тома сохранятся.

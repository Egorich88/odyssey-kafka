// Запускается только явно; использует отдельный проект, порт и синтетические профили.
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import https from 'node:https';
import assert from 'node:assert/strict';

if (!process.argv.includes('--run')) {
  console.log('Для изолированной контейнерной проверки: node docker/smoke.mjs --run');
  process.exit(0);
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const docker = process.env.DOCKER_BIN || 'docker';
const project = `odyssey-smoke-${randomUUID()}`;
const temporary = mkdtempSync(join(tmpdir(), project));
const emptyEnv = join(temporary, 'empty.env');
const override = join(temporary, 'compose.yaml');
writeFileSync(emptyEnv, '');
writeFileSync(override, `services:\n  owner-storage-init:\n    image: ${project}-backend\n  owner-init:\n    image: ${project}-backend\n  backend-service:\n    image: ${project}-backend\n  frontend-service:\n    image: ${project}-frontend\n  https-manager:\n    image: ${project}-tls\n  tls-init:\n    image: ${project}-tls\n`);
const port = await new Promise((resolvePort, reject) => {
  const socket = createServer();
  socket.once('error', reject);
  socket.listen(0, '127.0.0.1', () => { const { port } = socket.address(); socket.close(() => resolvePort(port)); });
});
const origin = `https://localhost:${port}`;
const env = { ...process.env, COMPOSE_PROFILES: '', ODYSSEY_HTTPS_BIND: '127.0.0.1', ODYSSEY_HTTPS_PORT: String(port),
  ODYSSEY_SETUP_PORT: '0', ODYSSEY_PUBLIC_HOST: 'localhost', ODYSSEY_PUBLIC_ORIGIN: origin,
  ODYSSEY_KAFKA_ALLOWED_NETWORKS: '192.0.2.0/24', ODYSSEY_KAFKA_ALLOWED_PORTS: '9092' };
const args = ['compose', '--env-file', emptyEnv, '-p', project, '-f', join(root, 'docker-compose.yml'), '-f', override];
function compose(command, { input, allowFailure = false } = {}) {
  const result = spawnSync(docker, [...args, ...command], { cwd: root, env, input, encoding: 'utf8', timeout: 600000, maxBuffer: 8 << 20 });
  // Вывод не печатается: даже сбой теста не должен раскрыть пароль или cookie.
  if (!allowFailure && result.status !== 0) throw new Error(`Docker smoke: ошибка этапа ${command[0]} (вывод скрыт)`);
  return result;
}
const password = randomBytes(32).toString('base64url');
let ca;
let cookie = '';
let csrf = '';
async function request(method, path, value, authorized = true) {
  return new Promise((resolveResponse, reject) => {
    const body = value === undefined ? undefined : JSON.stringify(value);
    const r = https.request(origin + path, { method, ca, rejectUnauthorized: true, timeout: 10000,
      // IPv4 соответствует явной привязке порта; hostname/SNI остаётся localhost.
      family: 4,
      headers: { Origin: origin, 'Content-Type': 'application/json', ...(authorized ? { Cookie: cookie, 'X-CSRF-Token': csrf } : {}) } }, response => {
      const parts = [];
      let size = 0;
      response.on('data', part => { size += part.length; if (size > 128 * 1024) r.destroy(new Error('Ответ слишком велик')); else parts.push(part); });
      response.on('end', () => resolveResponse({ status: response.statusCode, body: Buffer.concat(parts).toString(), cookie: response.headers['set-cookie']?.[0] }));
    });
    r.on('timeout', () => r.destroy(new Error('Таймаут HTTPS')));
    r.on('error', reject);
    r.end(body);
  });
}
async function login() {
  const response = await request('POST', '/api/auth/login', { password }, false);
  assert.equal(response.status, 200);
  assert.match(response.cookie, /; Secure/i);
  assert.match(response.cookie, /; HttpOnly/i);
  assert.match(response.cookie, /SameSite=Strict/i);
  cookie = response.cookie.split(';')[0];
  csrf = JSON.parse(response.body).csrfToken;
}
async function waitHealthy() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try { if ((await request('GET', '/api/health', undefined, false)).status === 200) return; } catch { /* Контейнер ещё запускается. */ }
    await new Promise(resolveWait => setTimeout(resolveWait, 1000));
  }
  throw new Error('Контейнеры не стали готовы');
}
try {
  compose(['build', 'backend-service', 'frontend-service', 'tls-init']);
  compose(['run', '--rm', 'owner-storage-init']);
  assert.notEqual(compose(['--profile', 'setup', 'run', '--rm', '-T', 'owner-init'], {input: password + '\n', allowFailure:true}).status, 0);
  compose(['up', '-d', 'frontend-service']);
  const generation = randomUUID().replaceAll('-', '');
  const manager = ['run', '--rm', '-T', '--no-deps', 'https-manager'];
  compose([...manager, 'prepare', generation, 'local']);
  compose(['exec', '-T', 'frontend-service', 'nginx', '-t']);
  compose(['exec', '-T', 'frontend-service', 'nginx', '-s', 'reload']);
  compose([...manager, 'finish', generation]);
  compose([...manager, 'unlock', generation]);
  compose(['--profile', 'setup', 'run', '--rm', '-T', 'owner-init'], { input: password + '\n' });
  assert.notEqual(compose(['--profile', 'setup', 'run', '--rm', '-T', 'owner-init'], { input: password + '\n', allowFailure: true }).status, 0);
  compose(['up', '-d', 'frontend-service']);
  ca = compose(['run', '--rm', '--no-deps', '--entrypoint', 'cat', 'tls-init', '/state/ca/ca.crt']).stdout;
  await waitHealthy();
  assert.equal((await request('GET', '/api/kafka-profiles', undefined, false)).status, 401);
  await login();
  const validCSRF = csrf;
  csrf = '';
  assert.equal((await request('POST', '/api/kafka-profiles', { name: 'denied', config: { brokers: '192.0.2.1:9092', authType: 'PLAINTEXT' } })).status, 401);
  csrf = validCSRF;
  assert.equal(JSON.parse((await request('GET', '/api/kafka-profiles')).body).length, 0);
  const response = await request('POST', '/api/kafka-profiles', { name: 'synthetic', config: {
    brokers: '192.0.2.1:9092,192.0.2.2:9092', authType: 'SASL', saslMechanism: 'SCRAM-SHA-512', username: 'synthetic', password: 'synthetic-kafka-secret' } });
  assert.equal(response.status, 201);
  const id = JSON.parse(response.body).id;
  assert.ok(id);
  assert.equal(response.body.includes('synthetic-kafka-secret'), false);
  // Регистрация профиля не подключается к Kafka. Kafka-контейнер не запускается.
  compose(['restart', 'backend-service']);
  await waitHealthy();
  assert.equal((await request('GET', '/api/kafka-profiles')).status, 401);
  await login();
  const persisted = await request('GET', '/api/kafka-profiles');
  assert.equal(persisted.status, 200);
  assert.equal(JSON.parse(persisted.body)[0].id, id);
  assert.equal(persisted.body.includes('synthetic-kafka-secret'), false);
  console.log('Docker smoke: HTTPS, owner-init, сессия, CSRF-контракт и сохранность профиля после restart проверены.');
} finally {
  // Удаляем только уникальный синтетический проект этого запуска, никогда odyssey.
  if (/^odyssey-smoke-[a-f0-9-]{36}$/.test(project)) compose(['down', '--volumes', '--remove-orphans'], { allowFailure: true });
  rmSync(temporary, { recursive: true, force: true });
}

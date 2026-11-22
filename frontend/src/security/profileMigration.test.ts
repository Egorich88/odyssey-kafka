// @vitest-environment jsdom
import axios from 'axios';
import { afterEach, expect, it, vi } from 'vitest';
import { migrateLegacyProfiles, profileConfig } from './profileMigration';
vi.mock('axios', () => ({ default: { post: vi.fn() } }));
afterEach(() => { localStorage.clear(); vi.resetAllMocks(); });
const profiles = [{ id: 'legacy-a', brokers: 'a.test:9092', password: 'synthetic-password' }, { id: 'legacy-b', brokers: 'a.test:9092', authType: 'MTLS', key: 'synthetic-key' }];
it('удаляет старые секреты только после переноса всех профилей и сохраняет выбранное подключение', async () => {
  localStorage.setItem('kafka_clusters', JSON.stringify(profiles)); localStorage.setItem('ksc_current_cluster_id','legacy-b');
  vi.mocked(axios.post).mockImplementation(async (_url, body) => {
    expect(localStorage.getItem('kafka_clusters')).not.toBeNull();
    const id=(body as {migrationKey:string}).migrationKey;
    return {data:{id:'server-'+id,brokers:'a.test:9092',revision:1}};
  });
  await migrateLegacyProfiles(localStorage);
  expect(localStorage.getItem('kafka_clusters')).toBeNull();
  expect(localStorage.getItem('ksc_current_cluster_id')).toBe('server-legacy:legacy-b');
  expect(JSON.stringify(localStorage)).not.toContain('synthetic');
});
it('сохраняет исходную конфигурацию и ID при частичном сбое и повторяет с теми же ключами миграции', async () => {
  const raw=JSON.stringify(profiles);localStorage.setItem('kafka_clusters',raw);localStorage.setItem('ksc_current_cluster_id','legacy-b');
  vi.mocked(axios.post).mockResolvedValueOnce({data:{id:'a',brokers:'a.test:9092',revision:1}}).mockRejectedValueOnce(new Error('failure'));
  await expect(migrateLegacyProfiles(localStorage)).rejects.toThrow();
  expect(localStorage.getItem('kafka_clusters')).toBe(raw);expect(localStorage.getItem('ksc_current_cluster_id')).toBe('legacy-b');
  vi.mocked(axios.post).mockResolvedValue({data:{id:'a',brokers:'a.test:9092',revision:1}});
  await migrateLegacyProfiles(localStorage);
  expect(vi.mocked(axios.post).mock.calls[0][1]).toMatchObject({migrationKey:'legacy:legacy-a'});
  expect(vi.mocked(axios.post).mock.calls[2][1]).toMatchObject({migrationKey:'legacy:legacy-a'});
});
it('не переносит повреждённые записи и не удаляет их', async () => {
  localStorage.setItem('kafka_clusters','{"invalid":true}');
  await expect(migrateLegacyProfiles(localStorage)).rejects.toThrow();
  expect(axios.post).not.toHaveBeenCalled();expect(localStorage.getItem('kafka_clusters')).not.toBeNull();
});
it('удаляет неиспользуемые Kerberos-пути обычного профиля, не маскирует GSSAPI', () => {
  expect(profileConfig({authType:'SASL',saslMechanism:'SCRAM-SHA-512',kerberosConfigPath:'/old/default'})).not.toHaveProperty('kerberosConfigPath');
  expect(profileConfig({authType:'SASL_GSSAPI',kerberosConfigPath:'/configured'})).toHaveProperty('kerberosConfigPath','/configured');
});

it('не удаляет исходную запись, изменённую во время серверного переноса', async () => {
  localStorage.setItem('kafka_clusters',JSON.stringify(profiles));
  const changed=JSON.stringify([...profiles,{id:'new-local',brokers:'new.test:9092'}]);
  vi.mocked(axios.post).mockImplementation(async()=>{localStorage.setItem('kafka_clusters',changed);return {data:{id:'server',brokers:'a.test:9092',revision:1}};});
  await expect(migrateLegacyProfiles(localStorage)).rejects.toThrow('Migration interrupted');
  expect(localStorage.getItem('kafka_clusters')).toBe(changed);
});

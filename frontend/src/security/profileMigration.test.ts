// @vitest-environment jsdom
import axios from 'axios';
import { afterEach, expect, it, vi } from 'vitest';
import { migrateLegacyProfiles, ProfileMigrationIncomplete, profileConfig } from './profileMigration';
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

it.each([400,403,409,413,422])('продолжает перенос после отказа одной записи (%i), сохраняя исходный список', async status => {
  const records=[{id:'invalid',brokers:'rrr'},...profiles];
  const original=JSON.stringify(records);
  localStorage.setItem('kafka_clusters',original);localStorage.setItem('ksc_current_cluster_id','legacy-b');
  vi.mocked(axios.post).mockRejectedValueOnce({response:{status}}).mockImplementation(async(_url,body)=>({data:{id:'server-'+body.migrationKey,brokers:'a.test:9092',revision:1}}));
  let problem:unknown;try{await migrateLegacyProfiles(localStorage)}catch(error){problem=error}
  expect(problem).toBeInstanceOf(ProfileMigrationIncomplete);
  expect(problem).toMatchObject({migrated:2,failed:1,selectedServerId:'server-legacy:legacy-b'});
  expect(axios.post).toHaveBeenCalledTimes(3);
  expect(localStorage.getItem('kafka_clusters')).toBe(original);
  expect(localStorage.getItem('ksc_current_cluster_id')).toBe('legacy-b');
  expect(JSON.stringify(problem)).not.toContain('synthetic');
});

it('обрабатывает независимые записи после повреждённых элементов и дублирующих ID', async () => {
  const records=[null,{id:'duplicate'},{id:'duplicate'},profiles[0],5,profiles[1]];
  const original=JSON.stringify(records);localStorage.setItem('kafka_clusters',original);
  vi.mocked(axios.post).mockResolvedValue({data:{id:'server',brokers:'a.test:9092',revision:1}});
  await expect(migrateLegacyProfiles(localStorage)).rejects.toMatchObject({migrated:2,failed:4});
  expect(axios.post).toHaveBeenCalledTimes(2);expect(localStorage.getItem('kafka_clusters')).toBe(original);
});

it.each([401,429,500])('останавливает отправку при потере сессии или доступности backend (%i)', async status => {
  const original=JSON.stringify(profiles);localStorage.setItem('kafka_clusters',original);
  vi.mocked(axios.post).mockRejectedValueOnce({response:{status},message:'synthetic-secret'});
  await expect(migrateLegacyProfiles(localStorage)).rejects.toThrow('Migration unavailable');
  expect(axios.post).toHaveBeenCalledTimes(1);expect(localStorage.getItem('kafka_clusters')).toBe(original);
});

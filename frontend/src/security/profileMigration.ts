import axios from 'axios';

export interface ServerProfile {
  id: string; name: string; brokers: string; authType: string; saslMechanism: string; revision: number;
}

const configKeys = ['authType', 'username', 'password', 'cert', 'key', 'ca', 'saslMechanism',
  'kerberosUsername', 'kerberosPassword', 'kerberosRealm', 'kerberosServiceName', 'kerberosConfigPath', 'kerberosKeytabPath'];

export function profileConfig(profile: Record<string, unknown>) {
  const config: Record<string, string> = { brokers: String(profile.brokers || profile.bootstrapServers || ''), authType: 'PLAINTEXT' };
  for (const key of configKeys) if (typeof profile[key] === 'string') config[key] = profile[key];
  // Старые формы заполняли krb5.conf по умолчанию даже для PLAINTEXT/SCRAM.
  const kerberos = config.authType.toUpperCase() === 'SASL_GSSAPI' || ['GSSAPI', 'KERBEROS'].includes((config.saslMechanism || '').toUpperCase());
  if (!kerberos) for (const key of configKeys.filter(key => key.startsWith('kerberos'))) delete config[key];
  return config;
}

export function validServerProfile(value: unknown): value is ServerProfile {
  if (!value || typeof value !== 'object') return false;
  const p = value as ServerProfile;
  return typeof p.id === 'string' && p.id.length > 0 && typeof p.brokers === 'string' && Number.isSafeInteger(p.revision) && p.revision > 0;
}

export async function migrateLegacyProfiles(storage: Storage, signal?: AbortSignal) {
  const raw = storage.getItem('kafka_clusters');
  if (!raw) return;
  const records: unknown = JSON.parse(raw);
  if (!Array.isArray(records) || records.some(p => !p || typeof p !== 'object' || typeof p.id !== 'string')) throw new Error('Invalid legacy profiles');
  if (new Set(records.map(p => p.id)).size !== records.length) throw new Error('Duplicate legacy IDs');
  const selected = storage.getItem('ksc_current_cluster_id');
  const mapping = new Map<string, string>();
  for (const record of records) {
    const response = await axios.post<ServerProfile>('/api/kafka-profiles', {
      name: String(record.name || ''), config: profileConfig(record), migrationKey: `legacy:${record.id}`,
    }, { signal, timeout: 10000 });
    if (signal?.aborted || !validServerProfile(response.data)) throw new Error('Invalid profile response');
    mapping.set(record.id, response.data.id);
  }
  // До подтверждения ВСЕХ записей не меняем исходные профили или выбранный ID.
  // При частичном сбое серверная MigrationKey позволяет повторить перенос.
  if (signal?.aborted || storage.getItem('kafka_clusters') !== raw) throw new Error('Migration interrupted');
  if (selected && mapping.has(selected)) storage.setItem('ksc_current_cluster_id', mapping.get(selected)!);
  storage.removeItem('kafka_clusters');
}

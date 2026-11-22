import axios from 'axios';

export interface ServerProfile {
  id: string; name: string; brokers: string; authType: string; saslMechanism: string; revision: number;
}

export class ProfileMigrationIncomplete extends Error {
  constructor(readonly migrated: number, readonly failed: number, readonly selectedServerId?: string) {
    super('Profile migration incomplete');
  }
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
  if (!Array.isArray(records)) throw new Error('Invalid legacy profiles');
  const counts = new Map<string, number>();
  for (const record of records) if (record && typeof record === 'object' && typeof record.id === 'string') counts.set(record.id, (counts.get(record.id) ?? 0) + 1);
  const selected = storage.getItem('ksc_current_cluster_id');
  const mapping = new Map<string, string>();
  let failed = 0;
  for (const record of records) {
    if (signal?.aborted) throw new Error('Migration interrupted');
    if (!record || typeof record !== 'object' || typeof record.id !== 'string' || !record.id || counts.get(record.id) !== 1) {
      failed++; continue;
    }
    try {
      const response = await axios.post<ServerProfile>('/api/kafka-profiles', {
        name: String(record.name || ''), config: profileConfig(record), migrationKey: `legacy:${record.id}`,
      }, { signal, timeout: 10000 });
      if (signal?.aborted || !validServerProfile(response.data)) throw new Error('Invalid profile response');
      mapping.set(record.id, response.data.id);
    } catch (error) {
      if (signal?.aborted) throw new Error('Migration interrupted');
      const status = (error as { response?: { status?: number } })?.response?.status;
      // Продолжаем только после ошибки отдельной записи. Потеря сессии,
      // транспорта или доступности сервера останавливает отправку секретов.
      if (![400, 403, 409, 413, 422].includes(status ?? 0)) throw new Error('Migration unavailable');
      failed++;
    }
  }
  // До подтверждения ВСЕХ записей не меняем исходные профили или выбранный ID.
  // При частичном сбое серверная MigrationKey позволяет повторить перенос.
  if (signal?.aborted || storage.getItem('kafka_clusters') !== raw) throw new Error('Migration interrupted');
  if (failed) throw new ProfileMigrationIncomplete(mapping.size, failed, selected ? mapping.get(selected) : undefined);
  if (selected && mapping.has(selected)) storage.setItem('ksc_current_cluster_id', mapping.get(selected)!);
  storage.removeItem('kafka_clusters');
}

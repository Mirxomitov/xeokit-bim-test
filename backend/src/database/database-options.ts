import type { DataSourceOptions } from 'typeorm';
import { BIM_ENTITIES } from '../bim/bim.entities';
import { MIGRATIONS } from './migrations';

export function databaseOptions(url: string): Extract<DataSourceOptions, { type: 'postgres' }> {
  return {
    type: 'postgres',
    url,
    connectTimeoutMS: 5_000,
    entities: BIM_ENTITIES,
    migrations: MIGRATIONS,
    migrationsTableName: 'typeorm_migrations',
    migrationsTransactionMode: 'each',
    synchronize: false,
    // Local test project: migrate on startup. CIP runs them as a separate release step.
    migrationsRun: true,
    logging: ['error', 'warn', 'migration'],
  };
}

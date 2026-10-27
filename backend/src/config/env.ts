import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

/** The only place that reads process.env (as in CIP). Messages name variables, never values. */
export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

const schema = z.object({
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8091),
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'must be a postgres:// URL'),
  MODELS_DIR: z.string().default('models'),
});

export interface AppConfig {
  host: string;
  port: number;
  databaseUrl: string;
  /** Absolute path of the folder with the .xkt files. */
  modelsDir: string;
}

export function loadLocalEnvFile(): void {
  if (existsSync('.env')) process.loadEnvFile('.env');
}

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const result = schema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new ConfigError(`Invalid configuration:\n  ${problems.join('\n  ')}`);
  }
  const { HOST, PORT, DATABASE_URL, MODELS_DIR } = result.data;
  return { host: HOST, port: PORT, databaseUrl: DATABASE_URL, modelsDir: resolve(MODELS_DIR) };
}

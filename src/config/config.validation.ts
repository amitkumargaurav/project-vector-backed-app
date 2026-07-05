import { z } from 'zod';

function hasGoogleClientId(value?: string) {
  return Boolean(value?.split(',').some((clientId) => clientId.trim()));
}

export const configValidationSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  API_PREFIX: z.string().default('api'),
  CORS_ORIGINS: z.string().default(''),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),
  GOOGLE_CLIENT_ID: z.string().trim().min(1).optional(),
  GOOGLE_CLIENT_IDS: z.string().optional(),
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4.1-mini'),
  EMAIL_FROM: z.string().optional(),
  EMAIL_API_KEY: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  LOG_LEVEL: z.string().default('info'),
  OFFLINE_BOOTSTRAP_PAST_DAYS: z.coerce.number().default(90),
  OFFLINE_BOOTSTRAP_FUTURE_DAYS: z.coerce.number().default(30),
  DEFAULT_HISTORY_BEFORE_DAYS: z.coerce.number().default(7),
  DEFAULT_HISTORY_AFTER_DAYS: z.coerce.number().default(7),
  DEFAULT_GRAPH_DAILY_DAYS: z.coerce.number().default(30),
  DEFAULT_GRAPH_WEEKLY_WEEKS: z.coerce.number().default(12),
  DEFAULT_GRAPH_MONTHLY_MONTHS: z.coerce.number().default(12),
  MAX_SYNC_ACTIONS_PER_PUSH: z.coerce.number().default(100),
  MAX_NOTIFICATIONS_PER_DAY: z.coerce.number().default(3),
}).refine((config) => Boolean(config.GOOGLE_CLIENT_ID) || hasGoogleClientId(config.GOOGLE_CLIENT_IDS), {
  message: 'GOOGLE_CLIENT_ID or GOOGLE_CLIENT_IDS is required',
  path: ['GOOGLE_CLIENT_ID'],
});

export function validateConfig(config: Record<string, unknown>) {
  const parsed = configValidationSchema.safeParse(config);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
  }
  return parsed.data;
}

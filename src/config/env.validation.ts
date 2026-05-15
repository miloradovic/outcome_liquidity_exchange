import Joi from 'joi';

const DEV_DB_PASSWORD = 'exchange';
const DEV_JWT_SECRET = 'dev-only-change-this-secret-1234567890';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(3000),
  DB_HOST: Joi.string().default('localhost'),
  DB_PORT: Joi.number().port().default(5432),
  DB_USER: Joi.string().default('exchange'),
  DB_PASSWORD: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().min(12).required().invalid(DEV_DB_PASSWORD),
    otherwise: Joi.string().default(DEV_DB_PASSWORD),
  }),
  DB_NAME: Joi.string().default('exchange'),
  DB_SSL: Joi.boolean().default(false),
  DB_SSL_REJECT_UNAUTHORIZED: Joi.boolean().default(true),
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().port().default(6379),
  REDIS_KEY_PREFIX: Joi.string().trim().min(1).default('olx'),
  AUTH_USER_CACHE_TTL_SECONDS: Joi.number().integer().min(1).default(15),
  JWT_SECRET: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().min(32).required().invalid(DEV_JWT_SECRET),
    otherwise: Joi.string().min(32).default(DEV_JWT_SECRET),
  }),
  JWT_EXPIRES_IN: Joi.string().default('1d'),
  SWAGGER_ENABLED: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.boolean().default(false),
    otherwise: Joi.boolean().default(true),
  }),
  HTTP_ALLOWED_ORIGINS: Joi.string().default('http://localhost:3001'),
  WS_ALLOWED_ORIGINS: Joi.string().default('http://localhost:3001'),
});

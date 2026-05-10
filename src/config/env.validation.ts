import Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(3000),
  DB_HOST: Joi.string().default('localhost'),
  DB_PORT: Joi.number().port().default(5432),
  DB_USER: Joi.string().default('exchange'),
  DB_PASSWORD: Joi.string().default('exchange'),
  DB_NAME: Joi.string().default('exchange'),
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().port().default(6379),
  JWT_SECRET: Joi.string().min(32).default('dev-only-change-this-secret-1234567890'),
  JWT_EXPIRES_IN: Joi.string().default('7d'),
});

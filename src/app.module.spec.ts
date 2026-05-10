import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';

import { envValidationSchema } from './config/env.validation';
import { HealthModule } from './modules/health/health.module';

/**
 * Smoke test: compiles core modules without a database connection.
 * Full AppModule integration is covered by E2E tests (requires Docker).
 */
describe('Application core modules', () => {
  it('compile without database', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          validationSchema: envValidationSchema,
        }),
        HealthModule,
      ],
    }).compile();

    expect(moduleRef).toBeDefined();
  });
});

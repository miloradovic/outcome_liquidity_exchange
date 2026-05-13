import { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';

import { parseAllowedOrigins } from '../../config/origins.util';

export class RealtimeIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly configService: ConfigService,
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions): unknown {
    const wsAllowedOrigins = parseAllowedOrigins(
      this.configService.get<string>('WS_ALLOWED_ORIGINS'),
    );

    return super.createIOServer(port, {
      ...options,
      cors: {
        origin: wsAllowedOrigins,
        credentials: false,
      },
    });
  }
}
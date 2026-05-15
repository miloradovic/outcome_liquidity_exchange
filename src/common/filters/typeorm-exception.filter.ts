import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ConflictException,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { Response } from 'express';

type QueryDriverError = {
  code?: string;
};

@Catch(QueryFailedError)
export class TypeOrmExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(TypeOrmExceptionFilter.name);

  catch(exception: QueryFailedError, host: ArgumentsHost): void {
    if (host.getType<'http' | 'rpc' | 'ws'>() !== 'http') {
      throw exception;
    }

    const response = host.switchToHttp().getResponse<Response>();
    const driverError = (exception as QueryFailedError & { driverError?: QueryDriverError })
      .driverError;

    const mappedException = this.mapException(driverError?.code);
    if (mappedException) {
      response.status(mappedException.getStatus()).json(mappedException.getResponse());
      return;
    }

    this.logger.error(`Unhandled database error: ${exception.message}`);
    const fallback = new BadRequestException('Database operation failed');
    response.status(fallback.getStatus()).json(fallback.getResponse());
  }

  private mapException(code: string | undefined): HttpException | null {
    switch (code) {
      case '23505':
        return new ConflictException('Resource already exists');
      case '23503':
        return new BadRequestException('Invalid referenced resource');
      case '23514':
      case '22P02':
        return new BadRequestException('Invalid data for database operation');
      default:
        return null;
    }
  }
}

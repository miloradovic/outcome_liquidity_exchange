import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

import { User } from '../../users/entities/user.entity';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): User => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.user as User;
  },
);

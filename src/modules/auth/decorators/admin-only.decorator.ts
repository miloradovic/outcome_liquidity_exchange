import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse } from '@nestjs/swagger';

import { AdminOnlyGuard } from '../guards/admin-only.guard';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

export const AdminOnly = () => applyDecorators(
  UseGuards(JwtAuthGuard, AdminOnlyGuard),
  ApiBearerAuth(),
  ApiForbiddenResponse({ description: 'Admin role required' }),
);
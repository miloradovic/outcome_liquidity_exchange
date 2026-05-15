import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { User } from '../users/entities/user.entity';
import { PlaceOrderDto } from './dto/place-order.dto';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@Controller('orders')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiOperation({ summary: 'Place a new order' })
  @ApiResponse({
    status: 201,
    description: 'Order placed successfully',
  })
  async placeOrder(@CurrentUser() user: User, @Body() dto: PlaceOrderDto) {
    return this.ordersService.placeOrder(user.id, dto);
  }

  @Delete(':orderId')
  @ApiOperation({ summary: 'Cancel an open order' })
  @ApiParam({ name: 'orderId', description: 'Order UUID' })
  @ApiResponse({
    status: 200,
    description: 'Order cancelled successfully',
  })
  async cancelOrder(@CurrentUser() user: User, @Param('orderId') orderId: string) {
    return this.ordersService.cancelOrder(user.id, orderId);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current user orders' })
  @ApiResponse({
    status: 200,
    description: 'List of user orders',
  })
  async getMyOrders(@CurrentUser() user: User, @Query() pagination: PaginationQueryDto) {
    return this.ordersService.getMyOrders(user.id, pagination);
  }
}

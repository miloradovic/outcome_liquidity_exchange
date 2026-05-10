import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { User } from '../users/entities/user.entity';
import { PlaceOrderDto } from './dto/place-order.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  async placeOrder(@CurrentUser() user: User, @Body() dto: PlaceOrderDto) {
    return this.ordersService.placeOrder(user.id, dto);
  }

  @Delete(':orderId')
  async cancelOrder(@CurrentUser() user: User, @Param('orderId') orderId: string) {
    return this.ordersService.cancelOrder(user.id, orderId);
  }

  @Get('me')
  async getMyOrders(@CurrentUser() user: User) {
    return this.ordersService.getMyOrders(user.id);
  }
}

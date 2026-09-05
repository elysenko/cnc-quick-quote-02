import { Module } from '@nestjs/common';
import { AdminShippingController, ShippingController } from './shipping.controller';

@Module({ controllers: [ShippingController, AdminShippingController] })
export class ShippingModule {}

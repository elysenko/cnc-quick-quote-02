import { Module } from '@nestjs/common';
import { AdminMaterialsController, MaterialsController } from './materials.controller';

@Module({ controllers: [MaterialsController, AdminMaterialsController] })
export class MaterialsModule {}

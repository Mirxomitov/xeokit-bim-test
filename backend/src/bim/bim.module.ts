import { type DynamicModule, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BimController } from './bim.controller';
import { BIM_ENTITIES } from './bim.entities';
import { BIM_OPTIONS, type BimOptions } from './bim.options';
import { BimService } from './bim.service';

/**
 * Everything BIM in one folder, so it can be copied into CIP's apps/backend/src/ as is
 * (plus its migration and entities in src/database).
 */
@Module({})
export class BimModule {
  static register(options: BimOptions): DynamicModule {
    return {
      module: BimModule,
      imports: [TypeOrmModule.forFeature(BIM_ENTITIES)],
      controllers: [BimController],
      providers: [{ provide: BIM_OPTIONS, useValue: options }, BimService],
    };
  }
}

import { type DynamicModule, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BimModule } from './bim/bim.module';
import type { AppConfig } from './config/env';
import { databaseOptions } from './database/database-options';

@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [TypeOrmModule.forRoot(databaseOptions(config.databaseUrl)), BimModule.register({ modelsDir: config.modelsDir })],
    };
  }
}

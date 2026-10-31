import { Module } from '@nestjs/common';
import { RootCausesController } from './root-causes.controller';
import { RootCausesService } from './root-causes.service';

@Module({
  controllers: [RootCausesController],
  providers: [RootCausesService],
})
export class RootCausesModule {}

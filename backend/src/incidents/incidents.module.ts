import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { IncidentActionsService } from './incident-actions.service';
import { IncidentExportService } from './incident-export.service';
import { IncidentHistoryService } from './incident-history.service';
import { IncidentLoader } from './incident-loader.service';
import { IncidentsController } from './incidents.controller';
import { IncidentsService } from './incidents.service';

@Module({
  controllers: [IncidentsController, DashboardController],
  providers: [DashboardService, IncidentsService, IncidentActionsService, IncidentExportService, IncidentHistoryService, IncidentLoader],
  exports: [IncidentLoader, IncidentHistoryService],
})
export class IncidentsModule {}

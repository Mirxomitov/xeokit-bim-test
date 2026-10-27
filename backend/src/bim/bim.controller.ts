import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, StreamableFile } from '@nestjs/common';
import { ApiBadRequestResponse, ApiNotFoundResponse, ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';
import { UpdateStatusesDto } from './bim.dto';
import { BimModelResponse, ElementStatusesResponse } from './bim.response';
import { BimService } from './bim.service';

/**
 * Thin controller, as in CIP. Moving into CIP: each route gets @RequirePermission(action, 'BimModel')
 * and the service takes the actor (tenant) from @CurrentActor().
 */
@ApiTags('bim')
@Controller('bim/models')
export class BimController {
  constructor(private readonly bim: BimService) {}

  @Get()
  @ApiOkResponse({ type: [BimModelResponse] })
  list(): Promise<BimModelResponse[]> {
    return this.bim.list();
  }

  @Get(':id')
  @ApiOkResponse({ type: BimModelResponse })
  @ApiNotFoundResponse()
  get(@Param('id', ParseUUIDPipe) id: string): Promise<BimModelResponse> {
    return this.bim.get(id);
  }

  /** The .xkt file the viewer loads. */
  @Get(':id/file')
  @ApiProduces('application/octet-stream')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  @ApiNotFoundResponse()
  async file(@Param('id', ParseUUIDPipe) id: string): Promise<StreamableFile> {
    const { stream, size } = await this.bim.openFile(id);
    return new StreamableFile(stream, { type: 'application/octet-stream', length: size });
  }

  @Get(':id/statuses')
  @ApiOkResponse({ type: ElementStatusesResponse })
  @ApiNotFoundResponse()
  statuses(@Param('id', ParseUUIDPipe) id: string): Promise<ElementStatusesResponse> {
    return this.bim.statuses(id);
  }

  @Patch(':id/statuses')
  @ApiOkResponse({ type: ElementStatusesResponse })
  @ApiBadRequestResponse()
  @ApiNotFoundResponse()
  updateStatuses(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStatusesDto): Promise<ElementStatusesResponse> {
    return this.bim.updateStatuses(id, dto.statuses);
  }
}

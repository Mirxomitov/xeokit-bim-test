import { ApiProperty } from '@nestjs/swagger';
import { type BimModel, ELEMENT_STATUSES, type ElementStatusValue } from './bim.entities';

export class BimModelResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'arboleda' }) key!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ description: 'Size of the .xkt file in bytes' }) sizeBytes!: number;
  @ApiProperty() storeyCount!: number;
  @ApiProperty() elementCount!: number;
}

export class ElementStatusesResponse {
  @ApiProperty({ format: 'uuid' }) modelId!: string;
  @ApiProperty() updatedAt!: string;
  @ApiProperty({ description: 'Still the generated test data' }) seeded!: boolean;
  @ApiProperty({
    description: 'IFC GlobalId -> status',
    type: 'object',
    additionalProperties: { type: 'string', enum: [...ELEMENT_STATUSES] },
  })
  statuses!: Record<string, ElementStatusValue>;
}

export function toModelResponse(model: BimModel): BimModelResponse {
  return {
    id: model.id,
    key: model.key,
    name: model.name,
    sizeBytes: Number(model.sizeBytes),
    storeyCount: model.storeyCount,
    elementCount: model.elementCount,
  };
}

export function toStatusesResponse(model: BimModel, rows: { globalId: string; status: ElementStatusValue }[]): ElementStatusesResponse {
  return {
    modelId: model.id,
    updatedAt: model.statusesUpdatedAt.toISOString(),
    seeded: model.statusesSeeded,
    statuses: Object.fromEntries(rows.map((r) => [r.globalId, r.status])),
  };
}

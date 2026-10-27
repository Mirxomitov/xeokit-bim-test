import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';
import { ELEMENT_STATUSES, type ElementStatusValue } from './bim.entities';

export class UpdateStatusesDto {
  @ApiProperty({
    description: 'IFC GlobalId -> new status; other elements keep theirs',
    type: 'object',
    additionalProperties: { type: 'string', enum: [...ELEMENT_STATUSES] },
    example: { '2O2Fr$t4X7Zf8NOew3FLOH': 'done' },
  })
  @IsObject()
  statuses!: Record<string, ElementStatusValue>;
}

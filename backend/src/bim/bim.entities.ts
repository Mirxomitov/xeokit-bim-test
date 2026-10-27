import { Column, Entity, PrimaryColumn } from 'typeorm';

export const ELEMENT_STATUSES = ['done', 'in_progress', 'not_started', 'remark'] as const;
export type ElementStatusValue = (typeof ELEMENT_STATUSES)[number];

/** A model: an .xkt file in MODELS_DIR. Tables and constraints live in the migration. */
@Entity({ name: 'bim_models' })
export class BimModel {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuidv7()' })
  id!: string;

  /** The file name without .xkt, e.g. "arboleda". */
  @Column({ type: 'text' })
  key!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ name: 'file_name', type: 'text' })
  fileName!: string;

  /** bigint arrives as a string from pg */
  @Column({ name: 'size_bytes', type: 'bigint' })
  sizeBytes!: string;

  @Column({ name: 'storey_count', type: 'integer' })
  storeyCount!: number;

  @Column({ name: 'element_count', type: 'integer' })
  elementCount!: number;

  /** True while the statuses are the generated test data nobody has changed. */
  @Column({ name: 'statuses_seeded', type: 'boolean', default: true })
  statusesSeeded!: boolean;

  @Column({ name: 'statuses_updated_at', type: 'timestamptz' })
  statusesUpdatedAt!: Date;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;
}

/** Status of one element (IFC GlobalId) of a model. */
@Entity({ name: 'bim_element_statuses' })
export class ElementStatus {
  @PrimaryColumn({ name: 'model_id', type: 'uuid' })
  modelId!: string;

  @PrimaryColumn({ name: 'global_id', type: 'text' })
  globalId!: string;

  @Column({ type: 'text' })
  status!: ElementStatusValue;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' })
  updatedAt!: Date;
}

export const BIM_ENTITIES = [BimModel, ElementStatus];

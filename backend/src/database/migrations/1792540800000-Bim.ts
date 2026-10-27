import type { MigrationInterface, QueryRunner } from 'typeorm';

/*
  BIM models (.xkt files on disk) and the status of each element, keyed by IFC GlobalId.
  Moving into CIP: add tenant_id (uuid, leading every index) to both tables.
*/
export class Bim1792540800000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE bim_models (
      id uuid PRIMARY KEY DEFAULT uuidv7(),
      key text NOT NULL CONSTRAINT uq_bim_models_key UNIQUE CHECK (key ~ '^[A-Za-z0-9_-]{1,100}$'),
      name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
      file_name text NOT NULL,
      size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
      storey_count integer NOT NULL CHECK (storey_count >= 0),
      element_count integer NOT NULL CHECK (element_count >= 0),
      statuses_seeded boolean NOT NULL DEFAULT true,
      statuses_updated_at timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await runner.query(`CREATE TABLE bim_element_statuses (
      model_id uuid NOT NULL REFERENCES bim_models(id) ON DELETE CASCADE,
      global_id text NOT NULL CHECK (length(global_id) BETWEEN 1 AND 64),
      status text NOT NULL CHECK (status IN ('done', 'in_progress', 'not_started', 'remark')),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_bim_element_statuses PRIMARY KEY (model_id, global_id)
    )`);
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TABLE bim_element_statuses');
    await runner.query('DROP TABLE bim_models');
  }
}

import { createReadStream, type ReadStream } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { BadRequestException, Inject, Injectable, Logger, NotFoundException, type OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { BIM_OPTIONS, type BimOptions } from './bim.options';
import { BimModel, ELEMENT_STATUSES, ElementStatus, type ElementStatusValue } from './bim.entities';
import { type BimModelResponse, type ElementStatusesResponse, toModelResponse, toStatusesResponse } from './bim.response';
import { seedStatuses } from './seed-statuses';
import { readXktStructure, storeysOf } from './xkt';

const MAX_CHANGES = 10_000;
const INSERT_CHUNK = 1_000;

@Injectable()
export class BimService implements OnApplicationBootstrap {
  private readonly log = new Logger(BimService.name);

  constructor(
    @Inject(BIM_OPTIONS) private readonly options: BimOptions,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.registerNewModels();
  }

  /** Registers every .xkt in MODELS_DIR that is not in the database yet, with seeded statuses. */
  async registerNewModels(): Promise<void> {
    const dir = this.options.modelsDir;
    const files = (await readdir(dir)).filter((f) => f.endsWith('.xkt')).sort();
    const known = new Set((await this.db.getRepository(BimModel).find({ select: { key: true } })).map((m) => m.key));
    const names = await this.readNames();
    for (const fileName of files) {
      const key = fileName.slice(0, -'.xkt'.length);
      if (known.has(key) || !/^[A-Za-z0-9_-]{1,100}$/.test(key)) continue;
      const path = join(dir, fileName);
      const structure = await readXktStructure(path);
      const storeys = storeysOf(structure);
      const statuses = seedStatuses(structure, storeys);
      await this.db.transaction(async (tx) => {
        const model = await tx.getRepository(BimModel).save({
          key,
          name: names[key] ?? key,
          fileName,
          sizeBytes: String((await stat(path)).size),
          storeyCount: storeys.length,
          elementCount: statuses.size,
          statusesSeeded: true,
          statusesUpdatedAt: new Date(),
        });
        await this.writeStatuses(tx, model.id, statuses);
      });
      this.log.log(`registered ${key}: ${storeys.length} storeys, ${statuses.size} elements`);
    }
  }

  async list(): Promise<BimModelResponse[]> {
    return (await this.db.getRepository(BimModel).find({ order: { key: 'ASC' } })).map(toModelResponse);
  }

  async get(id: string): Promise<BimModelResponse> {
    return toModelResponse(await this.find(id));
  }

  async openFile(id: string): Promise<{ stream: ReadStream; size: number }> {
    const model = await this.find(id);
    const path = join(this.options.modelsDir, model.fileName);
    const size = await stat(path).then((s) => s.size, () => null);
    if (size === null) throw new NotFoundException('The model file is missing on the server');
    return { stream: createReadStream(path), size };
  }

  async statuses(id: string): Promise<ElementStatusesResponse> {
    const model = await this.find(id);
    const rows = await this.db.getRepository(ElementStatus).find({ where: { modelId: id }, select: { globalId: true, status: true } });
    return toStatusesResponse(model, rows);
  }

  async updateStatuses(id: string, changes: Record<string, unknown>): Promise<ElementStatusesResponse> {
    const entries = Object.entries(changes);
    if (entries.length > MAX_CHANGES) throw new BadRequestException(`At most ${MAX_CHANGES} statuses per request`);
    const statuses = new Map<string, ElementStatusValue>();
    for (const [globalId, status] of entries) {
      if (globalId.length < 1 || globalId.length > 64) throw new BadRequestException('GlobalId must be 1-64 characters');
      if (!ELEMENT_STATUSES.includes(status as ElementStatusValue)) {
        throw new BadRequestException(`Status must be one of ${ELEMENT_STATUSES.join(', ')}`);
      }
      statuses.set(globalId, status as ElementStatusValue);
    }
    await this.find(id);
    await this.db.transaction(async (tx) => {
      await this.writeStatuses(tx, id, statuses);
      await tx.getRepository(BimModel).update(id, { statusesSeeded: false, statusesUpdatedAt: new Date() });
    });
    return this.statuses(id);
  }

  private async find(id: string): Promise<BimModel> {
    const model = await this.db.getRepository(BimModel).findOneBy({ id });
    if (!model) throw new NotFoundException('Model not found');
    return model;
  }

  private async writeStatuses(tx: EntityManager, modelId: string, statuses: Map<string, ElementStatusValue>): Promise<void> {
    const rows = [...statuses].map(([globalId, status]) => ({ modelId, globalId, status, updatedAt: new Date() }));
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      await tx.getRepository(ElementStatus).upsert(rows.slice(i, i + INSERT_CHUNK), ['modelId', 'globalId']);
    }
  }

  /** Optional display names: MODELS_DIR/names.json, {"arboleda": "Arboleda (16 levels)"}. */
  private async readNames(): Promise<Record<string, string>> {
    const text = await readFile(join(this.options.modelsDir, 'names.json'), 'utf8').catch(() => '{}');
    return JSON.parse(text) as Record<string, string>;
  }
}

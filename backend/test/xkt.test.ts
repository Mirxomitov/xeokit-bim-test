import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { seedStatuses } from '../src/bim/seed-statuses';
import { parseXkt, storeysOf } from '../src/bim/xkt';

// Duplex.xkt is committed: the small sample from xeokit-convert
const duplex = parseXkt(readFileSync(join(__dirname, '../models/Duplex.xkt')));

describe('xkt', () => {
  it('reads the IFC structure', () => {
    expect(duplex.metaObjects.some((mo) => mo.type === 'IfcProject')).toBe(true);
    expect(duplex.entityIds.length).toBeGreaterThan(0);
  });

  it('finds the storeys with their drawable elements', () => {
    const storeys = storeysOf(duplex);
    expect(storeys.map((s) => s.name)).toEqual(expect.arrayContaining(['Level 1', 'Level 2']));
    const drawable = new Set(duplex.entityIds);
    for (const s of storeys) expect(s.objectIds.every((id) => drawable.has(id))).toBe(true);
  });

  it('rejects other versions', () => {
    expect(() => parseXkt(Buffer.from([9, 0, 0, 0]))).toThrow('XKT v9');
  });
});

describe('seedStatuses', () => {
  it('gives every element a status, the same on every run', () => {
    const storeys = storeysOf(duplex);
    const a = seedStatuses(duplex, storeys);
    expect(a.size).toBe(storeys.reduce((n, s) => n + s.objectIds.length, 0));
    expect(seedStatuses(duplex, storeys)).toEqual(a);
  });

  it('never fakes progress for a model with CIP_Source data', () => {
    const quality = (id: string, status: string) => ({
      id: `ps-${id}`,
      name: 'CIP_Source',
      properties: [{ name: 'Status', value: status }],
    });
    const structure = {
      metaObjects: [
        { id: 's', type: 'IfcBuildingStorey', name: 'Терраса 1' },
        { id: 'a', type: 'IfcWall', parent: 's', propertySetIds: ['ps-a'] },
        { id: 'b', type: 'IfcSlab', parent: 's', propertySetIds: ['ps-b'] },
      ],
      propertySets: [quality('a', 'Требует проверки'), quality('b', 'Недостаточно данных')],
      entityIds: ['a', 'b'],
    };
    const statuses = seedStatuses(structure, storeysOf(structure));
    expect(Object.fromEntries(statuses)).toEqual({ a: 'not_started', b: 'remark' });
  });
});

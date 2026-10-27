import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';

/*
  Reads the IFC structure embedded in an .xkt file (XKT v10-12) without the geometry: the
  metadata (metaObjects with id, name, type, parent) and the ids of the drawable entities.
  Element order: xeokit-sdk XKTLoaderPlugin/parsers/ParserV12.js.
*/
const METADATA = 0;
const ENTITY_IDS = 25;

export interface MetaObject {
  id: string;
  name?: string;
  type: string;
  parent?: string;
  propertySetIds?: string[];
}

export interface PropertySet {
  id: string;
  name: string;
  properties: { name: string; value: unknown }[];
}

export interface XktStructure {
  metaObjects: MetaObject[];
  propertySets: PropertySet[];
  entityIds: string[];
}

export interface Storey {
  id: string;
  name: string;
  /** Drawable elements under the storey (IFC GlobalIds). */
  objectIds: string[];
}

export async function readXktStructure(file: string): Promise<XktStructure> {
  return parseXkt(await readFile(file));
}

export function parseXkt(buf: Buffer): XktStructure {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const first = view.getUint32(0, true);
  const version = first & 0x7fffffff;
  if (version < 10 || version > 12) throw new Error(`XKT v${version} is not supported (v10-12)`);
  const zipped = version < 11 || (version === 12 && first >>> 31 === 1);

  let element: (i: number) => Buffer;
  if (zipped) {
    // [version][count][size 0..count-1][data 0][data 1]..., each element deflated
    const count = view.getUint32(4, true);
    const offsets = [(count + 2) * 4];
    for (let i = 0; i < count; i++) offsets.push(offsets[i]! + view.getUint32((i + 2) * 4, true));
    element = (i) => inflateSync(buf.subarray(offsets[i], offsets[i + 1]));
  } else {
    // [version][offset 0][length 0][offset 1][length 1]...
    element = (i) => {
      const offset = view.getUint32((1 + 2 * i) * 4, true);
      return buf.subarray(offset, offset + view.getUint32((2 + 2 * i) * 4, true));
    };
  }
  const json = (i: number): unknown => JSON.parse(element(i).toString('utf8'));
  const metadata = json(METADATA) as { metaObjects?: MetaObject[]; propertySets?: PropertySet[] };
  return {
    metaObjects: metadata.metaObjects ?? [],
    propertySets: metadata.propertySets ?? [],
    entityIds: json(ENTITY_IDS) as string[],
  };
}

/**
 * Building storeys with their drawable elements, in the file's order (IFC exporters write
 * storeys by elevation, so usually bottom to top). Storeys without elements are left out.
 */
export function storeysOf({ metaObjects, entityIds }: Pick<XktStructure, 'metaObjects' | 'entityIds'>): Storey[] {
  const drawable = new Set(entityIds);
  const children = new Map<string, string[]>();
  for (const mo of metaObjects) {
    if (!mo.parent) continue;
    const list = children.get(mo.parent) ?? [];
    list.push(mo.id);
    children.set(mo.parent, list);
  }
  const subtree = (id: string): string[] => {
    const ids: string[] = [];
    const stack = [id];
    for (let next = stack.pop(); next !== undefined; next = stack.pop()) {
      if (drawable.has(next)) ids.push(next);
      stack.push(...(children.get(next) ?? []));
    }
    return ids;
  };
  return metaObjects
    .filter((mo) => mo.type === 'IfcBuildingStorey')
    .map((mo) => ({ id: mo.id, name: mo.name ?? mo.id, objectIds: subtree(mo.id) }))
    .filter((s) => s.objectIds.length > 0);
}


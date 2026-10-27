import type { ElementStatusValue } from './bim.entities';
import type { Storey, XktStructure } from './xkt';

/** FNV-1a, so the seeded data is the same on every run. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/**
 * Pset of the models CIP builds from a takeoff. Its Status is data quality, not construction
 * progress: "Сформирован автоматически" / "Требует проверки" / "Недостаточно данных".
 */
const SOURCE_PSET = 'CIP_Source';
const NOT_ENOUGH_DATA = 'Недостаточно данных';

/**
 * Initial statuses of a newly registered model.
 * A real project (elements carry CIP_Source): nothing is reported yet, so everything is
 * not_started, and elements without enough data for the takeoff are remarks. Never fake progress.
 * A sample model: test data so the colouring looks like a real site (lower floors done, middle in
 * progress, upper not started, about 3 % remarks). [storeys] are ordered bottom to top.
 */
export function seedStatuses(structure: XktStructure, storeys: Storey[]): Map<string, ElementStatusValue> {
  const sourceSets = new Map(structure.propertySets.filter((s) => s.name === SOURCE_PSET).map((s) => [s.id, s]));
  if (sourceSets.size > 0) {
    const objects = new Map(structure.metaObjects.map((mo) => [mo.id, mo]));
    const result = new Map<string, ElementStatusValue>();
    for (const id of storeys.flatMap((s) => s.objectIds)) {
      const set = objects.get(id)?.propertySetIds?.map((p) => sourceSets.get(p)).find(Boolean);
      const quality = set?.properties.find((p) => p.name === 'Status')?.value;
      result.set(id, quality === NOT_ENOUGH_DATA ? 'remark' : 'not_started');
    }
    return result;
  }
  return sampleStatuses(storeys);
}

function sampleStatuses(storeys: Storey[]): Map<string, ElementStatusValue> {
  const result = new Map<string, ElementStatusValue>();
  storeys.forEach((storey, i) => {
    const progress = storeys.length === 1 ? 0.5 : i / (storeys.length - 1); // 0 = ground, 1 = roof
    for (const id of storey.objectIds) {
      const roll = hash(id) % 100;
      if (roll < 3) result.set(id, 'remark');
      else if (progress < 0.34) result.set(id, 'done');
      else if (progress < 0.67) result.set(id, roll < 55 ? 'done' : 'in_progress');
      else result.set(id, roll < 15 ? 'in_progress' : 'not_started');
    }
  });
  return result;
}

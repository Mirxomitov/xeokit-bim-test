// Uploads the sample IFCs (fetched by scripts/fetch-samples.sh) to an OSS bucket, translates them
// to SVF2 and records the URNs in models.json, which server.js hands to the viewer.
//   npm run upload                    # all samples
//   npm run upload -- Duplex          # just one
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { ensureBucket, upload, urnOf, translate, manifest, bucket } from "./aps.js";

const SAMPLES = new URL("../../samples/", import.meta.url);
const MODELS = new URL("./models.json", import.meta.url);

// Same models and labels as the xeokit app, for a side-by-side comparison.
const ALL = {
  Duplex: "Duplex (малый, 2 этажа)",
  schependomlaan: "Schependomlaan (жилой дом)",
  skolebygg: "Skolebygg (школа, IFC 57 МБ)",
  mab7000: "MAB 7000 (28 этажей, IFC 73 МБ)",
  arboleda: "Arboleda (16 уровней, IFC 155 МБ)",
};

const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(ALL);
const models = existsSync(MODELS) ? JSON.parse(await readFile(MODELS, "utf8")) : [];

await ensureBucket();
console.log(`bucket ${bucket}`);

for (const name of wanted) {
  const file = new URL(`${name}.ifc`, SAMPLES);
  if (!existsSync(file)) {
    console.warn(`skip ${name}: samples/${name}.ifc missing (run scripts/fetch-samples.sh)`);
    continue;
  }
  const data = await readFile(file);
  let t = Date.now();
  process.stdout.write(`${name}: upload ${(data.length / 1e6).toFixed(1)} MB… `);
  const urn = urnOf(await upload(`${name}.ifc`, data));
  console.log(`${((Date.now() - t) / 1000).toFixed(1)} s`);

  t = Date.now();
  await translate(urn);
  let m;
  do {
    await new Promise((r) => setTimeout(r, 5000));
    m = await manifest(urn);
    process.stdout.write(`\r${name}: translate ${m.progress}   `);
  } while (m.status === "pending" || m.status === "inprogress");
  console.log(`\r${name}: translate ${m.status} in ${((Date.now() - t) / 1000).toFixed(0)} s`);
  if (m.status !== "success") {
    console.error(JSON.stringify(m.derivatives?.flatMap((d) => d.messages ?? []), null, 2));
    continue;
  }

  const entry = { file: name, name: ALL[name] ?? name, urn, translateSeconds: Math.round((Date.now() - t) / 1000) };
  const i = models.findIndex((x) => x.file === name);
  i >= 0 ? (models[i] = entry) : models.push(entry);
  await writeFile(MODELS, JSON.stringify(models, null, 2) + "\n");
}

console.log(`models.json: ${models.map((x) => x.file).join(", ")}`);

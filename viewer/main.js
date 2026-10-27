// xeokit viewer page for the Flutter WebView test.
//
// Bridge contract between the page and the Flutter app:
//   Flutter -> JS : window.bim.loadModel(url, {edges}), setStatuses({id: status}),
//                   isolateFloor(storeyId), showAll(), flyTo(id), select(id)
//   JS -> Flutter : {type: "ready" | "loaded" | "pick" | "error", ...} as JSON
//                   through the `Bridge` JavaScriptChannel.
import { Viewer, XKTLoaderPlugin, NavCubePlugin } from "@xeokit/xeokit-sdk";

const COLORS = {
  done: [0.13, 0.69, 0.33],
  in_progress: [0.16, 0.46, 0.96],
  not_started: [0.62, 0.66, 0.72],
  remark: [0.9, 0.22, 0.21],
};

const msg = document.getElementById("msg");

function send(payload) {
  const text = JSON.stringify(payload);
  if (window.Bridge && window.Bridge.postMessage) window.Bridge.postMessage(text);
  else console.log("[bridge]", text); // plain browser: debug in the console
}

const viewer = new Viewer({ canvasId: "c", transparent: true, dtxEnabled: true });
viewer.camera.eye = [-30, 25, 35];
viewer.camera.look = [0, 0, 0];
viewer.camera.up = [0, 1, 0];
// Render at the screen's pixel density (capped: 3x costs too much GPU on phones).
viewer.scene.canvas.resolutionScale = Math.min(window.devicePixelRatio || 1, 2);
// Other floors while one is isolated: a faint grey outline, so the isolated floor stands out.
viewer.scene.xrayMaterial.fillColor = [0.6, 0.64, 0.7];
viewer.scene.xrayMaterial.fillAlpha = 0.05;
viewer.scene.xrayMaterial.edgeColor = [0.45, 0.5, 0.58];
viewer.scene.xrayMaterial.edgeAlpha = 0.15;

new NavCubePlugin(viewer, { canvasId: "nav", visible: true, cameraFly: true });
const loader = new XKTLoaderPlugin(viewer);

let model = null;
let selectedId = null;
let homeAabb = null;
// Fit models to most of the camera's field of view; xeokit's default (45°) leaves them small on a phone.
const FIT_FOV = viewer.camera.perspective.fov * 0.95;

// Walk up the IFC tree to the building storey that contains an object.
function storeyOf(id) {
  let mo = viewer.metaScene.metaObjects[id];
  while (mo) {
    if (mo.type === "IfcBuildingStorey") return mo;
    mo = mo.parent;
  }
  return null;
}

// Models CIP builds from a takeoff carry a CIP_Source pset: data quality and a note per element.
// propertySets can hold undefined: xeokit pushes a pset the file references but doesn't contain.
function source(id, property) {
  const pset = viewer.metaScene.metaObjects[id]?.propertySets?.find((ps) => ps?.name === "CIP_Source");
  return pset?.properties?.find((p) => p?.name === property)?.value || null;
}

// Placeholder geometry: the takeoff had too little data to model the element's real shape.
const isPlaceholder = (id) => source(id, "Status") === "Недостаточно данных";

function describe(id) {
  const mo = viewer.metaScene.metaObjects[id];
  const storey = storeyOf(id);
  return {
    id,
    name: mo?.name ?? id,
    ifcType: mo?.type ?? "",
    storeyId: storey?.id ?? null,
    storeyName: storey?.name ?? null,
    quality: source(id, "Status"),
    note: source(id, "Note"),
  };
}

function storeys() {
  const ids = viewer.metaScene.getObjectIDsByType("IfcBuildingStorey");
  return ids
    .map((sid) => {
      const objectIds = viewer.metaScene.metaObjects[sid]
        .getObjectIDsInSubtree()
        .filter((oid) => viewer.scene.objects[oid]);
      const aabb = objectIds.length ? viewer.scene.getAABB(objectIds) : null;
      return { id: sid, name: viewer.metaScene.metaObjects[sid].name, minY: aabb ? aabb[1] : 0, objectIds };
    })
    .filter((s) => s.objectIds.length)
    .sort((a, b) => a.minY - b.minY);
}

function select(id) {
  if (selectedId) viewer.scene.setObjectsSelected([selectedId], false);
  selectedId = id && viewer.scene.objects[id] ? id : null;
  if (selectedId) viewer.scene.setObjectsSelected([selectedId], true);
}

window.bim = {
  loadModel(url, options = {}) {
    if (model) model.destroy();
    msg.style.display = "flex";
    msg.textContent = "Загрузка модели…";
    const started = performance.now();
    model = loader.load({ id: "model", src: url, edges: options.edges ?? true });
    model.on("loaded", () => {
      msg.style.display = "none";
      // Frame the building storeys, not stray site objects far from the building.
      const buildingIds = storeys().flatMap((st) => st.objectIds);
      homeAabb = buildingIds.length ? viewer.scene.getAABB(buildingIds) : model.aabb;
      viewer.cameraFlight.jumpTo({ aabb: homeAabb, fit: true, fitFOV: FIT_FOV });
      send({
        type: "loaded",
        ms: Math.round(performance.now() - started),
        objects: viewer.scene.numObjects,
        dpr: window.devicePixelRatio,
        canvas: `${viewer.scene.canvas.canvas.width}x${viewer.scene.canvas.canvas.height}`,
        storeys: storeys(),
      });
    });
    model.on("error", (e) => {
      msg.textContent = "Ошибка загрузки модели";
      send({ type: "error", message: String(e) });
    });
  },

  // statuses: {objectId: "done" | "in_progress" | "not_started" | "remark"}
  setStatuses(statuses) {
    const all = viewer.scene.objectIds;
    viewer.scene.setObjectsColorized(all, null);
    viewer.scene.setObjectsOpacity(all, 1);
    const byStatus = {};
    for (const [id, status] of Object.entries(statuses)) {
      if (!viewer.scene.objects[id] || !COLORS[status]) continue;
      (byStatus[status] ??= []).push(id);
    }
    // "Not started" is see-through so the work done stands out; when most of the model is not
    // started (a new project) that would hide the whole building, so it stays solid then.
    const notStarted = byStatus.not_started?.length ?? 0;
    const ghostNotStarted = notStarted < Object.keys(statuses).length / 2;
    for (const [status, ids] of Object.entries(byStatus)) {
      viewer.scene.setObjectsColorized(ids, COLORS[status]);
      if (status === "not_started" && ghostNotStarted) viewer.scene.setObjectsOpacity(ids, 0.35);
    }
    // Placeholder geometry is half transparent whatever its status, so it doesn't read as a real shape.
    viewer.scene.setObjectsOpacity(all.filter(isPlaceholder), 0.45);
  },

  isolateFloor(storeyId) {
    const mo = viewer.metaScene.metaObjects[storeyId];
    if (!mo) return;
    const ids = mo.getObjectIDsInSubtree().filter((oid) => viewer.scene.objects[oid]);
    const all = viewer.scene.objectIds;
    viewer.scene.setObjectsXRayed(all, true);
    viewer.scene.setObjectsPickable(all, false);
    viewer.scene.setObjectsXRayed(ids, false);
    viewer.scene.setObjectsPickable(ids, true);
    viewer.cameraFlight.flyTo({ aabb: viewer.scene.getAABB(ids), fitFOV: FIT_FOV, duration: 0.6 });
  },

  showAll() {
    const all = viewer.scene.objectIds;
    viewer.scene.setObjectsXRayed(all, false);
    viewer.scene.setObjectsPickable(all, true);
    if (model) viewer.cameraFlight.flyTo({ aabb: homeAabb ?? model.aabb, fitFOV: FIT_FOV, duration: 0.6 });
  },

  flyTo(id) {
    if (!viewer.scene.objects[id]) return;
    select(id);
    viewer.cameraFlight.flyTo({ aabb: viewer.scene.getAABB([id]), duration: 0.6 });
  },

  select,
};

viewer.cameraControl.on("picked", (pick) => {
  if (!pick.entity) return;
  select(pick.entity.id);
  send({ type: "pick", ...describe(pick.entity.id) });
});
viewer.cameraControl.on("pickedNothing", () => {
  select(null);
  send({ type: "pick", id: null });
});

window.addEventListener("error", (e) => send({ type: "error", message: e.message }));
send({ type: "ready" });

// Opened directly in a desktop browser: ?model=Duplex.xkt
const param = new URLSearchParams(location.search).get("model");
if (param) window.bim.loadModel(param);

// Autodesk Platform Services viewer page for the Flutter WebView test: the same bridge as the
// xeokit page (viewer/main.js), so the two apps differ only in the engine.
//
//   Flutter -> JS : window.bim.loadModel(urn, {edges}), setStatuses({id: status}),
//                   isolateFloor(storeyId), showAll(), flyTo(id), select(id)
//   JS -> Flutter : {type: "ready" (models) | "loaded" | "pick" | "error", ...} as JSON
//                   through the `Bridge` JavaScriptChannel.
//
// Ids on the bridge are IFC GlobalIds (the APS externalId); the viewer itself works with
// numeric dbIds, so the page keeps a map between the two.
const AV = Autodesk.Viewing;

// THREE.Vector4: r, g, b, blend strength. Theming can't make objects transparent, so
// "not started" is plain grey here, not the 35 % opacity the xeokit page uses.
const COLORS = {
  done: new THREE.Vector4(0.13, 0.69, 0.33, 1),
  in_progress: new THREE.Vector4(0.16, 0.46, 0.96, 1),
  not_started: new THREE.Vector4(0.62, 0.66, 0.72, 1),
  remark: new THREE.Vector4(0.9, 0.22, 0.21, 1),
};

const msg = document.getElementById("msg");

function send(payload) {
  const text = JSON.stringify(payload);
  if (window.Bridge && window.Bridge.postMessage) window.Bridge.postMessage(text);
  else console.log("[bridge]", text); // plain browser: debug in the console
}

function showMessage(text) {
  msg.style.display = text ? "flex" : "none";
  msg.textContent = text ?? "";
}

let viewer = null;
let model = null;
let tree = null;
let storeyList = []; // [{id, dbId, name, minUp, objectIds}], bottom to top
let storeyDbIds = new Set();
const dbIdOf = new Map(); // bridge id -> dbId
const idOf = new Map(); // dbId -> bridge id
let selectedDbId = null;

const getToken = (callback) =>
  fetch("token")
    .then((r) => r.json())
    .then((t) => {
      if (!t.access_token) throw new Error(t.error ?? "no access_token");
      callback(t.access_token, t.expires_in);
    })
    .catch((e) => {
      showMessage("Нет токена APS");
      send({ type: "error", message: `token: ${e.message ?? e}` });
    });

function once(event, test) {
  return new Promise((resolve) => {
    const handler = (e) => {
      if (!test(e)) return;
      viewer.removeEventListener(event, handler);
      resolve(e);
    };
    viewer.addEventListener(event, handler);
  });
}

// Geometry and the property database stream in separately; storeys need both.
function whenFullyLoaded(m) {
  const geometry = m.isLoadDone() ? null : once(AV.GEOMETRY_LOADED_EVENT, (e) => e.model === m);
  const objectTree = m.getInstanceTree() ? null : once(AV.OBJECT_TREE_CREATED_EVENT, (e) => e.model === m);
  return Promise.all([geometry, objectTree]);
}

const externalIdMapping = (m) => new Promise((resolve, reject) => m.getExternalIdMapping(resolve, reject));
const properties = (dbId) => new Promise((resolve, reject) => model.getProperties(dbId, resolve, reject));
const search = (text) =>
  new Promise((resolve) => model.search(text, resolve, () => resolve([]), null, { searchHidden: true }));

// Parent in the object tree, or null at the root.
const parentOf = (dbId) => (dbId === tree.getRootId() ? null : tree.getNodeParentId(dbId));

function children(dbId) {
  const ids = [];
  tree.enumNodeChildren(dbId, (child) => void ids.push(child));
  return ids;
}

// IfcBuildingStorey nodes. The class name is a property value, so search for it; if the
// translation didn't keep it, fall back to the IFC spatial structure
// (Project > Site > Building > storeys): the children of the last single-child node.
async function findStoreys() {
  let ids = (await search("IfcBuildingStorey")).filter((id) => tree.getChildCount(id) > 0);
  if (!ids.length) {
    let node = tree.getRootId();
    while (tree.getChildCount(node) === 1) node = children(node)[0];
    ids = children(node);
  }
  const set = new Set(ids);
  // Drop matches nested inside another storey.
  return ids.filter((id) => {
    for (let p = parentOf(id); p != null; p = parentOf(p)) if (set.has(p)) return false;
    return true;
  });
}

function minAlongUp(dbId) {
  const frags = model.getFragmentList();
  const box = new THREE.Box3();
  const part = new THREE.Box3();
  tree.enumNodeFragments(dbId, (fragId) => {
    frags.getWorldBounds(fragId, part);
    box.union(part);
  }, true);
  if (box.min.x > box.max.x) return null; // no geometry (the viewer's THREE r71 has no isEmpty)
  const up = viewer.navigation.getWorldUpVector();
  return box.min.dot(up);
}

const bridgeId = (dbId) => idOf.get(dbId) ?? String(dbId);

// A tap hits a leaf (often a geometry sub-node); the element is the ancestor directly under a storey.
function elementOf(dbId) {
  for (let node = dbId, parent = parentOf(node); parent != null; node = parent, parent = parentOf(node)) {
    if (storeyDbIds.has(parent)) return node;
  }
  return dbId;
}

function storeyOf(dbId) {
  for (let p = parentOf(dbId); p != null; p = parentOf(p)) if (storeyDbIds.has(p)) return p;
  return null;
}

async function describe(dbId) {
  const props = await properties(dbId).catch(() => ({ properties: [] }));
  const value = (re) => props.properties.find((p) => re.test(p.displayName))?.displayValue;
  const ifcType = props.properties.map((p) => String(p.displayValue)).find((v) => /^Ifc[A-Z][A-Za-z]+$/.test(v));
  const storey = storeyOf(dbId);
  return {
    id: bridgeId(dbId),
    name: tree.getNodeName(dbId) || props.name || String(dbId),
    ifcType: ifcType ?? value(/^(type|class|ifc ?class|entity)$/i) ?? "",
    globalId: props.externalId ?? value(/global ?id|ifc ?guid/i) ?? null,
    storeyId: storey ? bridgeId(storey) : null,
    storeyName: storey ? tree.getNodeName(storey) : null,
  };
}

function select(id) {
  const dbId = id == null ? null : dbIdOf.get(id) ?? null;
  selectedDbId = dbId;
  if (dbId == null) viewer.clearSelection();
  else viewer.select([dbId], model);
}

function homeDbIds() {
  return storeyList.length ? storeyList.map((s) => s.dbId) : [tree.getRootId()];
}

window.bim = {
  async loadModel(urn, options = {}) {
    if (model) viewer.unloadModel(model);
    model = tree = null;
    storeyList = [];
    storeyDbIds = new Set();
    dbIdOf.clear();
    idOf.clear();
    showMessage("Загрузка модели…");
    const started = performance.now();
    try {
      const doc = await new Promise((resolve, reject) =>
        AV.Document.load(`urn:${urn}`, resolve, (code, message) => reject(new Error(`${message || "Document.load"} (${code})`))),
      );
      const m = await viewer.loadDocumentNode(doc, doc.getRoot().getDefaultGeometry());
      model = m;
      viewer.setDisplayEdges(options.edges ?? true);
      await whenFullyLoaded(m);
      if (model !== m) return; // another loadModel started meanwhile
      tree = m.getInstanceTree();
      for (const [externalId, dbId] of Object.entries(await externalIdMapping(m))) {
        dbIdOf.set(externalId, dbId);
        idOf.set(dbId, externalId);
      }
      storeyList = (await findStoreys())
        .map((dbId) => ({
          id: bridgeId(dbId),
          dbId,
          name: tree.getNodeName(dbId),
          minUp: minAlongUp(dbId),
          objectIds: children(dbId).map(bridgeId),
        }))
        .filter((s) => s.objectIds.length && s.minUp != null)
        .sort((a, b) => a.minUp - b.minUp);
      storeyDbIds = new Set(storeyList.map((s) => s.dbId));
      for (const s of storeyList) dbIdOf.set(s.id, s.dbId); // in case a storey has no externalId
      for (const s of storeyList) for (const child of children(s.dbId)) dbIdOf.set(bridgeId(child), child);

      viewer.fitToView(homeDbIds(), model, true);
      showMessage(null);
      const canvas = viewer.canvas;
      send({
        type: "loaded",
        ms: Math.round(performance.now() - started),
        objects: storeyList.reduce((n, s) => n + s.objectIds.length, 0),
        dpr: window.devicePixelRatio,
        canvas: `${canvas.width}x${canvas.height}`,
        storeys: storeyList.map(({ id, name, minUp, objectIds }) => ({ id, name, minY: minUp, objectIds })),
      });
    } catch (e) {
      showMessage("Ошибка загрузки модели");
      send({ type: "error", message: String(e?.message ?? e) });
    }
  },

  // statuses: {objectId: "done" | "in_progress" | "not_started" | "remark"}
  setStatuses(statuses) {
    if (!model) return;
    viewer.clearThemingColors(model);
    for (const [id, status] of Object.entries(statuses)) {
      const dbId = dbIdOf.get(id);
      if (dbId == null || !COLORS[status]) continue;
      viewer.setThemingColor(dbId, COLORS[status], model, true);
    }
  },

  isolateFloor(storeyId) {
    const dbId = dbIdOf.get(storeyId);
    if (dbId == null) return;
    viewer.isolate([dbId], model); // the rest is ghosted, like xeokit's x-ray
    viewer.fitToView([dbId], model);
  },

  showAll() {
    if (!model) return;
    viewer.showAll();
    viewer.fitToView(homeDbIds(), model);
  },

  flyTo(id) {
    const dbId = dbIdOf.get(id);
    if (dbId == null) return;
    select(id);
    viewer.fitToView([dbId], model);
  },

  select,
};

async function onSelection(e) {
  const picked = e.dbIdArray?.[0] ?? null;
  if (picked === selectedDbId) return; // our own select() call
  if (picked == null) {
    selectedDbId = null;
    send({ type: "pick", id: null });
    return;
  }
  const element = elementOf(picked);
  selectedDbId = element;
  if (element !== picked) viewer.select([element], model); // highlight the whole element
  send({ type: "pick", ...(await describe(element)) });
}

window.addEventListener("error", (e) => send({ type: "error", message: e.message }));

AV.Initializer({ env: "AutodeskProduction2", api: "streamingV2", getAccessToken: getToken }, async () => {
  viewer = new AV.Viewer3D(document.getElementById("viewer"));
  if (viewer.start() > 0) {
    showMessage("WebGL недоступен");
    send({ type: "error", message: "viewer.start() failed: WebGL unavailable" });
    return;
  }
  viewer.setBackgroundColor(244, 246, 249, 244, 246, 249);
  viewer.setGhosting(true);
  viewer.addEventListener(AV.SELECTION_CHANGED_EVENT, onSelection);
  await viewer.loadExtension("Autodesk.ViewCubeUi").catch(() => {});

  const models = await fetch("models").then((r) => r.json()).catch(() => []);
  showMessage(models.length ? null : "Нет моделей: запустите npm run upload в aps/server");
  send({ type: "ready", models });

  // Opened directly in a desktop browser: ?model=Duplex
  const param = new URLSearchParams(location.search).get("model");
  const entry = models.find((m) => m.file === param || m.urn === param);
  if (entry) window.bim.loadModel(entry.urn);
});

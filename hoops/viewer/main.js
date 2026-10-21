// HOOPS Visualize Web viewer page for the Flutter WebView test: the same bridge as the xeokit
// page (viewer/main.js), so the apps differ only in the engine.
//
//   Flutter -> JS : window.bim.loadModel(url, {edges}), setStatuses({id: status}),
//                   isolateFloor(storeyId), showAll(), flyTo(id), select(id)
//   JS -> Flutter : {type: "ready" | "loaded" | "pick" | "error", ...} as JSON
//                   through the `Bridge` JavaScriptChannel.
//
// Models are StreamCache (.scs) files made by HOOPS Converter from the IFC samples; they load
// straight from the app's assets, like the xeokit .xkt files. Ids on the bridge are IFC GlobalIds;
// the viewer works with numeric node ids, so the page keeps a map between the two.
import { WebViewer, Color, InstanceModifier, NodeType, SelectionMode } from "@ts3d-hoops/web-viewer";

const COLORS = {
  done: new Color(34, 176, 84),
  in_progress: new Color(41, 117, 245),
  not_started: new Color(158, 168, 184),
  remark: new Color(229, 56, 54),
};
const BACKGROUND = new Color(244, 246, 249);

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

const viewer = new WebViewer({ containerId: "viewer", empty: true, enginePath: "." });
const model = viewer.model;

let loadCount = 0;
let storeyList = []; // [{id, node, name, minUp, elements: [node]}], bottom to top
let storeyOfNode = new Map(); // element node -> storey
let elements = new Set(); // element nodes: what a tap selects and statuses colour
const info = new Map(); // node -> {type, globalId}
const nodeOf = new Map(); // bridge id -> node
let selectedNode = null;

// IFC class and GlobalId of a node. Current converters store them as the node's generic type
// and id; older .scs files only have them as properties (TYPE, <TYPE>/GlobalId).
async function ifcInfo(node) {
  const type = model.getNodeGenericType(node);
  if (type) return { type: type.toUpperCase(), globalId: model.getNodeGenericId(node) };
  const props = await model.getNodeProperties(node, false).catch(() => null);
  if (!props?.TYPE) return null;
  const t = props.TYPE.toUpperCase();
  return { type: t, globalId: props[`${props.TYPE}/GlobalId`] ?? props.GlobalId ?? null };
}

const isTreeNode = (node) => {
  const t = model.getNodeType(node);
  return t === NodeType.AssemblyNode || t === NodeType.PartInstance;
};
const childrenOf = (node) => model.getNodeChildren(node).filter(isTreeNode);

async function describeAll(nodes) {
  const found = await Promise.all(nodes.map(ifcInfo));
  nodes.forEach((n, i) => found[i] && info.set(n, found[i]));
  return found;
}

// IfcBuildingStorey nodes: walk down the spatial structure (Project > Site > Building > storeys).
async function findStoreys() {
  const storeys = [];
  let level = [model.getAbsoluteRootNode()];
  for (let depth = 0; level.length && depth < 8; depth++) {
    const found = await describeAll(level);
    const next = [];
    level.forEach((node, i) => {
      if (found[i]?.type === "IFCBUILDINGSTOREY") storeys.push(node);
      else next.push(...childrenOf(node));
    });
    level = next;
  }
  return storeys;
}

// Elements of a storey: the topmost nodes under it with an IFC class. Converters may put
// grouping nodes in between (one per class, e.g. "IFCWALLSTANDARDCASE"), so skip those.
async function collectElements(storey) {
  const result = [];
  const spaces = [];
  let level = childrenOf(storey);
  while (level.length) {
    const found = await describeAll(level);
    const next = [];
    level.forEach((node, i) => {
      if (!found[i]) next.push(...childrenOf(node));
      else if (found[i].type === "IFCSPACE") spaces.push(node);
      else result.push(node);
    });
    level = next;
  }
  return { elements: result, spaces };
}

const bridgeId = (node) => info.get(node)?.globalId ?? String(node);

// A tap hits a body; the element is its nearest ancestor that is a storey element.
function elementOf(node) {
  for (let n = node; n != null; n = model.getNodeParent(n)) if (elements.has(n)) return n;
  return null;
}

function describe(node) {
  const storey = storeyOfNode.get(node);
  const i = info.get(node);
  return {
    id: bridgeId(node),
    name: model.getNodeName(node) ?? String(node),
    ifcType: i?.type ?? "",
    globalId: i?.globalId ?? null,
    storeyId: storey?.id ?? null,
    storeyName: storey?.name ?? null,
  };
}

function select(id) {
  const node = id == null ? null : nodeOf.get(id) ?? null;
  selectedNode = node;
  if (node == null) viewer.selectionManager.clear();
  else viewer.selectionManager.selectNode(node, SelectionMode.Set);
}

const homeNodes = () => (storeyList.length ? storeyList.map((s) => s.node) : [model.getAbsoluteRootNode()]);

async function resetIsolation() {
  const root = model.getAbsoluteRootNode();
  await viewer.view.setDrawMode("Shaded");
  await model.setInstanceModifier(InstanceModifier.DoNotXRay, [root], false);
  await model.setInstanceModifier(InstanceModifier.DoNotSelect, [root], false);
}

window.bim = {
  async loadModel(url, options = {}) {
    const load = ++loadCount;
    showMessage("Загрузка модели…");
    const started = performance.now();
    try {
      selectedNode = null;
      viewer.selectionManager.clear();
      await resetIsolation();
      await model.clear();
      storeyList = [];
      storeyOfNode = new Map();
      elements = new Set();
      info.clear();
      nodeOf.clear();

      await model.loadSubtreeFromScsFile(model.getAbsoluteRootNode(), url);
      if (load !== loadCount) return; // another loadModel started meanwhile
      viewer.view.setHardEdgesEnabled(options.edges ?? true);

      const spaces = [];
      for (const node of await findStoreys()) {
        const found = await collectElements(node);
        spaces.push(...found.spaces);
        if (!found.elements.length) continue;
        const box = await model.getNodesBounding([node]);
        storeyList.push({ id: bridgeId(node), node, name: model.getNodeName(node) ?? "", minUp: box.min.z, elements: found.elements });
      }
      if (load !== loadCount) return;
      storeyList.sort((a, b) => a.minUp - b.minUp); // IFC is Z-up
      for (const s of storeyList) {
        nodeOf.set(s.id, s.node);
        for (const e of s.elements) {
          elements.add(e);
          storeyOfNode.set(e, s);
          nodeOf.set(bridgeId(e), e);
        }
      }
      // IfcSpace volumes would cover the rooms; xeokit and APS hide them too.
      if (spaces.length) await model.setNodesVisibility(spaces, false);

      await viewer.view.fitNodes(homeNodes(), 0);
      await viewer.waitForIdle();
      if (load !== loadCount) return;
      showMessage(null);
      const canvas = viewer.view.getCanvas?.() ?? document.querySelector("#viewer canvas");
      send({
        type: "loaded",
        ms: Math.round(performance.now() - started),
        objects: elements.size,
        dpr: window.devicePixelRatio,
        canvas: canvas ? `${canvas.width}x${canvas.height}` : "",
        storeys: storeyList.map(({ id, name, minUp, elements }) => ({ id, name, minY: minUp, objectIds: elements.map(bridgeId) })),
      });
    } catch (e) {
      showMessage("Ошибка загрузки модели");
      const message = String(e?.message ?? e);
      // .scs files exist only after hoops/convert.sh (license needed) or hoops/fetch-demo.sh
      send({ type: "error", message: / 404\b/.test(message) ? `${message} Run hoops/convert.sh or hoops/fetch-demo.sh.` : message });
    }
  },

  // statuses: {objectId: "done" | "in_progress" | "not_started" | "remark"}
  setStatuses(statuses) {
    if (!elements.size) return;
    model.resetNodesMaterial([...elements]);
    const byStatus = {};
    for (const [id, status] of Object.entries(statuses)) {
      const node = nodeOf.get(id);
      if (node == null || !COLORS[status]) continue;
      (byStatus[status] ??= []).push(node);
    }
    for (const [status, nodes] of Object.entries(byStatus)) {
      model.setNodesMaterial(nodes, status === "not_started" ? { faceColor: COLORS[status], opacity: 0.35 } : { faceColor: COLORS[status] });
    }
  },

  // The rest of the building is x-rayed and can't be tapped, like the xeokit page.
  async isolateFloor(storeyId) {
    const node = nodeOf.get(storeyId);
    if (node == null) return;
    await resetIsolation();
    const root = model.getAbsoluteRootNode();
    await model.setInstanceModifier(InstanceModifier.DoNotSelect, [root], true);
    await model.setInstanceModifier(InstanceModifier.DoNotSelect, [node], false);
    await model.setInstanceModifier(InstanceModifier.DoNotXRay, [node], true);
    await viewer.view.setDrawMode("XRay");
    await viewer.view.fitNodes([node], 600);
  },

  async showAll() {
    await resetIsolation();
    await viewer.view.fitNodes(homeNodes(), 600);
  },

  flyTo(id) {
    const node = nodeOf.get(id);
    if (node == null) return;
    select(id);
    viewer.view.fitNodes([node], 600);
  },

  select,
};

function onSelection(events, removed) {
  if (removed) {
    if (viewer.selectionManager.size() === 0 && selectedNode != null) {
      selectedNode = null;
      send({ type: "pick", id: null });
    }
    return;
  }
  const node = events.at(-1)?.getSelection().getNodeId();
  if (node == null || node === selectedNode) return; // our own select() call
  selectedNode = node;
  send({ type: "pick", ...describe(node) });
}

window.addEventListener("error", (e) => send({ type: "error", message: e.message }));
window.addEventListener("resize", () => viewer.resizeCanvas());

viewer.setCallbacks({
  sceneReady: async () => {
    await viewer.view.setBackgroundColor(BACKGROUND, BACKGROUND);
    viewer.view.navCube.enable();
    // A tap on a body selects the whole element (or nothing outside the storeys).
    viewer.selectionManager.setSelectionFilter((node) => (elements.size ? elementOf(node) : node));
    showMessage(null);
    send({ type: "ready" });

    // Opened directly in a desktop browser: ?model=../models/Duplex.scs
    const param = new URLSearchParams(location.search).get("model");
    if (param) window.bim.loadModel(param);
  },
  selectionArray: onSelection,
});
viewer.start();

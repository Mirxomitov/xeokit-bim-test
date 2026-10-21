// Minimal Autodesk Platform Services client: 2-legged OAuth, OSS upload, Model Derivative.
// Plain fetch, no SDK. Credentials come from APS_CLIENT_ID / APS_CLIENT_SECRET (see .env.example).
const HOST = "https://developer.api.autodesk.com";

const clientId = process.env.APS_CLIENT_ID;
const clientSecret = process.env.APS_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error("Set APS_CLIENT_ID and APS_CLIENT_SECRET in aps/server/.env (see .env.example)");
  process.exit(1);
}

// Bucket keys are global across all APS apps, so derive one from the client id.
export const bucket = process.env.APS_BUCKET || `${clientId.toLowerCase().replace(/[^a-z0-9]/g, "")}-bim-test`;

const tokens = {}; // scope -> {access_token, expires_at}

export async function token(scope) {
  const cached = tokens[scope];
  if (cached && cached.expires_at - Date.now() > 60_000) return cached;
  const res = await fetch(`${HOST}/authentication/v2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials", scope }),
  });
  if (!res.ok) throw new Error(`token: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return (tokens[scope] = { ...json, expires_at: Date.now() + json.expires_in * 1000 });
}

async function api(method, path, { scope = "data:read data:write data:create bucket:create bucket:read", body, headers } = {}) {
  const { access_token } = await token(scope);
  const res = await fetch(`${HOST}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${access_token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function ensureBucket() {
  try {
    await api("POST", "/oss/v2/buckets", { body: { bucketKey: bucket, policyKey: "persistent" } });
  } catch (e) {
    if (e.status !== 409) throw e; // 409: already exists
  }
}

// Signed S3 upload in 20 MB parts. Returns the object id (urn:adsk.objects:os.object:...).
export async function upload(key, data) {
  const PART = 20 * 1024 * 1024;
  const parts = Math.max(1, Math.ceil(data.length / PART));
  const objectPath = `/oss/v2/buckets/${bucket}/objects/${encodeURIComponent(key)}/signeds3upload`;
  const { uploadKey, urls } = await api("GET", `${objectPath}?parts=${parts}&minutesExpiration=60`);
  for (let i = 0; i < parts; i++) {
    const res = await fetch(urls[i], { method: "PUT", body: data.subarray(i * PART, (i + 1) * PART) });
    if (!res.ok) throw new Error(`S3 part ${i + 1}/${parts}: ${res.status}`);
  }
  const object = await api("POST", objectPath, { body: { uploadKey } });
  return object.objectId;
}

export const urnOf = (objectId) => Buffer.from(objectId).toString("base64url");

// SVF2 is the streaming format the current viewer is built for.
export function translate(urn) {
  return api("POST", "/modelderivative/v2/designdata/job", {
    headers: { "x-ads-force": "true" },
    body: { input: { urn }, output: { formats: [{ type: "svf2", views: ["3d"] }] } },
  });
}

export function manifest(urn) {
  return api("GET", `/modelderivative/v2/designdata/${urn}/manifest`, { scope: "data:read" });
}

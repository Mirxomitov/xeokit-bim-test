# xeokit BIM test

A small test of viewing a BIM model on a phone: a [xeokit](https://xeokit.io) viewer inside a
Flutter WebView, with per-element status colours, floor isolation and tap-to-inspect.

```
converter/  @xeokit/xeokit-convert: IFC -> XKT
viewer/     Vite + xeokit page with the Flutter bridge; builds into app/assets/viewer
app/        Flutter app (iOS/Android): WebView + native floor list, legend, element card
scripts/    fetch-samples.sh: downloads public IFC samples and converts them
aps/        the same app on Autodesk Platform Services Viewer instead of xeokit (see below)
hoops/      the same app on HOOPS Visualize Web instead of xeokit (see below)
```

## Run

```sh
# Optional: the larger sample model (Duplex.xkt is already in the app)
./scripts/fetch-samples.sh

# After editing viewer/main.js
cd viewer && npm ci && npm run build

cd app && flutter run
flutter run --dart-define=MODEL=schependomlaan.xkt --dart-define=FLOOR=2   # test hooks
```

The building icon (top right) switches models. The app serves its assets on 127.0.0.1 because
Android WebView blocks fetch() from file:// pages, so cleartext and ATS local-networking
exceptions are set. Element statuses are fake (`app/lib/fake_statuses.dart`): lower floors
done, middle in progress, upper not started, about 3 % remarks. iOS minimum is 15.0.

Sample models: `Duplex.ifc` from [xeokit-convert](https://github.com/xeokit/xeokit-convert),
`schependomlaan.ifc`, `skolebygg.ifc` and `mab7000.ifc` from the [web-ifc](https://github.com/ThatOpen/engine_web-ifc)
test files, `arboleda.ifc` from Vectorworks' Arboleda open BIM project. Arboleda is the model to
compare all three engines on: Tech Soft 3D publishes the same building as `arboleda.scs`, so the
HOOPS app shows it without a converter license.

## Bridge

- Flutter -> JS: `bim.loadModel(url, {edges})`, `setStatuses({globalId: status})`,
  `isolateFloor(storeyId)`, `showAll()`, `flyTo(id)`, `select(id)`
- JS -> Flutter (`Bridge` channel, JSON): `ready`, `loaded` (ms, objects, storeys), `pick`, `error`

## APS version (`aps/`)

The same Flutter UI and bridge, with the [APS Viewer](https://aps.autodesk.com/viewer-sdk) drawing
the model, to compare the two engines.

```
aps/server/  Node (no deps): upload.js (IFC -> OSS bucket -> SVF2), server.js (viewer page, /token, /models)
aps/viewer/  the viewer page: APS Viewer v7 from Autodesk's CDN, same window.bim bridge
aps/app/     Flutter app: copy of app/ minus the asset server; the WebView opens the server
```

```sh
./scripts/fetch-samples.sh                       # IFC samples in samples/
cd aps/server && cp .env.example .env            # APS_CLIENT_ID / APS_CLIENT_SECRET
npm run upload                                   # or: npm run upload -- Duplex
npm start                                        # http://localhost:8090/?model=Duplex in a browser

cd aps/app && flutter run                                           # simulator / emulator
flutter run --dart-define=APS_SERVER=http://192.168.1.10:8090       # phone: the LAN address server.js prints
```

Needs an APS app (aps.autodesk.com/myapps) with the Data Management and Model Derivative APIs.
The client secret stays in `aps/server/.env`; the WebView only gets a `viewables:read` token.

What differs from xeokit, by design of the platform:

- Models are translated in Autodesk's cloud (IFC -> SVF2) and streamed from it: the phone needs
  internet and an access token, nothing is bundled in the app.
- Translation and viewing are metered by APS (Model Derivative uses Flex tokens); xeokit is free
  under AGPL-3.0 and converts locally.
- The viewer works with numeric dbIds; the page maps them to IFC GlobalIds (the APS externalId),
  so statuses use the same keys as in the xeokit app.
- Theming colours can't make objects transparent, so "not started" is plain grey instead of 35 %
  opacity. Floor isolation uses the viewer's ghosting instead of x-ray.
- Storeys are found by searching the property database for `IfcBuildingStorey` (falls back to
  the children of the IFC building node).

## HOOPS version (`hoops/`)

The same Flutter UI and bridge, with [HOOPS Visualize Web](https://www.techsoft3d.com/products/hoops/visualize-web/)
(Tech Soft 3D, formerly HOOPS Communicator) drawing the model. Like xeokit, everything runs on the
phone: the viewer and the .scs models are app assets served on 127.0.0.1.

```
hoops/viewer/       Vite page on @ts3d-hoops/web-viewer (npm), same window.bim bridge; builds into hoops/app/assets/viewer
hoops/app/          Flutter app: copy of app/ with the .scs model list
hoops/convert.sh    IFC -> .scs with HOOPS Converter (Docker image techsoft3d/hoops-converter)
hoops/fetch-demo.sh arboleda.scs and condo.scs, Tech Soft 3D's demo buildings, to try the app without a license
```

```sh
./scripts/fetch-samples.sh                       # IFC samples in samples/
echo -n "<HOOPS license key>" > hoops/license.txt
./hoops/convert.sh                               # or: ./hoops/convert.sh Duplex
./hoops/fetch-demo.sh                            # arboleda.scs, condo.scs (no license needed)
cd hoops/viewer && npm ci && npm run build
cd ../app && flutter run
flutter run --dart-define=MODEL=arboleda.scs --dart-define=FLOOR=1
```

The converter needs a HOOPS license key (evaluation from techsoft3d.com); the web viewer itself
needs none. Converter is a Windows/Linux binary; on a Mac it runs from Docker (colima works). The
arm64 image 2026.8.0 is broken (empty system libraries, Xvfb won't start), so the script runs the
amd64 image under emulation. With the SDK installed: `HOOPS_CONVERTER=/path/to/converter`.

Nothing from HOOPS is committed: the npm packages and the converter are proprietary, so the built
viewer (`hoops/app/assets/viewer`, includes `engine.esm.wasm`) and the .scs models are gitignored
and built locally.

What differs from xeokit:

- Licensing: commercial (Tech Soft 3D), the conversion step needs a license key; xeokit is AGPL-3.0.
- Size: the viewer is 4.7 MB (1.4 MB JS + 3.3 MB WebAssembly engine) against 0.9 MB for xeokit.
- The viewer works with numeric node ids; the page maps them to IFC GlobalIds (the node's generic
  id, or the `<TYPE>/GlobalId` property in older .scs files), so statuses use the same keys.
- Converted IFC keeps the spatial tree; some converters add one grouping node per IFC class under
  each storey (`IFCWALLSTANDARDCASE`, …), which the page skips to find the elements.
- "Not started" is 35 % opaque like in xeokit (APS can't do that); floor isolation uses the x-ray
  draw mode with the storey excluded from it. IfcSpace volumes are hidden.

## License

AGPL-3.0, as required by xeokit-sdk and xeokit-convert (both AGPL-3.0). The APS Viewer is
loaded from Autodesk's CDN under the Autodesk terms of use. HOOPS Visualize Web is proprietary
(Tech Soft 3D); it is installed from npm and not part of this repository.

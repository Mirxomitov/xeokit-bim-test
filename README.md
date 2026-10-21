# xeokit BIM test

A small test of viewing a BIM model on a phone: a [xeokit](https://xeokit.io) viewer inside a
Flutter WebView, with per-element status colours, floor isolation and tap-to-inspect.

```
converter/  @xeokit/xeokit-convert: IFC -> XKT
viewer/     Vite + xeokit page with the Flutter bridge; builds into app/assets/viewer
app/        Flutter app (iOS/Android): WebView + native floor list, legend, element card
scripts/    fetch-samples.sh: downloads public IFC samples and converts them
aps/        the same app on Autodesk Platform Services Viewer instead of xeokit (see below)
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
`schependomlaan.ifc` from the [web-ifc](https://github.com/ThatOpen/engine_web-ifc) test files.

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

## License

AGPL-3.0, as required by xeokit-sdk and xeokit-convert (both AGPL-3.0). The APS Viewer is
loaded from Autodesk's CDN under the Autodesk terms of use.

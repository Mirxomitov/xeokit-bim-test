# xeokit BIM test

A small test of viewing a BIM model on a phone: a [xeokit](https://xeokit.io) viewer inside a
Flutter WebView, with per-element status colours, floor isolation and tap-to-inspect.

```
converter/  @xeokit/xeokit-convert: IFC -> XKT
viewer/     Vite + xeokit page with the Flutter bridge; builds into app/assets/viewer
app/        Flutter app (iOS/Android): WebView + native floor list, legend, element card
scripts/    fetch-samples.sh: downloads public IFC samples and converts them
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

## License

AGPL-3.0, as required by xeokit-sdk and xeokit-convert (both AGPL-3.0).

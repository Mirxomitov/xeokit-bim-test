#!/usr/bin/env bash
# Downloads the public sample IFC models and converts them to XKT for the app.
set -euo pipefail
cd "$(dirname "$0")/.."

mkdir -p samples out app/assets/models
curl -fL -o samples/Duplex.ifc \
  https://raw.githubusercontent.com/xeokit/xeokit-convert/main/examples/sample-project/assets/Duplex.ifc
curl -fL -o samples/schependomlaan.ifc \
  https://raw.githubusercontent.com/ThatOpen/engine_web-ifc/main/tests/ifcfiles/public/schependomlaan.ifc

(cd converter && npm ci --ignore-scripts)
for m in Duplex schependomlaan; do
  (cd converter && npx xeokit-convert -s "../samples/$m.ifc" -o "../out/$m.xkt" -l)
  cp "out/$m.xkt" app/assets/models/
done

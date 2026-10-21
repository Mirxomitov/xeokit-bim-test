#!/usr/bin/env bash
# Downloads the public sample IFC models and converts them to XKT for the app.
set -euo pipefail
cd "$(dirname "$0")/.."

WEBIFC=https://raw.githubusercontent.com/ThatOpen/engine_web-ifc/main/tests/ifcfiles/public

mkdir -p samples out app/assets/models
curl -fL -o samples/Duplex.ifc \
  https://raw.githubusercontent.com/xeokit/xeokit-convert/main/examples/sample-project/assets/Duplex.ifc
curl -fL -o samples/schependomlaan.ifc "$WEBIFC/schependomlaan.ifc"
# Large test models: a school (57 MB IFC) and a 28-storey building (73 MB IFC)
curl -fL -o samples/skolebygg.ifc "$WEBIFC/ISSUE_068_ARK_NUS_skolebygg.ifc"
curl -fL -o samples/mab7000.ifc "$WEBIFC/ISSUE_098_R8_F1_MAB_AR_M3_XX_XXX_MO_7000.ifc"

(cd converter && npm ci --ignore-scripts)
for m in Duplex schependomlaan skolebygg mab7000; do
  (cd converter && npx xeokit-convert -s "../samples/$m.ifc" -o "../out/$m.xkt" -l)
  cp "out/$m.xkt" app/assets/models/
done

#!/usr/bin/env bash
# Downloads Tech Soft 3D's ready-made .scs buildings, to try the HOOPS app without a converter
# license (not committed, like the other models):
#   arboleda.scs  from ts3d-hc-clashmanager (MIT); same building as samples/arboleda.ifc,
#                 so all three apps can show it
#   condo.scs     from mobile-aec-viewer (no license)
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p app/assets/models
curl -fL -o app/assets/models/arboleda.scs \
  https://raw.githubusercontent.com/techsoft3d/ts3d-hc-clashmanager/HEAD/dev/public/models/arboleda.scs
curl -fL -o app/assets/models/condo.scs \
  https://raw.githubusercontent.com/techsoft3d/mobile-aec-viewer/HEAD/model-data/condo.scs

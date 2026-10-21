#!/usr/bin/env bash
# Converts the IFC samples (fetched by scripts/fetch-samples.sh) to HOOPS Stream Cache (.scs)
# files in the app's assets with HOOPS Converter. Needs a HOOPS license key, in hoops/license.txt
# (the key alone, nothing else) or in $HOOPS_LICENSE.
#   ./hoops/convert.sh                      # all samples
#   ./hoops/convert.sh Duplex               # just one
#
# Converter runs from Tech Soft 3D's Docker image. Its arm64 build (2026.8.0) ships empty
# system libraries and can't start Xvfb, so the amd64 image is used (emulated on Apple silicon).
# With the SDK installed on Linux/Windows: HOOPS_CONVERTER=/path/to/converter ./hoops/convert.sh
set -euo pipefail
cd "$(dirname "$0")/.."

IMAGE=techsoft3d/hoops-converter:2026.8.0
OUT=hoops/app/assets/models

if [[ -n "${HOOPS_LICENSE:-}" ]]; then
  license=(--license "$HOOPS_LICENSE")
elif [[ -s hoops/license.txt ]]; then
  license=(--license_file /work/hoops/license.txt)
  [[ -n "${HOOPS_CONVERTER:-}" ]] && license=(--license_file hoops/license.txt)
else
  echo "No license: put the HOOPS key in hoops/license.txt or HOOPS_LICENSE" >&2
  exit 1
fi

convert() { # input output
  if [[ -n "${HOOPS_CONVERTER:-}" ]]; then
    "$HOOPS_CONVERTER" --input "$1" --output_scs "$2" "${license[@]}"
  else
    docker run --rm --platform linux/amd64 -v "$PWD:/work" -w /work --user "$(id -u):$(id -g)" \
      "$IMAGE" --input "/work/$1" --output_scs "/work/$2" "${license[@]}"
  fi
}

mkdir -p "$OUT"
models=("$@")
[[ ${#models[@]} -eq 0 ]] && models=(Duplex schependomlaan skolebygg mab7000)
for m in "${models[@]}"; do
  if [[ ! -f "samples/$m.ifc" ]]; then
    echo "skip $m: samples/$m.ifc missing (run scripts/fetch-samples.sh)" >&2
    continue
  fi
  started=$SECONDS
  convert "samples/$m.ifc" "$OUT/$m.scs" | grep -E "ERROR|WARNING|Exiting" || true
  [[ -s "$OUT/$m.scs" ]] || { echo "$m: conversion failed" >&2; continue; }
  echo "$m: $(du -h "$OUT/$m.scs" | cut -f1) in $((SECONDS - started)) s"
done

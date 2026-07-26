#!/usr/bin/env bash
# Verify a published Android APK and republish it under an IMMUTABLE tag.
#
# WHY THIS EXISTS
# ---------------
# Sideloaded builds kept "sticking at 100%" for the owner, in Chrome as well as
# Discord, intermittently. The cause was not the browser and not the file:
#
#   1. `android-latest` is a ROLLING tag. Every CI build overwrites the same
#      asset. If a download is in flight when a new build publishes, the bytes
#      change underneath it and the transfer stalls right at the end.
#   2. GitHub redirects release downloads to a SIGNED, TIME-LIMITED S3 URL
#      (about an hour). A large download on slow mobile data can outlive the
#      signature and stall near completion.
#
# Both are fixed by handing over an immutable, version-tagged URL instead of the
# rolling one, and by publishing a checksum so a truncated download is provable
# rather than guesswork.
#
# USAGE
#   scripts/release-verify.sh <version>        # e.g. 0.7.2
#   scripts/release-verify.sh 0.7.2 --no-publish   # verify only
#
# Reusable as-is for any of the other Android repos: it only assumes a release
# tag `android-latest` carrying one .apk asset.
set -euo pipefail

VERSION="${1:?usage: release-verify.sh <version> [--no-publish]}"
PUBLISH=1
[[ "${2:-}" == "--no-publish" ]] && PUBLISH=0

ROLLING_TAG="${ROLLING_TAG:-android-latest}"
REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
# Auto-detect the apk asset so this drops into any of the other Android repos
# without editing: whatever .apk the rolling release carries is the one we check.
ASSET="$(gh release view "$ROLLING_TAG" --json assets -q '.assets[] | select(.name|endswith(".apk")) | .name' | sed -n '1p')"
[[ -n "$ASSET" ]] || { echo "FAIL: no .apk asset on tag $ROLLING_TAG" >&2; exit 1; }
APP_NAME="$(basename "$ASSET" .apk)"
URL="https://github.com/${REPO}/releases/download/${ROLLING_TAG}/${ASSET}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

SDK="${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}"
BT="$SDK/build-tools/$(ls "$SDK/build-tools" | sort -V | tail -1)"
export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home}"

fail() { echo "FAIL: $*" >&2; exit 1; }

echo "1/6 declared size"
DECLARED=$(curl -sIL "$URL" | awk 'BEGIN{IGNORECASE=1}/^content-length:/{v=$2}END{gsub(/\r/,"",v);print v}')
[[ -n "$DECLARED" ]] || fail "no Content-Length from the release URL"
echo "     server says ${DECLARED} bytes"

echo "2/6 download"
curl -sL -o "$TMP/app.apk" "$URL"
ACTUAL=$(wc -c < "$TMP/app.apk" | tr -d ' ')
echo "     received  ${ACTUAL} bytes"
# A truncated asset is exactly what makes a phone hang at 100%.
[[ "$ACTUAL" == "$DECLARED" ]] || fail "size mismatch: declared $DECLARED, got $ACTUAL (truncated asset)"

echo "3/6 zip integrity"
unzip -tqq "$TMP/app.apk" >/dev/null 2>&1 || fail "APK is not a valid archive (corrupt upload)"

echo "4/6 signature"
"$BT/apksigner" verify "$TMP/app.apk" >/dev/null 2>&1 || fail "signature does not verify"
SHA1=$("$BT/apksigner" verify --print-certs "$TMP/app.apk" 2>/dev/null | awk '/SHA-1 digest/{print $NF; exit}')
echo "     signer SHA-1 ${SHA1}"

echo "5/6 manifest parses"
# NOTE: no `| head -1` here — head closes the pipe, aapt2 takes SIGPIPE and
# `pipefail` turns that into a spurious failure (exit 141).
BADGING=$("$BT/aapt2" dump badging "$TMP/app.apk" 2>/dev/null | sed -n '1p')
echo "     $BADGING"
grep -q "versionName='${VERSION}'" <<<"$BADGING" || fail "APK is not version ${VERSION} (stale build published?)"
# Uncompressed install footprint: the installer needs room for this, and a very
# large one is what makes PackageInstaller grind.
UNCOMPRESSED=$(unzip -l "$TMP/app.apk" | awk 'END{print $1}')
echo "     download $((ACTUAL/1048576))MB, unpacks to $((UNCOMPRESSED/1048576))MB"
[[ "$UNCOMPRESSED" -lt 300000000 ]] || fail "install footprint over 300MB, expect installer trouble"

SHA256=$(shasum -a 256 "$TMP/app.apk" | awk '{print $1}')
echo "6/6 sha256 ${SHA256}"

if [[ "$PUBLISH" == "1" ]]; then
  TAG="v${VERSION}"
  echo "publishing immutable ${TAG}"
  # Immutable: a link handed to a human must never change under them mid-download.
  if gh release view "$TAG" >/dev/null 2>&1; then
    gh release upload "$TAG" "$TMP/app.apk#${ASSET}" --clobber
  else
    gh release create "$TAG" "$TMP/app.apk#${ASSET}" \
      --title "${APP_NAME} ${VERSION}" \
      --notes "$(printf 'Verified build of %s.\n\nsha256: `%s`\nsigner SHA-1: `%s`\ndownload: %s MB\n\nThis tag is immutable — the file behind this link will not change, so a download cannot be replaced mid-transfer.' "$VERSION" "$SHA256" "$SHA1" "$((ACTUAL/1048576))")"
  fi
  echo
  echo "PERMALINK (hand this over, not android-latest):"
  gh release view "$TAG" --json assets -q '.assets[0].url'
fi

echo
echo "ALL CHECKS PASSED"

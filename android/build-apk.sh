#!/usr/bin/env bash
# Builds BC-Tracker.apk from the web app (index.html, css/, js/, icons/)
# plus the small native Android part in android/src (notifications,
# home screen widget, file saving). No Android Studio or Gradle needed.
#
# Needs Java 17+ and Python 3, plus these files in android/tools/:
#   android-36.jar  https://raw.githubusercontent.com/Sable/android-platforms/master/android-36/android.jar
#   aapt2           Linux aapt2 binary (Android SDK build-tools, or the npm package aaptjs3)
#   apksigner.jar   Android SDK build-tools/lib/apksigner.jar
#   d8/             d8.jar and its libraries (Android SDK build-tools/lib/d8.jar on its own also works)
#
# Signing key: put bctracker-release.jks in android/ (never commit it) and run
#   KS_PASS=yourpassword ./android/build-apk.sh
#
# Version: android/version.properties
set -euo pipefail
cd "$(dirname "$0")"
T=tools
prop() { grep -E "^$1=" version.properties | cut -d= -f2; }
VCODE=$(prop versionCode); VNAME=$(prop versionName); MINSDK=$(prop minSdk); TARGET=$(prop targetSdk)
KS=${KS:-bctracker-release.jks}; KS_ALIAS=${KS_ALIAS:-bctracker}
: "${KS_PASS:?Set KS_PASS to your keystore password}"
echo "Building B.C Tracker $VNAME ($VCODE), target API $TARGET"

rm -rf build && mkdir -p build/gen build/classes build/dex build/assets/www
cp -r ../index.html ../css ../js ../icons ../manifest.json build/assets/www/

# Resources and manifest
$T/aapt2 compile --dir res -o build/res.zip
$T/aapt2 link -o build/base.apk -I $T/android-36.jar --manifest AndroidManifest.xml \
  --min-sdk-version "$MINSDK" --target-sdk-version "$TARGET" --version-code "$VCODE" --version-name "$VNAME" \
  --java build/gen -A build/assets --auto-add-overlay build/res.zip

# Java to dex
mkdir -p build/gen/com/shanesenbradz/bctracker
cat > build/gen/com/shanesenbradz/bctracker/BuildInfo.java <<JAVA
package com.shanesenbradz.bctracker;
final class BuildInfo { static final String VERSION = "$VNAME"; private BuildInfo() {} }
JAVA
javac -nowarn -Xlint:-options -source 8 -target 8 -encoding UTF-8 -bootclasspath $T/android-36.jar -d build/classes \
  $(find src build/gen -name '*.java')
D8CP=$T/d8.jar; [ -d $T/d8 ] && D8CP="$T/d8/*"
# Newer javac adds MethodParameters entries that older d8 builds choke on, so strip them
mkdir -p build/strip
javac -nowarn -cp "$D8CP" -d build/strip buildtools/StripParams.java
java -cp "build/strip:$D8CP" StripParams $(find build/classes -name '*.class')
[ -f $T/android-36-d8.jar ] || java -cp "build/strip:$D8CP" StripParams $T/android-36.jar $T/android-36-d8.jar
java -cp "$D8CP" com.android.tools.r8.D8 --release --min-api "$MINSDK" --lib $T/android-36-d8.jar \
  --output build/dex $(find build/classes -name '*.class')
( cd build/dex && zip -q -X ../base.apk classes.dex )

# Align and sign
python3 zipalign.py build/base.apk build/aligned.apk
java -jar $T/apksigner.jar sign --ks "$KS" --ks-key-alias "$KS_ALIAS" --ks-pass env:KS_PASS --key-pass env:KS_PASS \
  --min-sdk-version "$MINSDK" --out ../BC-Tracker.apk build/aligned.apk
java -jar $T/apksigner.jar verify --min-sdk-version "$MINSDK" ../BC-Tracker.apk
if unzip -v ../BC-Tracker.apk resources.arsc | grep -q "Defl"; then
  echo "ERROR: resources.arsc is compressed"; exit 1
fi
rm -f ../BC-Tracker.apk.idsig
echo "Built BC-Tracker.apk ($(du -h ../BC-Tracker.apk | cut -f1))"

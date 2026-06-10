# OBTV Studios — Android TV app

A thin native Android wrapper that opens the OBTV TV site
(`https://studios.obtv.io/tv`) full-screen and shows up on the Android TV home
screen. It is a single full-screen WebView, so anything the `/tv` site can do in
a browser (live streams, QR pairing, remote/DPAD navigation) works here too.

## Get the APK (no tools to install)

The APK is built automatically in the cloud by GitHub Actions.

1. Push this folder to GitHub (it lives in the `tbnobed/studios` repo).
2. Go to the repo on github.com → **Actions** tab → **Build Android TV APK**.
3. The build runs on every push that touches `android-tv/`. You can also start
   one manually with **Run workflow**.
4. When it finishes (green check), open the run and download the
   **`obtv-tv-debug-apk`** artifact at the bottom. Inside is `app-debug.apk`.

## Install it on the Android TV

The simplest way is over the network with `adb`:

```bash
adb connect <TV-IP-ADDRESS>:5555
adb install -r app-debug.apk
```

To enable this on the TV: **Settings → Device Preferences → About →** click
**Build** seven times to unlock Developer options, then **Settings → Device
Preferences → Developer options →** turn on **USB debugging** / **Network
debugging**. The TV's IP is under **Settings → Network & Internet**.

Alternatively, copy `app-debug.apk` onto a USB stick (or use a sideload app like
"Downloader") and open it on the TV with a file manager. You'll need to allow
"install from unknown sources" for that app.

After installing, the app appears on the Android TV home as **OBTV Studios**.

## Changing the URL

The address the app opens is in
`app/src/main/res/values/strings.xml` → `app_url`. Edit it and rebuild.

## Building locally (optional)

If you'd rather build on your own machine, you need a JDK 17 and the Android SDK
(easiest via Android Studio). Then:

```bash
cd android-tv
./gradlew assembleDebug
# output: app/build/outputs/apk/debug/app-debug.apk
```

## Notes

- This is a **debug** build, which is signed with Android's debug key — perfect
  for sideloading onto your own devices. A Play Store release would need a proper
  signing key; ask if you want that set up.
- The app requires the device to reach `https://studios.obtv.io` over the
  network. It uses HTTPS only. If you ever need it to open a plain-`http://`
  address, that requires a small manifest change (cleartext traffic) — ask and
  I'll add it.

# AAAStreamer wxPython Smoke Client

This is a small native-client spike for the `/api/client/v1` contract. It is not
the production desktop app yet.

The goal is to prove that a native Python/wxPython client can:

- read public service/bootstrap metadata
- start the native device authorization flow
- poll for approval and receive a bearer token
- check in with the server using that bearer token
- list streams through the native API without scraping dashboard HTML

OBS is deliberately optional. The smoke client keeps OBS local to the desktop:
future passes can add OBS WebSocket discovery/control for previewing scenes or
copying encoder settings, but AAAStreamer should still work with OBS, Ecamm,
Larix, Audio Hijack, or any RTMP encoder.

## Requirements

- Python 3.10 or newer
- wxPython for the graphical app
- No extra package is required for the command-line smoke checks

Install GUI dependency:

```bash
python3 -m pip install -r requirements.txt
```

Run the GUI:

```bash
python3 aaastreamer_smoke.py --base-url http://127.0.0.1:8095
```

Run a headless health/bootstrap check:

```bash
python3 aaastreamer_smoke.py --base-url http://127.0.0.1:8095 --headless
```

Run a headless stream-list check with an approved native-client token:

```bash
AAASTREAMER_CLIENT_TOKEN=... python3 aaastreamer_smoke.py --base-url http://127.0.0.1:8095 --headless
```

Tokens are not written to disk by this prototype. Production clients must store
tokens in platform secure storage such as Windows Credential Manager/DPAPI or
macOS Keychain.

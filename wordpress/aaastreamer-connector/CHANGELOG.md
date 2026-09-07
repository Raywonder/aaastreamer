# AAAStreamer Connector

## 0.2.1

- Play HLS audio in Media Source browsers using bundled hls.js 1.7.2, while
  retaining native HLS support where available. Its license is in assets.
- Use WordPress's query REST route when pretty REST URLs return an error.
- Correct the settings-save check-in hook and live-status detection.
- Add WordPress update discovery and preserve the site's update preference.
- Add the paired WordPress sign-in bridge; it requires a supporting AAAStreamer
  server and an authorized client pairing before it can be used.
- Preserve existing site settings and stream mapping during upgrades.

The connector complements the full platform. Server features depend on the
installed server version, configuration, and account entitlement. This plugin
release does not deploy the separate server feature branch.

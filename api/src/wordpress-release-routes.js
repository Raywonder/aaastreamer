import fs from 'node:fs';
import path from 'node:path';

// This directory contains only published plugin artifacts, never repository
// credentials or account data. Versioned archives are immutable.
export function registerWordPressReleaseRoutes(app, releaseDir) {
  app.get('/api/wordpress/releases/aaastreamer-connector', (_req, res, next) => {
    const manifest = path.join(releaseDir, 'wordpress-update-manifest.json');
    if (!fs.existsSync(manifest)) return next();
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.sendFile(manifest);
  });
  app.get('/api/wordpress/downloads/aaastreamer-connector-:version.zip', (req, res) => {
    if (!/^\d+\.\d+\.\d+$/.test(req.params.version)) return res.sendStatus(404);
    const archive = path.join(releaseDir, `aaastreamer-connector-${req.params.version}.zip`);
    if (!fs.existsSync(archive)) return res.sendStatus(404);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.download(archive);
  });
}

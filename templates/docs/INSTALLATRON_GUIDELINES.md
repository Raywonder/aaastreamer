# Installatron Guidelines
Last updated: 2026-04-03

Use Installatron for hosted web apps, browser admin layers, portals, and API bridges.
Do not use it as the primary distribution method for native desktop binaries.

## Required package pieces
- install.xml
- uninstall.xml
- upgrade.xml
- application archive
- post-install hooks where needed

## `.well-known`
- preserve `acme-challenge`
- create only app-owned files
- expose only non-secret metadata

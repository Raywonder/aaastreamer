# Tokenized listening links

Use the stream dashboard's share link (`/go/<token>`) when linking a listener
from a website, profile, or WordPress connector. It is a listening-page link,
not a media-server source URL, API login token, or encoder publishing key.

Existing token links remain unchanged. The server prefers an existing stream
share token for its public `watchUrl`; the legacy `/s/<slug>` route remains a
compatible destination. A token link currently redirects to that page, so it
is not an additional private-access or paywall boundary. Do not treat it as
authentication for broadcasting or administration.

An offline stream can have a working listening link without playable media.
Configure an authorized source or start a broadcast before expecting audio.
Creating a listening link does not activate an account or select its source.

On 2026-09-07 the hosted recovery preserved TappedIn's link, restored Main
Stream and Tony's saved links, and created missing links for JBreez, Mat T,
Rocco, and SoulFoodRadio. SoulFoodRadio's existing WordPress connector was
configured to use its tokenized full-page destination. Tokens are not recorded
in this document or source control.

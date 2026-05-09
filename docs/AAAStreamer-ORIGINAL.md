# AAAStreamer.md

## Overview
AAAStreamer is a self-hosted, multi-platform live streaming system designed for accessibility, automation, and scalability.

## Features
- RTMP Server (NGINX + Apache support)
- OBS Integration
- Multi-stream (YouTube, Substack, Twitch, etc.)
- VoiceLink API hooks
- Live chat with rich messaging
- Moderation system
- Advanced analytics dashboard

---

## RTMP + NGINX Setup
(See previous configuration blocks for full install steps)

---

## Apache Support (Reverse Proxy)
Enable modules:
a2enmod proxy proxy_http proxy_rtmp

Example VirtualHost:

<VirtualHost *:80>
    ServerName yourdomain.com

    ProxyPass /hls http://127.0.0.1:8080/hls
    ProxyPassReverse /hls http://127.0.0.1:8080/hls
</VirtualHost>

---

## Multi-Platform Streaming

Use FFmpeg for restreaming:

ffmpeg -re -i rtmp://localhost/live/streamkey -f flv rtmp://a.rtmp.youtube.com/live2/YOUR_YOUTUBE_KEY -f flv rtmp://live-api-s.facebook.com:80/rtmp/YOUR_FACEBOOK_KEY

Supported platforms:
- YouTube Live
- Twitch
- Facebook Live
- Substack Live (via RTMP bridge)
- Custom RTMP endpoints

---

## VoiceLink API Integration

Endpoints:
POST /api/voicelink/on_publish
POST /api/voicelink/on_done
POST /api/voicelink/validate_user

Features:
- Trust score validation
- Auto transcription
- Event triggers

---

## Live Chat System

Features:
- WebSocket-based
- Rich messaging (emojis, reactions, attachments)
- Roles: viewer, mod, admin

API:
GET /api/chat/messages
POST /api/chat/send
POST /api/chat/moderate

Moderation:
- Ban/kick users
- Message filtering
- Trust score enforcement

---

## Analytics Dashboard

Track:
- Concurrent viewers
- Bitrate + stream health
- Engagement metrics
- Chat activity

Accessible UI:
- Screen reader labels
- Keyboard navigation
- Audio cues (optional)

---

## WordPress Integration

Embed player:

<video controls autoplay>
<source src="http://yourdomain.com/hls/live/stream.m3u8" type="application/x-mpegURL">
</video>

Shortcode example:
[accessiblestreamer player="live"]

---

## Future Native App

- iOS + Android streaming control
- Built-in VoiceLink AI assistant
- Push notifications
- Offline analytics sync

---

## Final Notes

This system is designed to:
- Be fully self-hosted
- Support accessibility first
- Scale into a full streaming platform

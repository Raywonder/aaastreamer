#!/usr/bin/env python3
"""Small wxPython smoke client for AAAStreamer native-client API v1."""

from __future__ import annotations

import argparse
import json
import os
import platform
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any


APP_VERSION = "0.1.0-smoke"


class ApiError(RuntimeError):
    pass


@dataclass
class ApiClient:
    base_url: str
    token: str = ""

    def __post_init__(self) -> None:
        self.base_url = self.base_url.rstrip("/")

    def request(self, method: str, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        body = None
        headers = {
            "Accept": "application/json",
            "User-Agent": f"AAAStreamer-wxPython-smoke/{APP_VERSION}",
        }
        if payload is not None:
            body = json.dumps(payload).encode("utf-8")
            headers["Content-Type"] = "application/json"
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        url = f"{self.base_url}{path}"
        req = urllib.request.Request(url, data=body, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=12) as response:
                raw = response.read().decode("utf-8")
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode("utf-8", "replace")
            raise ApiError(f"{exc.code} {exc.reason}: {raw}") from exc
        except urllib.error.URLError as exc:
            raise ApiError(str(exc.reason)) from exc
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise ApiError(f"Non-JSON response from {url}: {raw[:200]}") from exc
        if parsed.get("success") is False:
            raise ApiError(parsed.get("error") or json.dumps(parsed))
        return parsed

    def health(self) -> dict[str, Any]:
        return self.request("GET", "/api/client/v1/health")

    def bootstrap(self) -> dict[str, Any]:
        return self.request("GET", "/api/client/v1/bootstrap")

    def start_auth(self) -> dict[str, Any]:
        return self.request("POST", "/api/client/v1/auth/start", {
            "clientName": "AAAStreamer wxPython smoke client",
            "platform": platform.system().lower() or sys.platform,
            "version": APP_VERSION,
            "supportedInputs": ["keyboard", "screen-reader"],
            "supportedOutputs": ["native-ui"],
        })

    def poll_auth(self, poll_token: str) -> dict[str, Any]:
        safe_token = urllib.parse.quote(poll_token, safe="")
        return self.request("GET", f"/api/client/v1/auth/poll/{safe_token}")

    def check_in(self) -> dict[str, Any]:
        return self.request("POST", "/api/client/v1/device/check-in", {
            "version": APP_VERSION,
            "supportedInputs": ["keyboard", "screen-reader"],
            "supportedOutputs": ["native-ui"],
        })

    def streams(self) -> dict[str, Any]:
        return self.request("GET", "/api/client/v1/streams")


def summarize_stream(stream: dict[str, Any]) -> str:
    title = stream.get("title") or stream.get("name") or stream.get("slug") or stream.get("id") or "Untitled stream"
    live = "live" if stream.get("live") or stream.get("isLive") else "offline"
    owner = stream.get("ownerName") or stream.get("ownerUsername") or ""
    return f"{title} - {live}{f' - {owner}' if owner else ''}"


def run_headless(client: ApiClient) -> int:
    health = client.health()
    service = health.get("service", {})
    print(f"Service: {service.get('service', 'aaastreamer')} {service.get('version', '')}".strip())
    bootstrap = client.bootstrap()
    branding = bootstrap.get("branding", {})
    print(f"Branding: {branding.get('platformName') or 'AAAStreamer'}")
    if client.token:
        device = client.check_in()
        user = device.get("user") or {}
        print(f"Authorized as: {user.get('displayName') or user.get('username') or user.get('id')}")
        streams = client.streams().get("streams", [])
        print(f"Streams: {len(streams)}")
        for stream in streams[:10]:
            print(f"- {summarize_stream(stream)}")
    else:
        print("No bearer token set; stream list not requested.")
    return 0


def run_gui(client: ApiClient) -> int:
    try:
        import wx  # type: ignore
    except ModuleNotFoundError:
        print("wxPython is not installed. Run: python3 -m pip install -r requirements.txt", file=sys.stderr)
        return 2

    class SmokeFrame(wx.Frame):
        def __init__(self) -> None:
            super().__init__(None, title="AAAStreamer Smoke Client", size=(760, 560))
            self.client = client
            self.poll_token = ""
            panel = wx.Panel(self)
            root = wx.BoxSizer(wx.VERTICAL)

            form = wx.FlexGridSizer(2, 2, 8, 8)
            form.AddGrowableCol(1, 1)
            form.Add(wx.StaticText(panel, label="Server URL"), 0, wx.ALIGN_CENTER_VERTICAL)
            self.base_url = wx.TextCtrl(panel, value=self.client.base_url)
            form.Add(self.base_url, 1, wx.EXPAND)
            form.Add(wx.StaticText(panel, label="Bearer token"), 0, wx.ALIGN_CENTER_VERTICAL)
            self.token = wx.TextCtrl(panel, value=self.client.token, style=wx.TE_PASSWORD)
            form.Add(self.token, 1, wx.EXPAND)
            root.Add(form, 0, wx.ALL | wx.EXPAND, 12)

            buttons = wx.BoxSizer(wx.HORIZONTAL)
            for label, handler in [
                ("Bootstrap", self.on_bootstrap),
                ("Start device auth", self.on_start_auth),
                ("Poll auth", self.on_poll_auth),
                ("Check in", self.on_check_in),
                ("Refresh streams", self.on_streams),
            ]:
                button = wx.Button(panel, label=label)
                button.Bind(wx.EVT_BUTTON, handler)
                buttons.Add(button, 0, wx.RIGHT, 8)
            root.Add(buttons, 0, wx.LEFT | wx.RIGHT | wx.BOTTOM, 12)

            self.output = wx.TextCtrl(panel, style=wx.TE_MULTILINE | wx.TE_READONLY | wx.TE_DONTWRAP)
            root.Add(self.output, 1, wx.LEFT | wx.RIGHT | wx.BOTTOM | wx.EXPAND, 12)
            panel.SetSizer(root)
            self.status = self.CreateStatusBar()
            self.say("Ready. Start with Bootstrap or device auth.")

        def refresh_client(self) -> None:
            self.client.base_url = self.base_url.GetValue().strip().rstrip("/")
            self.client.token = self.token.GetValue().strip()

        def say(self, message: str) -> None:
            self.output.AppendText(f"{message}\n")
            self.status.SetStatusText(message[:120])

        def call(self, label: str, func: Any) -> dict[str, Any] | None:
            self.refresh_client()
            try:
                result = func()
            except ApiError as exc:
                self.say(f"{label} failed: {exc}")
                return None
            self.say(f"{label} succeeded.")
            self.say(json.dumps(result, indent=2))
            return result

        def on_bootstrap(self, _event: Any) -> None:
            self.call("Bootstrap", self.client.bootstrap)

        def on_start_auth(self, _event: Any) -> None:
            result = self.call("Device auth start", self.client.start_auth)
            if result:
                self.poll_token = result.get("pollToken", "")
                self.say(f"Open this URL and approve the code: {result.get('authorizeUrl')}")
                self.say(f"User code: {result.get('userCode')}")

        def on_poll_auth(self, _event: Any) -> None:
            if not self.poll_token:
                self.say("No poll token yet. Use Start device auth first.")
                return
            result = self.call("Auth poll", lambda: self.client.poll_auth(self.poll_token))
            if result and result.get("accessToken"):
                self.token.SetValue(result["accessToken"])
                self.say("Token received for this session. It was not saved to disk.")

        def on_check_in(self, _event: Any) -> None:
            self.call("Check in", self.client.check_in)

        def on_streams(self, _event: Any) -> None:
            result = self.call("Refresh streams", self.client.streams)
            if result:
                streams = result.get("streams", [])
                self.say(f"Stream summary count: {len(streams)}")
                for stream in streams[:20]:
                    self.say(f"- {summarize_stream(stream)}")

    app = wx.App(False)
    frame = SmokeFrame()
    frame.Show()
    return app.MainLoop()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="AAAStreamer native-client API smoke client")
    parser.add_argument("--base-url", default=os.environ.get("AAASTREAMER_BASE_URL", "http://127.0.0.1:8095"))
    parser.add_argument("--token", default=os.environ.get("AAASTREAMER_CLIENT_TOKEN", ""))
    parser.add_argument("--headless", action="store_true", help="Run health/bootstrap checks without wxPython")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    client = ApiClient(args.base_url, args.token)
    if args.headless:
        return run_headless(client)
    return run_gui(client)


if __name__ == "__main__":
    raise SystemExit(main())

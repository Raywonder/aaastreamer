(function () {
  var instances = new Map();
  function attach(player, url) {
    if (!url || player.dataset.aaastreamerSource === url) return;
    var previous = instances.get(player);
    if (previous) { previous.destroy(); instances.delete(player); }
    player.dataset.aaastreamerSource = url;
    if (/\.m3u8(?:$|\?)/i.test(url) && !player.canPlayType('application/vnd.apple.mpegurl') && window.Hls && Hls.isSupported()) {
      player.removeAttribute('src');
      var hls = new Hls({ maxBufferLength: 20 });
      instances.set(player, hls);
      hls.on(Hls.Events.ERROR, function (_event, data) {
        if (!data.fatal) return;
        var status = player.closest('.aaastreamer-player').querySelector('.aaastreamer-status');
        if (status) status.textContent = 'Playback was interrupted. Reload this page to reconnect.';
      });
      hls.loadSource(url);
      hls.attachMedia(player);
    } else player.src = url;
  }
  function refreshAudioSources() {
    if (!window.AAAStreamerConnector || !window.AAAStreamerConnector.streamUrlEndpoint) {
      return;
    }
    var players = document.querySelectorAll('.aaastreamer-audio');
    if (!players.length) {
      return;
    }
    players.forEach(function (player) { attach(player, player.getAttribute('src')); });
    fetch(window.AAAStreamerConnector.streamUrlEndpoint, { credentials: 'same-origin' })
      .then(function (response) {
        if (response.ok) return response.json();
        var fallback = window.AAAStreamerConnector.streamUrlFallbackEndpoint;
        return fallback ? fetch(fallback, {credentials:'same-origin'}).then(function (r) { return r.ok ? r.json() : null; }) : null;
      })
      .then(function (payload) {
        if (!payload || !payload.url) {
          return;
        }
        players.forEach(function (player) {
          attach(player, payload.url);
        });
      })
      .catch(function () {});
  }

  window.addEventListener('pagehide', function () { instances.forEach(function (hls) { hls.destroy(); }); instances.clear(); });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', refreshAudioSources);
  } else {
    refreshAudioSources();
  }
})();

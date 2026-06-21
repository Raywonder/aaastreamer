(function () {
  function refreshAudioSources() {
    if (!window.AAAStreamerConnector || !window.AAAStreamerConnector.streamUrlEndpoint) {
      return;
    }
    var players = document.querySelectorAll('.aaastreamer-audio');
    if (!players.length) {
      return;
    }
    fetch(window.AAAStreamerConnector.streamUrlEndpoint, { credentials: 'same-origin' })
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (payload) {
        if (!payload || !payload.url) {
          return;
        }
        players.forEach(function (player) {
          if (!player.getAttribute('src') || player.getAttribute('src') !== payload.url) {
            player.setAttribute('src', payload.url);
          }
        });
      })
      .catch(function () {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', refreshAudioSources);
  } else {
    refreshAudioSources();
  }
})();

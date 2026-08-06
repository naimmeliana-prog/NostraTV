/**
 * NOSTRA TV - Application Bootstrap
 */
document.addEventListener('DOMContentLoaded', () => {

  // Show debug overlay on TV
  const dbg = document.getElementById('debug-overlay');
  function log(msg, color) {
    if (!dbg) return;
    const line = document.createElement('div');
    line.style.color = color || '#94a3b8';
    line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    dbg.appendChild(line);
    dbg.scrollTop = dbg.scrollHeight;
  }

  window.appLog = log;
  log('App iniciando...', '#06b6d4');

  try { window.focusEngine.init(); log('FocusEngine OK', '#22c55e'); }
  catch(e) { log('FocusEngine ERROR: ' + e.message, '#ef4444'); }

  try { window.playerEngine.init(); log('PlayerEngine OK', '#22c55e'); }
  catch(e) { log('PlayerEngine ERROR: ' + e.message, '#ef4444'); }

  try { window.uiController.init(); log('UIController OK', '#22c55e'); }
  catch(e) { log('UIController ERROR: ' + e.message, '#ef4444'); }

  try {
    const pl = window.storageManager.getActivePlaylist();
    if (pl) {
      log(`Cargando: ${pl.name} (${pl.type})`, '#8b5cf6');
      window.uiController.loadPlaylistData(pl).then(() => {
        const d = window.uiController.loadedData;
        log(`Cargado: ${(d.live||[]).length} TV, ${(d.vod||[]).length} Films, ${(d.series||[]).length} Series`, '#22c55e');
      }).catch(e => {
        log('Error cargando playlist: ' + e.message, '#ef4444');
      });
    } else {
      log('No hay playlist activa', '#eab308');
    }
  } catch(e) { log('Error bootstrap playlist: ' + e.message, '#ef4444'); }

  window.focusEngine.updateFocusables();
  log('Listo.', '#06b6d4');
});

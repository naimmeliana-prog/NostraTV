/**
 * NOSTRA TV - EPG (XMLTV) Engine & Time Synchronization Module
 */

class EpgEngine {
  constructor() {
    this.programmesByChannel = {};
    this.channelsMap = {};
    this.isLoaded = false;
  }

  async loadEpgXml(url) {
    if (!url) return;
    try {
      console.log('[EpgEngine] Fetching XMLTV EPG from:', url);
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const text = await resp.text();
      this.parseXmltv(text);
      this.isLoaded = true;
      console.log('[EpgEngine] EPG successfully loaded!');
    } catch (err) {
      console.warn('[EpgEngine] Could not load XMLTV EPG:', err);
    }
  }

  parseXmltv(xmlString) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, 'text/xml');

    // Parse Channels
    const channels = xmlDoc.getElementsByTagName('channel');
    for (let i = 0; i < channels.length; i++) {
      const ch = channels[i];
      const id = ch.getAttribute('id');
      const displayName = ch.getElementsByTagName('display-name')[0]?.textContent || '';
      if (id) {
        this.channelsMap[id] = displayName;
      }
    }

    // Parse Programmes
    const programmes = xmlDoc.getElementsByTagName('programme');
    this.programmesByChannel = {};

    for (let i = 0; i < programmes.length; i++) {
      const p = programmes[i];
      const channelId = p.getAttribute('channel');
      const startRaw = p.getAttribute('start');
      const stopRaw = p.getAttribute('stop');
      const title = p.getElementsByTagName('title')[0]?.textContent || 'Sin título';
      const desc = p.getElementsByTagName('desc')[0]?.textContent || '';

      if (!channelId || !startRaw || !stopRaw) continue;

      const startDate = this.parseXmltvTime(startRaw);
      const stopDate = this.parseXmltvTime(stopRaw);

      if (!this.programmesByChannel[channelId]) {
        this.programmesByChannel[channelId] = [];
      }

      this.programmesByChannel[channelId].push({
        title,
        desc,
        start: startDate,
        stop: stopDate,
        startFormatted: this.formatTime(startDate),
        stopFormatted: this.formatTime(stopDate)
      });
    }

    // Sort programmes per channel by start time
    Object.keys(this.programmesByChannel).forEach(chId => {
      this.programmesByChannel[chId].sort((a, b) => a.start - b.start);
    });
  }

  parseXmltvTime(str) {
    // Format: YYYYMMDDHHMMSS +HHMM (e.g. 20260806180000 +0200)
    if (!str || str.length < 14) return new Date();
    const year = parseInt(str.substring(0, 4));
    const month = parseInt(str.substring(4, 6)) - 1;
    const day = parseInt(str.substring(6, 8));
    const hour = parseInt(str.substring(8, 10));
    const min = parseInt(str.substring(10, 12));
    const sec = parseInt(str.substring(12, 14));

    return new Date(Date.UTC(year, month, day, hour, min, sec));
  }

  formatTime(date) {
    if (!date) return '00:00';
    const h = date.getHours().toString().padStart(2, '0');
    const m = date.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  }

  getEpgNowAndNext(epgId) {
    const defaultRes = {
      now: { title: 'Sin información de guía', time: '--:-- - --:--', progress: 0 },
      next: { title: 'Sin información', time: '--:-- - --:--' }
    };

    if (!epgId || !this.programmesByChannel[epgId]) return defaultRes;

    const now = new Date();
    const list = this.programmesByChannel[epgId];

    let currentIdx = -1;
    for (let i = 0; i < list.length; i++) {
      if (now >= list[i].start && now <= list[i].stop) {
        currentIdx = i;
        break;
      }
    }

    if (currentIdx !== -1) {
      const nowProg = list[currentIdx];
      const nextProg = list[currentIdx + 1];

      const totalDuration = nowProg.stop - nowProg.start;
      const elapsed = now - nowProg.start;
      const progressPct = Math.min(100, Math.max(0, Math.floor((elapsed / totalDuration) * 100)));

      return {
        now: {
          title: nowProg.title,
          desc: nowProg.desc,
          time: `${nowProg.startFormatted} - ${nowProg.stopFormatted}`,
          progress: progressPct
        },
        next: nextProg ? {
          title: nextProg.title,
          time: `${nextProg.startFormatted} - ${nextProg.stopFormatted}`
        } : defaultRes.next
      };
    }

    return defaultRes;
  }
}

window.epgEngine = new EpgEngine();

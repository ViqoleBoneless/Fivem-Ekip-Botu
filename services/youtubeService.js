import https from 'https';
import http from 'http';
import { parseString } from 'xml2js';

// Yönlendirmeleri takip ederek sayfayı çek
function fetchPageWithRedirects(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    };
    lib.get(url, options, (res) => {
      // Yönlendirme varsa takip et
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && maxRedirects > 0) {
        let redirectUrl = res.headers.location;
        if (!redirectUrl.startsWith('http')) redirectUrl = new URL(redirectUrl, url).href;
        res.resume();
        return fetchPageWithRedirects(redirectUrl, maxRedirects - 1).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

export async function getChannelIdFromUrl(url) {
  try {
    url = url.trim();

    // Doğrudan /channel/ ID'si varsa hemen dön
    if (url.includes('/channel/')) {
      const m = url.match(/\/channel\/([a-zA-Z0-9_-]+)/);
      if (m?.[1]) return m[1];
    }

    // Handle (@) veya youtube.com linki
    let handle = null;
    if (url.includes('@')) {
      const m = url.match(/@([a-zA-Z0-9_.-]+)/);
      if (m?.[1]) handle = m[1];
    }

    // Handle varsa RSS üzerinden dene (daha güvenilir, bot-bloğuna takılmaz)
    if (handle) {
      try {
        // Yönlendirme ile kanalın /channel/ URL'ine ulaş
        const html = await fetchPageWithRedirects(`https://www.youtube.com/@${handle}`);

        // Yönlendirme sonucu /channel/ URL'i çıkmış olabilir
        const redirectMatch = html.match(/\/channel\/([a-zA-Z0-9_-]{24})/);
        if (redirectMatch?.[1]) return redirectMatch[1];

        // JSON içinde channelId ara
        const m1 = html.match(/"channelId":"(UC[a-zA-Z0-9_-]{22})"/);
        if (m1?.[1]) return m1[1];

        // Canonical link içinde ara
        const m2 = html.match(/<link[^>]+rel="canonical"[^>]+href="[^"]*\/channel\/(UC[a-zA-Z0-9_-]{22})"/);
        if (m2?.[1]) return m2[1];

        // externalId ara
        const m3 = html.match(/"externalId":"(UC[a-zA-Z0-9_-]{22})"/);
        if (m3?.[1]) return m3[1];
      } catch {}
    }

    // Herhangi bir 24 karakterli UC... ID'si varsa döndür
    const ucMatch = url.match(/(UC[a-zA-Z0-9_-]{22})/);
    if (ucMatch?.[1]) return ucMatch[1];

    return null;
  } catch { return null; }
}

export async function getLatestVideo(channelId) {
  try {
    const xmlData = await fetchRSS(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
    if (!xmlData) return null;
    return new Promise((resolve) => {
      parseString(xmlData, (err, result) => {
        if (err) return resolve(null);
        try {
          const entries = result?.feed?.entry;
          if (!entries?.length) return resolve(null);
          const e = entries[0];
          const videoId = e['yt:videoId']?.[0];
          const link = e['link']?.[0]?.$?.href;
          if (!videoId || !link) return resolve(null);
          resolve({ videoId, videoUrl: link, title: e['title']?.[0] || 'Başlıksız', published: e['published']?.[0] ? new Date(e['published'][0]) : new Date() });
        } catch { resolve(null); }
      });
    });
  } catch { return null; }
}

function fetchRSS(url) {
  return new Promise((resolve) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    };
    https.get(url, options, (res) => {
      if (res.statusCode !== 200) {
        console.warn(`[YouTube RSS] Hata Kodu: ${res.statusCode} - URL: ${url}`);
        return resolve(null);
      }
      let data = ''; 
      res.on('data', chunk => data += chunk); 
      res.on('end', () => resolve(data));
    }).on('error', (err) => {
      console.error(`[YouTube RSS] Bağlantı Hatası: ${err.message} - URL: ${url}`);
      resolve(null);
    });
  });
}

export async function getChannelName(channelId) {
  try {
    const xmlData = await fetchRSS(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
    if (!xmlData) return null;
    return new Promise(resolve => {
      parseString(xmlData, (err, result) => {
        if (err) return resolve(null);
        try { resolve(result?.feed?.title?.[0] || null); } catch { resolve(null); }
      });
    });
  } catch { return null; }
}

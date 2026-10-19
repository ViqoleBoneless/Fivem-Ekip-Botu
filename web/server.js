import express from 'express';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { getWebToken, deleteWebToken } from '../db.js';
import { router as apiRouter } from './routes/api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Owner-only sekmeler — normal kullanıcılar erişemez
const OWNER_ONLY_TABS = ['allperm', 'config', 'database'];

// Hassas API rotaları ve hangi sekmeye karşılık geldikleri
// Owner olan kullanıcı requireTabAccess içinde zaten bypass ediliyor.
const TAB_PROTECTED_APIS = {
  // Owner-only sekmeler:
  '/config':               'config',
  '/allperm':              'allperm',
  '/database':             'database',
  // Sekme bazlı korumalı API'lar:
  '/farm':                 'farm',
  '/events':               'events',
  '/activity':             'activity',
  '/youtube':              'youtube',
  '/banaf':                'banaf',
  '/panelsizbanaf':        'banaf',
  '/giveaways':            'cekilis',
  '/ickontrol':            'ickontrol',
  '/bioguild':             'bioguild',
  '/dm-duyuru':            'dmduyuru',
  '/ticket':               'ticket',
  '/panel-access':         'allperm',
  '/bot/guncelle':         'config',
  '/bot/ekip-sistemi-kur': 'config',
};

export function startWebServer(client) {
  if (client.webServer && client.webServer.listening) {
    console.log('[WEB] ℹ️ Web sunucusu zaten çalışıyor, yeniden başlatılmadı.');
    return client.webServer;
  }

  const app = express();
  const webPort = client.config.webPort || 3000;
  
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const sessionSecret = client.config.sessionSecret || crypto.randomBytes(32).toString('hex');
  app.use(session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,
      maxAge: 24 * 60 * 60 * 1000 // 1 Gün
    }
  }));

  // Loglama middleware
  app.use((req, res, next) => {
    console.log(`[WEB] [${req.method}] ${req.url}`);
    next();
  });

  const unauthorizedHtml = `
    <html>
      <head>
        <title>403 - Erişim Engellendi</title>
        <style>
          body { background: #0a0b10; color: #fff; font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
          .card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); padding: 30px; border-radius: 12px; text-align: center; backdrop-filter: blur(10px); max-width: 400px; }
          h1 { color: #ef4444; margin-top: 0; }
          p { color: #94a3b8; line-height: 1.6; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Erişim Engellendi</h1>
          <p>Sadece komut ile alınan linkten gidilebilir.</p>
        </div>
      </body>
    </html>
  `;

  // ── Yardımcı: Kullanıcının owner olup olmadığını kontrol et ──────────
  function isOwnerSession(req) {
    if (!req.session?.user) return false;
    const ownerIds = (client.config.ownerIds || '')
      .split(',').map(id => id.trim()).filter(Boolean);
    return ownerIds.includes(req.session.user.id);
  }

  // ── Admin Kontrolü Middleware ──────────────────────────────────────
  function requireAdmin(req, res, next) {
    if (req.session && req.session.isAdmin) {
      return next();
    }
    if (req.url.startsWith('/api/')) {
      return res.status(401).json({ error: 'Yetkisiz erişim. Lütfen giriş yapın.' });
    }
    res.status(403).send(unauthorizedHtml);
  }

  // ── Sekme Erişim Kontrolü Middleware ──────────────────────────────
  function requireTabAccess(req, res, next) {
    // Owner her şeye erişebilir
    if (isOwnerSession(req)) return next();

    const allowedTabs = req.session.allowedTabs || [];

    // Her zaman erişilebilir rotalar (izin gerektirmez)
    const ALWAYS_ALLOWED = ['/status', '/discord-data', '/my-tabs'];
    if (ALWAYS_ALLOWED.some(p => req.url === p || req.url.startsWith(p + '?'))) {
      return next();
    }

    // API rota → sekme eşleşmesi kontrolü
    // En uzun prefix'e öncelik ver (örn: /panelsizbanaf > /banaf)
    let matchedTab = null;
    let matchedLen = 0;
    for (const [apiPrefix, tabName] of Object.entries(TAB_PROTECTED_APIS)) {
      if (req.url === apiPrefix || req.url.startsWith(apiPrefix + '/') || req.url.startsWith(apiPrefix + '?')) {
        if (apiPrefix.length > matchedLen) {
          matchedLen = apiPrefix.length;
          matchedTab = tabName;
        }
      }
    }

    if (matchedTab !== null) {
      const hasAccess = allowedTabs.includes('*') || allowedTabs.includes(matchedTab);
      if (!hasAccess) {
        console.warn(`[WEB SECURITY] Yetkisiz API erişimi engellendi: user=${req.session?.user?.id} url=${req.url} tab=${matchedTab}`);
        return res.status(403).json({ error: 'Bu sekmeye erişim yetkiniz yok.' });
      }
    }

    next();
  }

  // 1) Giriş Bağlantısı Rotaları: /panel/:botId/:guildId/:token
  app.get('/panel/:botId/:guildId/:token', async (req, res) => {
    const { botId, guildId, token } = req.params;

    // Aktif geçerli session varsa direkt index.html gönder
    if (req.session && req.session.isAdmin && req.session.token === token && req.session.botId === botId && req.session.guildId === guildId) {
      return res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }

    try {
      const dbToken = getWebToken(token);
      if (!dbToken) {
        return res.status(403).send(unauthorizedHtml);
      }

      if (Date.now() > dbToken.expiresAt) {
        deleteWebToken(token);
        return res.status(403).send(unauthorizedHtml);
      }

      // Geçici session verilerini yaz
      req.session.tempToken = token;
      req.session.tempBotId = botId;
      req.session.tempGuildId = guildId;
      req.session.tempUserId = dbToken.userId;
      req.session.tempAllowedTabs = dbToken.allowedTabs; // örn: "farm,events" veya "*"

      const clientId = client.config.clientId || client.user.id;
      const redirectUri = client.config.oauthRedirectUri || `${req.protocol}://${req.get('host')}/auth/callback`;
      const oauthUrl = `https://discord.com/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify&state=${token}`;
      res.redirect(oauthUrl);
    } catch (err) {
      console.error('[WEB] Token doğrulama hatası:', err);
      res.status(500).send('Sunucu hatası.');
    }
  });

  // 2) OAuth2 Callback Rotası
  app.get('/auth/callback', async (req, res) => {
    const { code, state } = req.query;

    if (!code) {
      return res.status(400).send('OAuth kodu bulunamadı.');
    }

    if (!req.session.tempToken || req.session.tempToken !== state) {
      return res.status(403).send('Geçersiz oturum veya state doğrulaması başarısız.');
    }

    try {
      const clientId = client.config.clientId || client.user.id;
      const clientSecret = client.config.oauthClientSecret;
      const redirectUri = client.config.oauthRedirectUri || `${req.protocol}://${req.get('host')}/auth/callback`;

      if (!clientSecret) {
        return res.status(500).send('Hata: Config dosyasında oauthClientSecret tanımlanmamış!');
      }

      // Discord'dan token al
      const tokenResponse = await fetch('https://discord.com/api/v10/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: redirectUri
        })
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json();
        console.error('[WEB] Discord token hatası:', errorData);
        return res.status(400).send('Discord kimlik doğrulaması başarısız oldu.');
      }

      const tokenData = await tokenResponse.json();

      // Kullanıcı bilgilerini çek
      const userResponse = await fetch('https://discord.com/api/v10/users/@me', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` }
      });

      if (!userResponse.ok) {
        return res.status(400).send('Discord kullanıcı bilgileri alınamadı.');
      }

      const userData = await userResponse.json();

      // ── Yetkilendirme Kontrolü ─────────────────────────────────
      const ownerIds = (client.config.ownerIds || '')
        .split(',').map(id => id.trim()).filter(Boolean);
      const isOwner = ownerIds.includes(userData.id);

      const tempUserId = req.session.tempUserId;
      const tempAllowedTabs = req.session.tempAllowedTabs || '*';

      // Token'ı oluşturan kişi mi? veya ownerIds'de mi?
      const isAuthorized = (userData.id === tempUserId) || isOwner;

      if (isAuthorized) {
        // allowedTabs işle: "*" string ise diziyle ayrıştır
        let allowedTabs;
        if (isOwner) {
          // Owner tüm sekmelere erişebilir (özel owner sekmeler dahil)
          allowedTabs = ['*'];
        } else {
          // Token'daki izinleri kullan
          const rawTabs = tempAllowedTabs;
          if (rawTabs === '*') {
            allowedTabs = ['*'];
          } else {
            allowedTabs = rawTabs.split(',').map(t => t.trim()).filter(Boolean);
          }
        }

        req.session.isAdmin = true;
        req.session.isOwner = isOwner;
        req.session.allowedTabs = allowedTabs;
        req.session.user = {
          id: userData.id,
          username: userData.username,
          avatar: userData.avatar
        };
        req.session.guildId = req.session.tempGuildId;
        req.session.botId = req.session.tempBotId;
        req.session.token = state;

        // Tek kullanımlık token'ı sil
        deleteWebToken(state);

        // Geçici session alanlarını temizle
        delete req.session.tempToken;
        delete req.session.tempBotId;
        delete req.session.tempGuildId;
        delete req.session.tempUserId;
        delete req.session.tempAllowedTabs;

        res.redirect(`/panel/${req.session.botId}/${req.session.guildId}/${state}`);
      } else {
        res.status(403).send('❌ Yetkisiz Giriş: Bu token size ait değil.');
      }
    } catch (err) {
      console.error('[WEB] OAuth callback hatası:', err);
      res.status(500).send('Kimlik doğrulaması sırasında teknik bir hata oluştu.');
    }
  });

  // 3) Bloklanan ana rotalar
  app.get(['/', '/dashboard', '/index.html'], (req, res) => {
    res.status(403).send(unauthorizedHtml);
  });

  // 4) API Rotalarını Entegre Et
  app.use((req, res, next) => {
    req.discordClient = client;
    req.isOwnerSession = isOwnerSession(req);
    next();
  });
  app.use('/api', requireAdmin, requireTabAccess, apiRouter);

  // 5) Statik Klasör
  app.use(express.static(path.join(__dirname, 'public')));

  // 6) Catch-all
  app.get('*', (req, res) => {
    res.status(403).send(unauthorizedHtml);
  });

  const server = app.listen(webPort, () => {
    console.log(`[WEB] 🌐 Ekip Yönetim Paneli web sunucusu çalışıyor: http://localhost:${webPort}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[WEB] ❌ HATA: Port ${webPort} zaten kullanımda (EADDRINUSE)! Web sunucusu başlatılamadı.`);
      console.error(`[WEB] 💡 VDS üzerinde bu portu kullanan eski bir node.exe süreci veya başka bir bot çalışıyor.`);
      console.error(`[WEB] 💡 Çözüm: VDS'te 'netstat -ano | findstr :${webPort}' komutu ile PID'yi bulup sonlandırın veya config'deki webPort'u değiştirin.`);
    } else {
      console.error(`[WEB] ❌ Web sunucusu hatası:`, err);
    }
  });

  client.webServer = server;
  return server;
}

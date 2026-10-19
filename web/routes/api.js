import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { db, clearAllEventsStats, clearUserEventsStats, clearAllVoiceMessagesStats, clearUserVoiceMessagesStats } from '../../db.js';
import { ContainerBuilder, SectionBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags, ChannelType, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder } from 'discord.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
import { getLogoPath } from '../../utils/logoHelper.js';

const SYSTEM_ROLES = [
  { key: 'banCommandRoleId', name: 'Ban Command', color: '#e74c3c' },
  { key: 'ticketStaffRoleId', name: 'Alım Sorumlusu', color: '#3498db' },
  { key: 'onayRoleId', name: 'Ekip Üyesi', color: '#2ecc71' },
  { key: 'ytSorumlusuRoleId', name: 'YT Sorumlusu', color: '#FF0000' },
  { key: 'farmSorumlusuRoleId', name: 'Farm Sorumlusu', color: '#f1c40f' }
];

const SYSTEM_CATEGORIES = [
  { key: 'basvuruCategoryId', name: 'BAŞVURU' },
  { key: 'yonetimCategoryId', name: 'YÖNETİM' },
  { key: 'killCategoryId', name: 'KİLL' }
];

const SYSTEM_CHANNELS = [
  { key: 'videoChannelId', name: 'video-paylasim', type: ChannelType.GuildText },
  { key: 'warningPublicChannelId', name: 'uyarılar', type: ChannelType.GuildText },
  // Under BAŞVURU
  { key: 'ticketChannelId', name: 'ticket', type: ChannelType.GuildText, parentName: 'BAŞVURU', parentCategoryKey: 'basvuruCategoryId' },
  { key: 'onayChannelId', name: 'onay-red', type: ChannelType.GuildText, parentName: 'BAŞVURU', parentCategoryKey: 'basvuruCategoryId' },
  { key: 'banAfChannelId', name: 'ban-affi-basvuru', type: ChannelType.GuildText, parentName: 'BAŞVURU', parentCategoryKey: 'basvuruCategoryId', privateFor: 'onayRoleId' },
  { key: 'farmIstekChannelId', name: 'farm-istek', type: ChannelType.GuildText, parentName: 'BAŞVURU', parentCategoryKey: 'basvuruCategoryId', privateFor: 'onayRoleId' },
  { key: 'youtubeBasvuruChannelId', name: 'youtube-kanal-başvur', type: ChannelType.GuildText, parentName: 'BAŞVURU', parentCategoryKey: 'basvuruCategoryId', privateFor: 'onayRoleId' },
  // Under YÖNETİM
  { key: 'farmManagementChannelId', name: 'farm-yönetim', type: ChannelType.GuildText, parentName: 'YÖNETİM', parentCategoryKey: 'yonetimCategoryId', privateFor: 'farmSorumlusuRoleId' },
  { key: 'youtubeManagementChannelId', name: 'youtube-yönetim', type: ChannelType.GuildText, parentName: 'YÖNETİM', parentCategoryKey: 'yonetimCategoryId', privateFor: 'ytSorumlusuRoleId' },
  { key: 'banAffiManagementChannelId', name: 'ban-affı-yönetim', type: ChannelType.GuildText, parentName: 'YÖNETİM', parentCategoryKey: 'yonetimCategoryId', privateFor: 'banCommandRoleId' },
  { key: 'aktifIslemlerChannelId', name: 'aktif-işlemler', type: ChannelType.GuildText, parentName: 'YÖNETİM', parentCategoryKey: 'yonetimCategoryId' },
  // Under Viqole Komut Log
  { key: 'warningLogChannelId', name: 'uyari-log', type: ChannelType.GuildText, parentName: 'Viqole Komut Log', parentCategoryKey: 'komutLogCategoryId', parentFallbackKey: 'logCategoryId' },
  { key: 'farmLogChannelId', name: 'farm-log', type: ChannelType.GuildText, parentName: 'Viqole Komut Log', parentCategoryKey: 'komutLogCategoryId', parentFallbackKey: 'logCategoryId' },
  { key: 'ticketLogChannelId', name: 'ticket-log', type: ChannelType.GuildText, parentName: 'Viqole Komut Log', parentCategoryKey: 'komutLogCategoryId', parentFallbackKey: 'logCategoryId' },
  { key: 'youtubeLogChannelId', name: 'youtube-log', type: ChannelType.GuildText, parentName: 'Viqole Komut Log', parentCategoryKey: 'komutLogCategoryId', parentFallbackKey: 'logCategoryId' },
  { key: 'dmDuyuruLogChannelId', name: 'dm-duyuru-log', type: ChannelType.GuildText, parentName: 'Viqole Komut Log', parentCategoryKey: 'komutLogCategoryId', parentFallbackKey: 'logCategoryId' },
  { key: 'botLogChannelId', name: 'bot-log', type: ChannelType.GuildText, parentName: 'Viqole Komut Log', parentCategoryKey: 'komutLogCategoryId', parentFallbackKey: 'logCategoryId' },
  { key: 'banAfLogChannelId', name: 'ban-affı-log', type: ChannelType.GuildText, parentName: 'Viqole Komut Log', parentCategoryKey: 'komutLogCategoryId', parentFallbackKey: 'logCategoryId' },
  { key: 'activityLogChannelId', name: 'aktiflik-log', type: ChannelType.GuildText, parentName: 'Viqole Komut Log', parentCategoryKey: 'komutLogCategoryId', parentFallbackKey: 'logCategoryId' },
  // Under Viqole Sunucu Log
  { key: 'messageLogChannelId', name: 'mesaj-log', type: ChannelType.GuildText, parentName: 'Viqole Sunucu Log', parentCategoryKey: 'sunucuLogCategoryId', parentFallbackKey: 'logCategoryId' },
  { key: 'banLogChannelId', name: 'ban-unban-log', type: ChannelType.GuildText, parentName: 'Viqole Sunucu Log', parentCategoryKey: 'sunucuLogCategoryId', parentFallbackKey: 'logCategoryId' },
  { key: 'sesLogChannelId', name: 'ses-log', type: ChannelType.GuildText, parentName: 'Viqole Sunucu Log', parentCategoryKey: 'sunucuLogCategoryId', parentFallbackKey: 'logCategoryId' },
  { key: 'davetLogChannelId', name: 'davet-log', type: ChannelType.GuildText, parentName: 'Viqole Sunucu Log', parentCategoryKey: 'sunucuLogCategoryId', parentFallbackKey: 'logCategoryId' },
  { key: 'girisLogChannelId', name: 'giris-cikis-log', type: ChannelType.GuildText, parentName: 'Viqole Sunucu Log', parentCategoryKey: 'sunucuLogCategoryId', parentFallbackKey: 'logCategoryId' },
  { key: 'roleLogChannelId', name: 'rol-log', type: ChannelType.GuildText, parentName: 'Viqole Sunucu Log', parentCategoryKey: 'sunucuLogCategoryId', parentFallbackKey: 'logCategoryId' },
  { key: 'kanalLogChannelId', name: 'kanal-log', type: ChannelType.GuildText, parentName: 'Viqole Sunucu Log', parentCategoryKey: 'sunucuLogCategoryId', parentFallbackKey: 'logCategoryId' },
  { key: 'isimLogChannelId', name: 'isim-log', type: ChannelType.GuildText, parentName: 'Viqole Sunucu Log', parentCategoryKey: 'sunucuLogCategoryId', parentFallbackKey: 'logCategoryId' }
];


export const router = Router();

// 1) Genel Durum ve Kullanıcı Bilgisi
router.get('/status', async (req, res) => {
  const client = req.discordClient;
  const guildId = req.session.guildId;
  
  try {
    const isReady = client && typeof client.isReady === 'function' && client.isReady();
    let botInfo = {
      tag: 'Çevrimdışı',
      avatar: 'https://cdn.discordapp.com/embed/avatars/0.png',
      ping: -1,
      uptime: 'Çevrimdışı',
      isReady: false
    };
    let guildInfo = { name: 'Çevrimdışı', memberCount: 0, icon: null };

    if (isReady) {
      const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
      
      const uptimeSeconds = Math.floor(client.uptime / 1000);
      const hours = Math.floor(uptimeSeconds / 3600);
      const minutes = Math.floor((uptimeSeconds % 3600) / 60);
      const seconds = uptimeSeconds % 60;
      const uptimeStr = `${hours}s ${minutes}d ${seconds}s`;

      botInfo = {
        tag: client.user.tag,
        avatar: client.user.displayAvatarURL(),
        ping: client.ws.ping,
        uptime: uptimeStr,
        isReady: true
      };

      guildInfo = guild ? {
        name: guild.name,
        memberCount: guild.memberCount,
        icon: guild.iconURL()
      } : { name: 'Bulunamadı', memberCount: 0, icon: null };
    }

    res.json({
      user: req.session.user,
      bot: botInfo,
      guild: guildInfo
    });
  } catch (err) {
    console.error('API Status Hatası:', err);
    res.status(500).json({ error: 'Durum bilgileri alınamadı.' });
  }
});


// 2) Discord Rol ve Kanal Bilgilerini Dropdown için Listele
router.get('/discord-data', async (req, res) => {
  const client = req.discordClient;
  const guildId = req.session.guildId;

  try {
    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
      return res.status(404).json({ error: 'Sunucu bulunamadı.' });
    }

    // Discord verilerini çek (cache yoksa fetch et)
    // Don't fetch all members as it hangs in large guilds. Fetch only configured roles.
    const roleIdsToFetch = [
      client.config?.banCommandRoleId,
      client.config?.ticketStaffRoleId,
      client.config?.onayRoleId,
      client.config?.ytSorumlusuRoleId,
      client.config?.farmSorumlusuRoleId
    ].filter(Boolean);
    for (const rId of roleIdsToFetch) {
      await guild.members.fetch({ role: rId }).catch(() => null);
    }
    await guild.roles.fetch().catch(() => null);
    await guild.channels.fetch().catch(() => null);

    const channels = guild.channels.cache.map(c => ({
      id: c.id,
      name: c.name,
      type: c.type, // 0: Text, 2: Voice, 4: Category vb.
      parentName: c.parent ? c.parent.name : null
    })).sort((a, b) => a.name.localeCompare(b.name));

    const roles = guild.roles.cache
      .filter(r => r.name !== '@everyone')
      .map(r => ({
        id: r.id,
        name: r.name,
        color: r.hexColor
      })).sort((a, b) => a.name.localeCompare(b.name));

    const members = guild.members.cache
      .filter(m => !m.user.bot)
      .map(m => ({
        id: m.id,
        tag: m.user.tag,
        displayName: m.displayName
      })).sort((a, b) => a.displayName.localeCompare(b.displayName));

    res.json({ channels, roles, members });
  } catch (err) {
    console.error('API Discord-Data Hatası:', err);
    res.status(500).json({ error: 'Discord verileri okunamadı.' });
  }
});

// 3) Config Değerlerini Listele
router.get('/config', (req, res) => {
  res.json(req.discordClient.config || {});
});

// 4) Config Değerlerini Güncelle
router.post('/config/update', async (req, res) => {
  const client = req.discordClient;
  const updates = req.body;

  if (!updates || typeof updates !== 'object') {
    return res.status(400).json({ error: 'Geçersiz güncelleme verisi.' });
  }

  try {
    const configPath = client.configPath;
    let currentConfig = {};
    if (fs.existsSync(configPath)) {
      currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }

    // Config alanlarını güncelle (webPort, token, dbPath vb. gibi hassas/temel alanları değiştirmeye izin vermeyelim)
    const protectedKeys = ['token', 'clientId', 'mongodbUri', 'dbPath', 'webPort', 'panelUrl', 'oauthClientSecret', 'oauthRedirectUri'];
    
    for (const key in updates) {
      if (protectedKeys.includes(key)) continue; // Korunan alanları atla
      currentConfig[key] = updates[key];
    }

    // Config dosyasını kaydet
    fs.writeFileSync(configPath, JSON.stringify(currentConfig, null, 2), 'utf8');
    client.config = currentConfig;

    // Veritabanındaki ticket_configs tablosunu da güncelle
    if (updates.ticketPanelStyle !== undefined && currentConfig.guildId) {
      try {
        const { setTicketConfig } = await import('../../db.js');
        setTicketConfig(currentConfig.guildId, { panelStyle: updates.ticketPanelStyle });
      } catch (dbErr) {
        console.error('[API CONFIG] ticketPanelStyle DB update error:', dbErr);
      }
    }

    // Eğer ticket panel ayarları güncellendiyse Discord'daki canlı paneli anında güncelle
    if (updates.ticketPanelStyle !== undefined || updates.ticketPanelType !== undefined || updates.ticketEmbedColor !== undefined || updates.ticketCategories !== undefined || updates.ticketChannelId !== undefined) {
      (async () => {
        try {
          const tChanId = currentConfig.ticketChannelId;
          if (tChanId && client) {
            const tChan = client.channels?.cache.get(tChanId) || await client.channels?.fetch(tChanId).catch(() => null);
            if (tChan?.isTextBased()) {
              const { buildTicketPanel } = await import('../../commands/ticket-panel.js');
              let msg = null;
              if (currentConfig.ticketPanelMessageId) {
                msg = await tChan.messages.fetch(currentConfig.ticketPanelMessageId).catch(() => null);
              }
              if (!msg) {
                const msgs = await tChan.messages.fetch({ limit: 50 }).catch(() => null);
                if (msgs) {
                  msg = msgs.find(m => 
                    m.author.id === client.user?.id && 
                    m.components && m.components.length > 0 &&
                    (m.components[0].components?.[0]?.customId === 'ticket_category' || m.components[0].components?.[0]?.customId?.startsWith('ticket_category_btn_'))
                  );
                  if (msg) {
                    currentConfig.ticketPanelMessageId = msg.id;
                    fs.writeFileSync(configPath, JSON.stringify(currentConfig, null, 2), 'utf8');
                  }
                }
              }
              if (msg) {
                const container = buildTicketPanel(client);
                const { Routes, MessageFlags } = await import('discord.js');
                await client.rest.patch(
                  Routes.channelMessage(tChan.id, msg.id),
                  {
                    body: {
                      components: [container.toJSON()],
                      flags: MessageFlags.IsComponentsV2
                    }
                  }
                ).catch((err) => console.error('[TICKET REST PATCH] Error:', err));
              }
            }
          }
        } catch (patchErr) {
          console.error('[TICKET PANEL AUTO-UPDATE] Panel güncellenirken hata:', patchErr);
        }
      })();
    }

    res.json({ success: true, message: 'Ayarlar başarıyla güncellendi.', config: client.config });
  } catch (err) {
    console.error('API Config Güncelleme Hatası:', err);
    res.status(500).json({ error: 'Ayarlar kaydedilirken hata oluştu.' });
  }
});

// 5) Dinamik Yetkileri Listele
router.get('/allperm', (req, res) => {
  const client = req.discordClient;
  const config = client.config || {};
  
  const permKeys = ['allPerm', 'ticketStaff', 'banCommand', 'farmSorumlusu', 'ytSorumlusu', 'jail'];
  
  const usersMap = {};
  const rolesMap = {};

  for (const key of permKeys) {
    const uStr = config[key + 'Users'] || '';
    const rStr = config[key + 'Roles'] || '';
    
    const uList = uStr ? uStr.split(',').map(id => id.trim()).filter(Boolean) : [];
    const rList = rStr ? rStr.split(',').map(id => id.trim()).filter(Boolean) : [];
    
    for (const uid of uList) {
      if (!usersMap[uid]) usersMap[uid] = [];
      usersMap[uid].push(key);
    }
    for (const rid of rList) {
      if (!rolesMap[rid]) rolesMap[rid] = [];
      rolesMap[rid].push(key);
    }
  }

  res.json({ usersMap, rolesMap });
});

// 6) Dinamik Yetki Ekle
router.post('/allperm/add', (req, res) => {
  const client = req.discordClient;
  const { type, id, perm } = req.body; 

  if (!id || !['user', 'role'].includes(type) || !perm) {
    return res.status(400).json({ error: 'Geçersiz parametreler.' });
  }

  try {
    const configPath = client.configPath;
    const currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    const listKey = type === 'user' ? perm + 'Users' : perm + 'Roles';
    const listStr = currentConfig[listKey] || '';
    const list = listStr ? listStr.split(',').map(i => i.trim()).filter(Boolean) : [];
    
    if (!list.includes(id)) {
      list.push(id);
      currentConfig[listKey] = list.join(',');
    }

    fs.writeFileSync(configPath, JSON.stringify(currentConfig, null, 2), 'utf8');
    client.config = currentConfig;

    res.json({ success: true, message: 'Dinamik yetki başarıyla eklendi.', config: client.config });
  } catch (err) {
    console.error('API Yetki Ekleme Hatası:', err);
    res.status(500).json({ error: 'Dinamik yetki eklenirken hata oluştu.' });
  }
});

// 7) Dinamik Yetki Sil
router.post('/allperm/remove', (req, res) => {
  const client = req.discordClient;
  const { type, id, perm } = req.body;

  if (!id || !['user', 'role'].includes(type) || !perm) {
    return res.status(400).json({ error: 'Geçersiz parametreler.' });
  }

  try {
    const configPath = client.configPath;
    const currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    const listKey = type === 'user' ? perm + 'Users' : perm + 'Roles';
    const listStr = currentConfig[listKey] || '';
    let list = listStr ? listStr.split(',').map(i => i.trim()).filter(Boolean) : [];
    list = list.filter(i => i !== id);
    currentConfig[listKey] = list.join(',');

    fs.writeFileSync(configPath, JSON.stringify(currentConfig, null, 2), 'utf8');
    client.config = currentConfig;

    res.json({ success: true, message: 'Dinamik yetki kaldırıldı.', config: client.config });
  } catch (err) {
    console.error('API Yetki Silme Hatası:', err);
    res.status(500).json({ error: 'Dinamik yetki kaldırılırken hata oluştu.' });
  }
});

// ──────────────────────────────────────────────────────────────────────
// Web Panel Erişim Yönetimi (Panel Access)
// ──────────────────────────────────────────────────────────────────────

// Geçerli sekmeler (owner-only hariç)
const WEB_PANEL_TABS = ['dashboard', 'ticket', 'activity', 'youtube', 'banaf', 'cekilis', 'events', 'farm', 'ickontrol', 'bioguild', 'dmduyuru'];
const OWNER_ONLY_TABS = ['allperm', 'config', 'database'];

// Yardımcı: config kaydet
function saveConfig(client, newConfig) {
  const configPath = client.configPath;
  fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2), 'utf8');
  client.config = newConfig;
}

// Yardımcı: isOwner kontrolü
function isOwnerCheck(req) {
  if (!req.session?.user) return false;
  const ownerIds = (req.discordClient.config.ownerIds || '')
    .split(',').map(id => id.trim()).filter(Boolean);
  return ownerIds.includes(req.session.user.id);
}

// 8a) Mevcut kullanıcının izinli sekmelerini döndür
router.get('/my-tabs', (req, res) => {
  const isOwner = isOwnerCheck(req);
  if (isOwner) {
    return res.json({ isOwner: true, allowedTabs: ['*'], ownerOnlyTabs: OWNER_ONLY_TABS, allTabs: WEB_PANEL_TABS });
  }
  const allowedTabs = req.session.allowedTabs || [];
  res.json({ isOwner: false, allowedTabs, ownerOnlyTabs: [], allTabs: WEB_PANEL_TABS });
});

// 8b) Web Panel Erişim Listesini Getir (sadece owner)
router.get('/panel-access', (req, res) => {
  if (!isOwnerCheck(req)) {
    return res.status(403).json({ error: 'Bu işlem sadece ekip sahibine açıktır.' });
  }
  const client = req.discordClient;
  const config = client.config || {};

  const webPanelUsers = (config.webPanelUsers || '').split(',').map(id => id.trim()).filter(Boolean);
  const webPanelRoles = (config.webPanelRoles || '').split(',').map(id => id.trim()).filter(Boolean);

  let webTabPerms = {};
  try { webTabPerms = JSON.parse(config.webTabPermissions || '{}'); } catch (_) {}

  res.json({
    users: webPanelUsers,
    roles: webPanelRoles,
    tabPerms: webTabPerms,
    availableTabs: WEB_PANEL_TABS
  });
});

// 8c) Web Panel Erişimi Ekle (sadece owner)
router.post('/panel-access/add', (req, res) => {
  if (!isOwnerCheck(req)) {
    return res.status(403).json({ error: 'Bu işlem sadece ekip sahibine açıktır.' });
  }
  const client = req.discordClient;
  const { type, id, tabs } = req.body; // type: 'user' | 'role', tabs: string[] veya ['*']

  if (!id || !['user', 'role'].includes(type)) {
    return res.status(400).json({ error: 'Geçersiz parametreler. type=user|role, id gerekli.' });
  }

  try {
    const configPath = client.configPath;
    const currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    // Listeye ekle
    const listKey = type === 'user' ? 'webPanelUsers' : 'webPanelRoles';
    const list = (currentConfig[listKey] || '').split(',').map(i => i.trim()).filter(Boolean);
    if (!list.includes(id)) list.push(id);
    currentConfig[listKey] = list.join(',');

    // Sekme izinlerini kaydet
    let webTabPerms = {};
    try { webTabPerms = JSON.parse(currentConfig.webTabPermissions || '{}'); } catch (_) {}
    if (!webTabPerms[type === 'user' ? 'users' : 'roles']) {
      webTabPerms[type === 'user' ? 'users' : 'roles'] = {};
    }

    // tabs dizisi geçersiz tab içermemeli, owner-only sekmeleri filtrele
    const safeTabs = Array.isArray(tabs) && tabs.length > 0
      ? (tabs.includes('*') ? ['*'] : tabs.filter(t => WEB_PANEL_TABS.includes(t)))
      : ['*'];

    webTabPerms[type === 'user' ? 'users' : 'roles'][id] = safeTabs;
    currentConfig.webTabPermissions = JSON.stringify(webTabPerms);

    saveConfig(client, currentConfig);
    res.json({ success: true, message: 'Web panel erişimi başarıyla eklendi.' });
  } catch (err) {
    console.error('Panel Access Ekleme Hatası:', err);
    res.status(500).json({ error: 'Erişim eklenirken hata oluştu.' });
  }
});

// 8d) Web Panel Sekme İzinlerini Güncelle (sadece owner)
router.post('/panel-access/update-tabs', (req, res) => {
  if (!isOwnerCheck(req)) {
    return res.status(403).json({ error: 'Bu işlem sadece ekip sahibine açıktır.' });
  }
  const client = req.discordClient;
  const { type, id, tabs } = req.body;

  if (!id || !['user', 'role'].includes(type)) {
    return res.status(400).json({ error: 'Geçersiz parametreler.' });
  }

  try {
    const configPath = client.configPath;
    const currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    let webTabPerms = {};
    try { webTabPerms = JSON.parse(currentConfig.webTabPermissions || '{}'); } catch (_) {}

    const permKey = type === 'user' ? 'users' : 'roles';
    if (!webTabPerms[permKey]) webTabPerms[permKey] = {};

    const safeTabs = Array.isArray(tabs) && tabs.length > 0
      ? (tabs.includes('*') ? ['*'] : tabs.filter(t => WEB_PANEL_TABS.includes(t)))
      : ['*'];

    webTabPerms[permKey][id] = safeTabs;
    currentConfig.webTabPermissions = JSON.stringify(webTabPerms);

    saveConfig(client, currentConfig);
    res.json({ success: true, message: 'Sekme izinleri güncellendi.' });
  } catch (err) {
    console.error('Panel Access Güncelleme Hatası:', err);
    res.status(500).json({ error: 'Sekme izinleri güncellenirken hata oluştu.' });
  }
});

// 8e) Web Panel Erişimi Kaldır (sadece owner)
router.post('/panel-access/remove', (req, res) => {
  if (!isOwnerCheck(req)) {
    return res.status(403).json({ error: 'Bu işlem sadece ekip sahibine açıktır.' });
  }
  const client = req.discordClient;
  const { type, id } = req.body;

  if (!id || !['user', 'role'].includes(type)) {
    return res.status(400).json({ error: 'Geçersiz parametreler.' });
  }

  try {
    const configPath = client.configPath;
    const currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    const listKey = type === 'user' ? 'webPanelUsers' : 'webPanelRoles';
    let list = (currentConfig[listKey] || '').split(',').map(i => i.trim()).filter(Boolean);
    list = list.filter(i => i !== id);
    currentConfig[listKey] = list.join(',');

    // Tab izinlerini de temizle
    let webTabPerms = {};
    try { webTabPerms = JSON.parse(currentConfig.webTabPermissions || '{}'); } catch (_) {}
    const permKey = type === 'user' ? 'users' : 'roles';
    if (webTabPerms[permKey]) delete webTabPerms[permKey][id];
    currentConfig.webTabPermissions = JSON.stringify(webTabPerms);

    saveConfig(client, currentConfig);
    res.json({ success: true, message: 'Web panel erişimi kaldırıldı.' });
  } catch (err) {
    console.error('Panel Access Silme Hatası:', err);
    res.status(500).json({ error: 'Erişim kaldırılırken hata oluştu.' });
  }
});

// ──────────────────────────────────────────────────────────────────────

// 9) DM Duyuru
router.post('/dm-duyuru', async (req, res) => {
  const client = req.discordClient;
  const guildId = req.session.guildId;
  const { roleId, message } = req.body;

  if (!roleId || !message) {
    return res.status(400).json({ error: 'Lütfen bir rol ve duyuru mesajı belirtin.' });
  }

  try {
    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
      return res.status(404).json({ error: 'Sunucu bulunamadı.' });
    }

    // Üyeleri fetch et (cache yoksa)
    // Fetch only the target role members to avoid hanging.
    await guild.members.fetch({ role: roleId }).catch(() => null);
    const role = guild.roles.cache.get(roleId);
    if (!role) {
      return res.status(404).json({ error: 'Seçilen rol sunucuda bulunamadı.' });
    }

    const roleMembers = role.members.filter(m => !m.user.bot);
    
    // İşlemi asenkron olarak arka planda çalıştıralım ki istek zaman aşımına uğramasın
    res.json({ success: true, message: `${roleMembers.size} üyeye DM duyurusu gönderme işlemi arka planda başlatıldı.` });

    // Duyuru Gönderimi Başlat
    (async () => {
      // Sunucu davet bağlantısını belirle
      let serverInviteUrl = null;
      try {
        const vanity = await guild.fetchVanityData().catch(() => null);
        if (vanity?.code) {
          serverInviteUrl = `https://discord.gg/${vanity.code}`;
        } else {
          const existingInvites = await guild.invites.fetch().catch(() => null);
          if (existingInvites && existingInvites.size > 0) {
            serverInviteUrl = existingInvites.first().url;
          } else {
            const targetChannel = guild.rulesChannel ||
              guild.publicUpdatesChannel ||
              guild.channels.cache.find(c => c.isTextBased() && c.permissionsFor(guild.members.me)?.has('CreateInstantInvite'));
            if (targetChannel) {
              const createdInvite = await targetChannel.createInvite({ maxAge: 0, reason: 'DM Duyuru Butonu' }).catch(() => null);
              if (createdInvite?.url) serverInviteUrl = createdInvite.url;
            }
          }
        }
      } catch (err) {
        console.error('Duyuru davet linki alınamadı:', err);
      }

      if (!serverInviteUrl) {
        serverInviteUrl = `https://discord.com/channels/${guild.id}`;
      }

      const dmContainer = new ContainerBuilder();
      const ekipIsmi = client.config?.ekipIsmi || guild.name;
      const headerSection = new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`## ${ekipIsmi}\nEkip Duyurusu`)
        )
        .setButtonAccessory(
          new ButtonBuilder()
            .setLabel('Sunucuya Git')
            .setStyle(ButtonStyle.Link)
            .setURL(serverInviteUrl)
        );

      dmContainer
        .addSectionComponents(headerSection)
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(message))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Gönderen: Web Yönetim Paneli`));

      const sentMembers = [];
      const failedMembers = [];

      for (const [, member] of roleMembers) {
        try {
          await member.send({ components: [dmContainer], flags: MessageFlags.IsComponentsV2 });
          sentMembers.push(member.id);
        } catch {
          failedMembers.push(member.id);
        }
      }

      // Loglama
      const dmDuyuruLogChannelId = client.config.dmDuyuruLogChannelIdEnabled !== false ? client.config.dmDuyuruLogChannelId : null;
      if (dmDuyuruLogChannelId) {
        const logChannel = guild.channels.cache.get(dmDuyuruLogChannelId) || await guild.channels.fetch(dmDuyuruLogChannelId).catch(() => null);
        if (logChannel?.isTextBased()) {
          const logDescription = `**Web Paneli Üzerinden DM Duyurusu**\n` +
            `**Tarih:** <t:${Math.floor(Date.now() / 1000)}:F>\n` +
            `**Hedef Rol:** \`${role.name}\`\n` +
            `**Toplam Kişi:** \`${roleMembers.size}\`\n` +
            `**Başarılı:** \`${sentMembers.length}\`\n` +
            `**Başarısız:** \`${failedMembers.length}\`\n\n` +
            `**Mesaj:**\n\`\`\`\n${message}\n\`\`\``;

          const logContainer = new ContainerBuilder()
            .setAccentColor(0x2f3136)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🧾 Web DM Duyuru Logu`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(logDescription))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Viqole Bot\`s`));

          await logChannel.send({ components: [logContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
        }
      }
    })().catch(err => console.error('Arka planda DM duyuru hatası:', err));

  } catch (err) {
    console.error('API DM Duyuru Hatası:', err);
    res.status(500).json({ error: 'Duyuru gönderilirken bir hata oluştu.' });
  }
});

// 9) Bot Kontrolü (Restart / Stop / Start)
router.post('/bot/control', async (req, res) => {
  const client = req.discordClient;
  const { action } = req.body;

  if (!['restart', 'stop', 'start'].includes(action)) {
    return res.status(400).json({ error: 'Geçersiz eylem.' });
  }

  try {
    if (action === 'restart') {
      res.json({ success: true, message: 'Bot yeniden başlatılıyor. Lütfen bekleyin...' });
      setTimeout(async () => {
        console.log('[WEB] Bot restart komutu alındı.');
        try {
          if (client.webServer) {
            client.webServer.close();
          }
          await client.destroy();
        } catch (err) {
          console.error('Bot yok edilirken hata:', err);
        }
        process.exit(0); // PM2 veya servis yöneticisi otomatik yeniden başlatacaktır.
      }, 1000);
    } else if (action === 'stop') {
      const isReady = client && typeof client.isReady === 'function' && client.isReady();
      if (!isReady) {
        return res.status(400).json({ error: 'Bot zaten kapalı (çevrimdışı).' });
      }
      await client.destroy();
      console.log('[WEB] Bot Discord bağlantısı kesildi. Web sunucusu aktif kalmaya devam ediyor.');
      res.json({ success: true, message: 'Bot Discord bağlantısı kesildi (Çevrimdışı).' });
    } else if (action === 'start') {
      const isReady = client && typeof client.isReady === 'function' && client.isReady();
      if (isReady) {
        return res.status(400).json({ error: 'Bot zaten açık (çevrimiçi).' });
      }
      const token = client.config.token || process.env.TOKEN;
      await client.login(token);
      console.log('[WEB] Bot Discord bağlantısı başlatıldı. Çevrimiçi.');
      res.json({ success: true, message: 'Bot başarıyla başlatıldı (Çevrimiçi).' });
    }
  } catch (err) {
    console.error('API Bot Control Hatası:', err);
    res.status(500).json({ error: 'İşlem gerçekleştirilemedi: ' + err.message });
  }
});


// 10) Veritabanı (Data) Sıfırlama
router.post('/data/reset', async (req, res) => {
  const client = req.discordClient;
  const { target } = req.body; // 'farm', 'warnings', 'events', 'stats', 'tickets', 'giveaways', 'banaf', 'youtube', 'bans', 'all'

  if (!['farm', 'warnings', 'events', 'stats', 'tickets', 'giveaways', 'banaf', 'youtube', 'bans', 'all'].includes(target)) {
    return res.status(400).json({ error: 'Geçersiz hedef.' });
  }

  try {
    if (target === 'farm') {
      db.prepare('DELETE FROM farm').run();
    } else if (target === 'warnings') {
      db.prepare('DELETE FROM warnings').run();
    } else if (target === 'events') {
      db.prepare('DELETE FROM events').run();
      db.prepare('DELETE FROM activities').run();
      clearAllEventsStats();
      const cp = client.configPath;
      if (cp && fs.existsSync(cp)) {
        try {
          const currentConfig = JSON.parse(fs.readFileSync(cp, 'utf8'));
          currentConfig.etkinlikTopMessageId = null;
          fs.writeFileSync(cp, JSON.stringify(currentConfig, null, 2), 'utf8');
          client.config = currentConfig;
        } catch (e) {}
      }
      const { debouncedUpdateEtkinlikTop } = await import('../../utils/statsHelper.js');
      debouncedUpdateEtkinlikTop();
    } else if (target === 'stats') {
      clearAllVoiceMessagesStats();
      const { debouncedUpdateEtkinlikTop } = await import('../../utils/statsHelper.js');
      debouncedUpdateEtkinlikTop();
    } else if (target === 'tickets') {
      db.prepare('DELETE FROM tickets').run();
      db.prepare('DELETE FROM ticket_configs').run();
    } else if (target === 'giveaways') {
      db.prepare('DELETE FROM giveaways').run();
    } else if (target === 'banaf') {
      db.prepare('DELETE FROM ban_affi').run();
      db.prepare('DELETE FROM panelsizbanaf').run();
    } else if (target === 'youtube') {
      db.prepare('DELETE FROM youtube_channels').run();
      db.prepare('DELETE FROM yt_pending').run();
    } else if (target === 'bans') {
      db.prepare('DELETE FROM bans').run();
    } else if (target === 'all') {
      db.prepare('DELETE FROM farm').run();
      db.prepare('DELETE FROM warnings').run();
      db.prepare('DELETE FROM events').run();
      db.prepare('DELETE FROM activities').run();
      db.prepare('DELETE FROM stats').run();
      db.prepare('DELETE FROM moderations').run();
      db.prepare('DELETE FROM bans').run();
      db.prepare('DELETE FROM tickets').run();
      db.prepare('DELETE FROM ticket_configs').run();
      db.prepare('DELETE FROM giveaways').run();
      db.prepare('DELETE FROM ban_affi').run();
      db.prepare('DELETE FROM panelsizbanaf').run();
      db.prepare('DELETE FROM youtube_channels').run();
      db.prepare('DELETE FROM yt_pending').run();
      const cp = client.configPath;
      if (cp && fs.existsSync(cp)) {
        try {
          const currentConfig = JSON.parse(fs.readFileSync(cp, 'utf8'));
          currentConfig.etkinlikTopMessageId = null;
          fs.writeFileSync(cp, JSON.stringify(currentConfig, null, 2), 'utf8');
          client.config = currentConfig;
        } catch (e) {}
      }
      const { debouncedUpdateEtkinlikTop } = await import('../../utils/statsHelper.js');
      debouncedUpdateEtkinlikTop();
    }

    res.json({ success: true, message: 'Veriler başarıyla sıfırlandı.' });
  } catch (err) {
    console.error('API Data Reset Hatası:', err);
    res.status(500).json({ error: 'Veritabanı sıfırlanırken hata oluştu.' });
  }
});

// 10.5) Kişi Bazlı Sıfırlama
router.post('/data/reset/member', async (req, res) => {
  const { userId, targets } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'Kullanıcı ID gereklidir.' });
  }

  if (!targets || !Array.isArray(targets) || targets.length === 0) {
    return res.status(400).json({ error: 'Lütfen sıfırlanacak en az bir veri türü seçin.' });
  }

  try {
    if (targets.includes('farm')) {
      db.prepare('DELETE FROM farm WHERE user_id = ?').run(userId);
    }

    if (targets.includes('warnings')) {
      db.prepare('DELETE FROM warnings WHERE user_id = ?').run(userId);
    }

    if (targets.includes('stats')) {
      clearUserVoiceMessagesStats(userId);
      const { debouncedUpdateEtkinlikTop } = await import('../../utils/statsHelper.js');
      debouncedUpdateEtkinlikTop();
    }

    if (targets.includes('tickets')) {
      db.prepare('DELETE FROM tickets WHERE user_id = ?').run(userId);
    }

    if (targets.includes('bans')) {
      db.prepare('DELETE FROM bans WHERE user_id = ?').run(userId);
    }

    if (targets.includes('events')) {
      clearUserEventsStats(userId);
      const { loadEvents, saveEvents } = await import('../../db.js');
      const events = loadEvents();
      let eventsChanged = false;
      for (const e of events) {
        if (e.participants && e.participants.includes(userId)) {
          e.participants = e.participants.filter(id => id !== userId);
          eventsChanged = true;
        }
      }
      if (eventsChanged) {
        saveEvents(events);
        const { debouncedUpdateEtkinlikTop } = await import('../../utils/statsHelper.js');
        debouncedUpdateEtkinlikTop();
      }
    }

    if (targets.includes('activities')) {
      const { loadActivity, saveActivity } = await import('../../db.js');
      const activities = loadActivity();
      let activitiesChanged = false;
      for (const a of activities) {
        if (a.participants && a.participants.includes(userId)) {
          a.participants = a.participants.filter(id => id !== userId);
          activitiesChanged = true;
        }
      }
      if (activitiesChanged) saveActivity(activities);
    }

    res.json({ success: true, message: `${userId} ID'li kullanıcının seçilen verileri başarıyla sıfırlandı.` });
  } catch (err) {
    console.error('API Member Reset Hatası:', err);
    res.status(500).json({ error: 'Kişi bazlı veri sıfırlanırken hata oluştu.' });
  }
});


// 11) Etkinlikleri ve Etkinlik Sayılarını Yönetme
router.get('/events', async (req, res) => {
  const client = req.discordClient;
  const guildId = req.session.guildId;

  try {
    // SQLite'taki tüm etkinlikleri getir
    const events = db.prepare('SELECT message_id as messageId, data FROM events').all();
    const parsedEvents = events.map(e => {
      try {
        return { messageId: e.messageId, ...JSON.parse(e.data) };
      } catch {
        return null;
      }
    }).filter(Boolean).filter(e => !e.finished);

    // İstatistiklerden etkinlik sayılarını getir
    const stats = db.prepare(`
      SELECT user_id as userId, SUM(events) as eventCount 
      FROM stats 
      GROUP BY user_id
    `).all();

    const statsMap = new Map(stats.map(s => [s.userId, s.eventCount]));

    // onayRoleId (Member) rolüne sahip olup hiç katılmayanları ekle
    const onayRoleId = client.config?.onayRoleId;
    const combinedLeaderboard = [];
    const addedUserIds = new Set();

    if (onayRoleId) {
      const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
      if (guild) {
        const role = guild.roles.cache.get(onayRoleId);
        if (role) {
          // Fetch only the onayli (team member) role members to avoid hanging.
          await guild.members.fetch({ role: onayRoleId }).catch(() => null);
          for (const [memberId, member] of role.members) {
            if (member.user.bot) continue;
            const count = statsMap.get(memberId) || 0;
            combinedLeaderboard.push({
              userId: memberId,
              eventCount: count
            });
            addedUserIds.add(memberId);
          }
        }
      }
    }

    // stats'taki diğer kullanıcıları da (bu rolde olmayan ama eventi olan) listeye ekle
    for (const s of stats) {
      if (s.eventCount > 0 && !addedUserIds.has(s.userId)) {
        combinedLeaderboard.push({
          userId: s.userId,
          eventCount: s.eventCount
        });
        addedUserIds.add(s.userId);
      }
    }

    // Varsayılan olarak büyükten küçüğe sırala
    combinedLeaderboard.sort((a, b) => b.eventCount - a.eventCount);

    res.json({ activeEvents: parsedEvents, eventStats: combinedLeaderboard });
  } catch (err) {
    console.error('API Events Hatası:', err);
    res.status(500).json({ error: 'Etkinlik verileri alınamadı.' });
  }
});


// 12) Etkinlik Sayısını Düzenle (Artır / Azalt / Sıfırla)
router.post('/events/update', async (req, res) => {
  const { userId, amount, action } = req.body; // action: 'add', 'set', 'clear'

  if (!userId) {
    return res.status(400).json({ error: 'Kullanıcı ID gereklidir.' });
  }

  try {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    // stats tablosunda kayıt var mı kontrol et
    const existing = db.prepare('SELECT events FROM stats WHERE user_id = ? AND date = ?').get(userId, today);

    if (action === 'clear') {
      // Tüm günlerdeki etkinlik sayılarını sıfırla
      db.prepare('UPDATE stats SET events = 0 WHERE user_id = ?').run(userId);
    } else if (action === 'set') {
      const setAmount = parseInt(amount) || 0;
      if (existing) {
        db.prepare('UPDATE stats SET events = ? WHERE user_id = ? AND date = ?').run(setAmount, userId, today);
      } else {
        db.prepare('INSERT INTO stats (user_id, date, events) VALUES (?, ?, ?)').run(userId, today, setAmount);
      }
    } else if (action === 'add') {
      const addAmount = parseInt(amount) || 1;
      if (existing) {
        db.prepare('UPDATE stats SET events = events + ? WHERE user_id = ? AND date = ?').run(addAmount, userId, today);
      } else {
        db.prepare('INSERT INTO stats (user_id, date, events) VALUES (?, ?, ?)').run(userId, today, addAmount);
      }
    }

    const { debouncedUpdateEtkinlikTop } = await import('../../utils/statsHelper.js');
    debouncedUpdateEtkinlikTop(req.discordClient);

    res.json({ success: true, message: 'Etkinlik sayısı güncellendi.' });
  } catch (err) {
    console.error('API Events Update Hatası:', err);
    res.status(500).json({ error: 'Etkinlik sayısı güncellenirken hata oluştu.' });
  }
});

// 13) Aktif Etkinliği Sonlandır / Sil
router.post('/events/delete', async (req, res) => {
  const { messageId } = req.body;

  if (!messageId) {
    return res.status(400).json({ error: 'Mesaj ID gereklidir.' });
  }

  try {
    const client = req.discordClient;
    // SQLite'tan bu etkinliği çekelim
    const row = db.prepare('SELECT data FROM events WHERE message_id = ?').get(messageId);
    if (row) {
      const event = JSON.parse(row.data);
      // 1. Ana mesajı sonlandırılmış hale getir
      try {
        const { buildEventContainer } = await import('../../utils/eventHelper.js');
        const channel = await client.channels.fetch(event.channelId).catch(() => null);
        if (channel?.isTextBased()) {
          const message = await channel.messages.fetch(event.messageId).catch(() => null);
          if (message) {
            const { container, row } = buildEventContainer(
              event.eventType,
              event.limit,
              event.participants,
              true,
              event.sure,
              event.yedek,
              event.toplanmaSaati
            );
            await message.edit({ components: [container, row], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
          }
        }
      } catch (err) {
        console.error('Delete event: Edit main message failed:', err);
      }

      // 2. Aktif işlemler kanalındaki log mesajını sil
      const mgmtChId = client.config?.aktifIslemlerChannelId;
      if (mgmtChId && event.mgmtMessageId) {
        try {
          const mgmtChannel = await client.channels.fetch(mgmtChId).catch(() => null);
          if (mgmtChannel?.isTextBased()) {
            const mgmtMsg = await mgmtChannel.messages.fetch(event.mgmtMessageId).catch(() => null);
            if (mgmtMsg) {
              await mgmtMsg.delete().catch(() => null);
            }
          }
        } catch (err) {
          console.error('Delete event: Delete mgmt message failed:', err);
        }
      }
    }

    db.prepare('DELETE FROM events WHERE message_id = ?').run(messageId);
    res.json({ success: true, message: 'Etkinlik veritabanından başarıyla kaldırıldı.' });
  } catch (err) {
    console.error('API Event Silme Hatası:', err);
    res.status(500).json({ error: 'Etkinlik silinirken hata oluştu.' });
  }
});

// 13.5) Bütün Aktif Etkinlikleri Sil
router.post('/events/clear-all', async (req, res) => {
  try {
    db.prepare('DELETE FROM events').run();
    res.json({ success: true, message: 'Bütün aktif etkinlik kayıtları başarıyla silindi.' });
  } catch (err) {
    console.error('API Bütün Etkinlikleri Silme Hatası:', err);
    res.status(500).json({ error: 'Bütün etkinlikler silinirken hata oluştu.' });
  }
});

// 13.6) Farm Yönetimi ve Sayılarını Güncelleme
// Gateway Rate Limit'e takılmamak ve %100 güncel rol verisi almak için rol üyelerini 2 dakika önbelleğe al
const roleCache = new Map(); // roleId -> { timestamp, members }

async function fetchRoleMembersWithCache(guild, roleId) {
  const cacheDuration = 2 * 60 * 1000; // 2 Dakika
  const now = Date.now();
  const cached = roleCache.get(roleId);

  if (cached && (now - cached.timestamp < cacheDuration)) {
    return cached.members;
  }

  let roleMembers = new Map();

  // 1) REST API ile dene (Gateway Rate Limit takılmadan en güncel rol listesini almak için)
  try {
    let lastId = '0';
    const limit = 1000;
    while (true) {
      const rawMembers = await guild.client.rest.get(
        `/guilds/${guild.id}/members`,
        { query: new URLSearchParams({ limit: limit.toString(), after: lastId }) }
      );
      if (!rawMembers || rawMembers.length === 0) break;

      for (const raw of rawMembers) {
        if (raw.roles && raw.roles.includes(roleId) && !raw.user.bot) {
          const member = guild.members.cache.get(raw.user.id) || guild.members._add(raw, true);
          roleMembers.set(raw.user.id, member);
        }
      }

      if (rawMembers.length < limit) break;
      lastId = rawMembers[rawMembers.length - 1].user.id;
    }

    if (roleMembers.size > 0) {
      roleCache.set(roleId, { timestamp: now, members: roleMembers });
      console.log(`[WEB API - Farm] Fetched ${roleMembers.size} members for role ${roleId} via REST.`);
      return roleMembers;
    }
  } catch (err) {
    console.warn(`[WEB API - Farm] REST fetch failed for role ${roleId}: ${err.message}`);
  }

  // 2) REST başarısız olursa Discord Gateway ile fetch etmeyi dene
  try {
    console.log(`[WEB API - Farm] Fetching members for role: ${roleId} from Discord Gateway`);
    const fetched = await guild.members.fetch({ role: roleId });
    const filtered = new Map();
    for (const [id, m] of fetched) {
      if (!m.user.bot && m.roles.cache.has(roleId)) {
        filtered.set(id, m);
      }
    }
    roleCache.set(roleId, { timestamp: now, members: filtered });
    console.log(`[WEB API - Farm] Fetched ${filtered.size} members from Gateway.`);
    return filtered;
  } catch (err) {
    console.warn(`[WEB API - Farm] guild.members.fetch failed for role ${roleId}: ${err.message}`);
    if (cached) {
      console.log(`[WEB API - Farm] Using expired cache for role ${roleId} as fallback.`);
      return cached.members;
    }
    // Son çare olarak yerel discord.js cache'ini filtrele
    const cachedMembers = guild.members.cache.filter(m => !m.user.bot && m.roles.cache.has(roleId));
    console.log(`[WEB API - Farm] Cache fallback returned ${cachedMembers.size} members.`);
    return cachedMembers;
  }
}

router.get('/farm', async (req, res) => {
  const client = req.discordClient;
  const guildId = req.session.guildId;

  try {
    // İstatistiklerden farm sayılarını getir
    const farmLeaderboard = db.prepare('SELECT user_id as userId, amount as farmCount FROM farm WHERE guild_id = ?').all(guildId);
    const statsMap = new Map(farmLeaderboard.map(s => [s.userId, s.farmCount]));

    const combinedLeaderboard = [];
    const onayRoleId = client.config?.onayRoleId;

    if (onayRoleId) {
      const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
      if (guild) {
        // Sadece onayRoleId rolüne sahip olan kullanıcıları getir
        const roleMembers = await fetchRoleMembersWithCache(guild, onayRoleId);
        for (const [memberId, member] of roleMembers) {
          if (!member || member.user?.bot) continue;
          if (!member.roles?.cache?.has(onayRoleId) && !member.roles?.includes?.(onayRoleId)) continue;
          
          // Farm değerini eşleştir (yoksa 0)
          const count = statsMap.get(memberId) || 0;
          combinedLeaderboard.push({
            userId: memberId,
            farmCount: count
          });
        }
      } else {
        console.warn(`[WEB API - Farm] Guild ${guildId} not found in cache/fetch.`);
      }
    } else {
      // Eğer onayRoleId tanımlı değilse, veritabanında kaydı olan herkesi listele (Fallback)
      console.warn('[WEB API - Farm] onayRoleId is not configured. Falling back to displaying all database records.');
      for (const [userId, count] of statsMap.entries()) {
        combinedLeaderboard.push({
          userId: userId,
          farmCount: count
        });
      }
    }

    // Varsayılan olarak büyükten küçüğe sırala
    combinedLeaderboard.sort((a, b) => b.farmCount - a.farmCount);

    res.json({ farmStats: combinedLeaderboard });
  } catch (err) {
    console.error('API Farm Hatası:', err);
    res.status(500).json({ error: 'Farm verileri alınamadı.' });
  }
});


router.post('/farm/update', async (req, res) => {
  const { userId, amount, action } = req.body; // action: 'add', 'set', 'clear'
  const guildId = req.session.guildId;

  if (!userId) {
    return res.status(400).json({ error: 'Kullanıcı ID gereklidir.' });
  }

  try {
    const { getFarmAmount, setFarmAmount, addFarmAmount } = await import('../../db.js');

    if (action === 'clear') {
      setFarmAmount(guildId, userId, 0);
    } else if (action === 'set') {
      const setAmount = parseInt(amount) || 0;
      setFarmAmount(guildId, userId, setAmount);
    } else if (action === 'add') {
      const addAmount = parseInt(amount) || 1;
      addFarmAmount(guildId, userId, addAmount);
    }

    res.json({ success: true, message: 'Farm miktarı güncellendi.' });
  } catch (err) {
    console.error('API Farm Update Hatası:', err);
    res.status(500).json({ error: 'Farm miktarı güncellenirken hata oluştu.' });
  }
});

// 14) Ticket Form Metni Güncelle
router.post('/ticket/form', (req, res) => {
  const client = req.discordClient;
  const { formText } = req.body;

  if (formText === undefined) {
    return res.status(400).json({ error: 'Geçersiz form metni.' });
  }

  try {
    const configPath = client.configPath;
    const currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    currentConfig.ticketFormText = formText;

    fs.writeFileSync(configPath, JSON.stringify(currentConfig, null, 2), 'utf8');
    client.config = currentConfig;

    res.json({ success: true, message: 'Başvuru form metni güncellendi.' });
  } catch (err) {
    console.error('API Ticket Form Güncelleme Hatası:', err);
    res.status(500).json({ error: 'Form metni kaydedilirken hata oluştu.' });
  }
});

// 15) Ticket Kategorisi Durumu Değiştir (Aktif/Pasif)
router.post('/ticket/category/toggle', (req, res) => {
  const client = req.discordClient;
  const { categoryId } = req.body;

  if (!categoryId) {
    return res.status(400).json({ error: 'Kategori ID gereklidir.' });
  }

  try {
    const configPath = client.configPath;
    const currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    // Kategoriler config'de yoksa varsayılanları oluşturalım
    if (!currentConfig.ticketCategories) {
      const defaultCatId = currentConfig.basvuruCategoryId || '';
      currentConfig.ticketCategories = [
        { id: 'destek', label: 'Destek', emoji: '1507734289255628990', description: 'Destek almak için ticket açın', enabled: true, categoryId: defaultCatId, buttonStyle: 'Primary' },
        { id: 'basvuru', label: 'Başvuru', emoji: '1507733959432208515', description: 'Ekibe katılmak için başvurun', enabled: true, categoryId: defaultCatId, buttonStyle: 'Secondary' },
        { id: 'referans', label: 'Referans ile Alım', emoji: '1507734363046150204', description: 'Referans ile alım için başvurun', enabled: true, categoryId: defaultCatId, buttonStyle: 'Primary' }
      ];
    }

    const cat = currentConfig.ticketCategories.find(c => c.id === categoryId);
    if (!cat) {
      return res.status(404).json({ error: 'Kategori bulunamadı.' });
    }

    cat.enabled = !cat.enabled;

    fs.writeFileSync(configPath, JSON.stringify(currentConfig, null, 2), 'utf8');
    client.config = currentConfig;

    res.json({ success: true, message: `Kategori ${cat.enabled ? 'etkinleştirildi' : 'devre dışı bırakıldı'}.`, config: client.config });
  } catch (err) {
    console.error('API Ticket Kategori Toggle Hatası:', err);
    res.status(500).json({ error: 'Kategori durumu değiştirilirken hata oluştu.' });
  }
});

// 16) Ticket Kategorisi Ekle / Düzenle
router.post('/ticket/category/save', (req, res) => {
  const client = req.discordClient;
  const { id, label, emoji, description, categoryId, buttonStyle } = req.body;

  if (!id || !label || !emoji) {
    return res.status(400).json({ error: 'Kategori ID, etiket ve emoji zorunludur.' });
  }

  try {
    const configPath = client.configPath;
    const currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    if (!currentConfig.ticketCategories) {
      const defaultCatId = currentConfig.basvuruCategoryId || '';
      currentConfig.ticketCategories = [
        { id: 'destek', label: 'Destek', emoji: '1507734289255628990', description: 'Destek almak için ticket açın', enabled: true, categoryId: defaultCatId, buttonStyle: 'Primary' },
        { id: 'basvuru', label: 'Başvuru', emoji: '1507733959432208515', description: 'Ekibe katılmak için başvurun', enabled: true, categoryId: defaultCatId, buttonStyle: 'Secondary' },
        { id: 'referans', label: 'Referans ile Alım', emoji: '1507734363046150204', description: 'Referans ile alım için başvurun', enabled: true, categoryId: defaultCatId, buttonStyle: 'Primary' }
      ];
    }

    const existingIndex = currentConfig.ticketCategories.findIndex(c => c.id === id);

    if (existingIndex > -1) {
      // Düzenleme (Update)
      currentConfig.ticketCategories[existingIndex] = {
        ...currentConfig.ticketCategories[existingIndex],
        label,
        emoji,
        description: description || '',
        categoryId: categoryId || '',
        buttonStyle: buttonStyle || 'Primary'
      };
    } else {
      // Yeni Ekleme (Insert)
      currentConfig.ticketCategories.push({
        id,
        label,
        emoji,
        description: description || '',
        categoryId: categoryId || '',
        buttonStyle: buttonStyle || 'Primary',
        enabled: true
      });
    }

    fs.writeFileSync(configPath, JSON.stringify(currentConfig, null, 2), 'utf8');
    client.config = currentConfig;

    res.json({ success: true, message: 'Kategori başarıyla kaydedildi.', config: client.config });
  } catch (err) {
    console.error('API Ticket Category Save Hatası:', err);
    res.status(500).json({ error: 'Kategori kaydedilirken hata oluştu.' });
  }
});

// 17) Ticket Kategorisi Sil
router.post('/ticket/category/delete', (req, res) => {
  const client = req.discordClient;
  const { categoryId } = req.body;

  if (!categoryId) {
    return res.status(400).json({ error: 'Kategori ID zorunludur.' });
  }

  try {
    const configPath = client.configPath;
    const currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    if (!currentConfig.ticketCategories) {
      currentConfig.ticketCategories = [];
    }

    currentConfig.ticketCategories = currentConfig.ticketCategories.filter(c => c.id !== categoryId);

    fs.writeFileSync(configPath, JSON.stringify(currentConfig, null, 2), 'utf8');
    client.config = currentConfig;

    res.json({ success: true, message: 'Kategori silindi.', config: client.config });
  } catch (err) {
    console.error('API Ticket Category Delete Hatası:', err);
    res.status(500).json({ error: 'Kategori silinirken hata oluştu.' });
  }
});

// ── AKTİFLİK YÖNETİMİ ROTALARI ──────────────────────────────────
router.get('/activity/current', async (req, res) => {
  const client = req.discordClient;
  const guildId = req.session.guildId;

  try {
    const { loadActivity } = await import('../../db.js');
    const activities = loadActivity();
    const activeActivity = activities.find(a => !a.processed);

    if (!activeActivity) {
      return res.json({ active: false });
    }

    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
      return res.status(404).json({ error: 'Sunucu bulunamadı.' });
    }

    const role = guild.roles.cache.get(activeActivity.roleId);
    if (!role) {
      return res.json({ active: false });
    }

    // Fetch only target activity role members to avoid hanging.
    await guild.members.fetch({ role: activeActivity.roleId }).catch(() => null);
    const roleMembers = role.members;

    const participantsList = [];
    const nonParticipantsList = [];

    const pSet = new Set(activeActivity.participants || []);

    for (const [memberId, member] of roleMembers) {
      if (member.user.bot) continue;
      const mInfo = {
        id: memberId,
        tag: member.user.tag,
        displayName: member.displayName,
        avatar: member.user.displayAvatarURL()
      };
      if (pSet.has(memberId)) {
        participantsList.push(mInfo);
      } else {
        nonParticipantsList.push(mInfo);
      }
    }

    res.json({
      active: true,
      activity: activeActivity,
      roleName: role.name,
      participants: participantsList,
      nonParticipants: nonParticipantsList
    });
  } catch (err) {
    console.error('API Activity Current Hatası:', err);
    res.status(500).json({ error: 'Aktiflik bilgisi alınamadı.' });
  }
});

router.post('/activity/participant/add', async (req, res) => {
  const client = req.discordClient;
  const guildId = req.session.guildId;
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'Kullanıcı ID gereklidir.' });
  }

  try {
    const { loadActivity, saveActivity } = await import('../../db.js');
    const activities = loadActivity();
    const activity = activities.find(a => !a.processed);

    if (!activity) {
      return res.status(400).json({ error: 'Aktif bir aktiflik kontrolü bulunamadı.' });
    }

    if (!activity.participants) activity.participants = [];
    if (activity.participants.includes(userId)) {
      return res.status(400).json({ error: 'Kullanıcı zaten katılmış.' });
    }

    activity.participants.push(userId);
    saveActivity(activities);

    // Update Discord message
    const { ButtonBuilder, ButtonStyle, ActionRowBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags } = await import('discord.js');
    
    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (guild) {
      const channel = guild.channels.cache.get(activity.channelId) || await guild.channels.fetch(activity.channelId).catch(() => null);
      if (channel?.isTextBased()) {
        const message = await channel.messages.fetch(activity.messageId).catch(() => null);
        if (message) {
          const targetRole = guild.roles.cache.get(activity.roleId);
          const targetRoleMention = targetRole ? `<@&${activity.roleId}>` : 'Bilinmeyen Rol';
          const expiresAtSec = Math.floor(activity.expiresAt / 1000);

          const button = new ButtonBuilder()
            .setCustomId('activity_join')
            .setLabel('✅  Katıl')
            .setStyle(ButtonStyle.Success);
          const row = new ActionRowBuilder().addComponents(button);

          const updatedContainer = new ContainerBuilder()
            .addMediaGalleryComponents(
              new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL('attachment://logo.png')
              )
            )
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent('# <a:duyuruvar:1507733857917735022> AKTİFLİK KONTROLÜ')
            )
            .addSeparatorComponents(
              new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            )
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                '> **Belirtilen rol için aktiflik kontrolü başlatılmıştır.**\n' +
                '> **Katılım için aşağıdaki butona tıklayın!**\n\n' +
                `<:MemberJoined:1509702256289648833> **Katılımcı Sayısı:** ${activity.participants.length}\n` +
                `<a:TimerSand:1509704018199449680> **Kalan Süre:** <t:${expiresAtSec}:R>`
              )
            )
            .addActionRowComponents(row)
            .addSeparatorComponents(
              new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            )
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent('-# Viqole Bots')
            );

          await message.edit({ components: [updatedContainer], flags: MessageFlags.IsComponentsV2 }).catch(err => console.error('Discord message edit error:', err));
        }
      }
    }

    res.json({ success: true, message: 'Kullanıcı katılanlara başarıyla eklendi.' });
  } catch (err) {
    console.error('API Activity Participant Add Hatası:', err);
    res.status(500).json({ error: 'Kullanıcı eklenemedi.' });
  }
});

router.post('/activity/participant/remove', async (req, res) => {
  const client = req.discordClient;
  const guildId = req.session.guildId;
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'Kullanıcı ID gereklidir.' });
  }

  try {
    const { loadActivity, saveActivity } = await import('../../db.js');
    const activities = loadActivity();
    const activity = activities.find(a => !a.processed);

    if (!activity) {
      return res.status(400).json({ error: 'Aktif bir aktiflik kontrolü bulunamadı.' });
    }

    if (!activity.participants) activity.participants = [];
    if (!activity.participants.includes(userId)) {
      return res.status(400).json({ error: 'Kullanıcı katılanlar listesinde bulunmuyor.' });
    }

    activity.participants = activity.participants.filter(id => id !== userId);
    saveActivity(activities);

    // Update Discord message
    const { ButtonBuilder, ButtonStyle, ActionRowBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags } = await import('discord.js');
    
    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (guild) {
      const channel = guild.channels.cache.get(activity.channelId) || await guild.channels.fetch(activity.channelId).catch(() => null);
      if (channel?.isTextBased()) {
        const message = await channel.messages.fetch(activity.messageId).catch(() => null);
        if (message) {
          const targetRole = guild.roles.cache.get(activity.roleId);
          const targetRoleMention = targetRole ? `<@&${activity.roleId}>` : 'Bilinmeyen Rol';
          const expiresAtSec = Math.floor(activity.expiresAt / 1000);

          const button = new ButtonBuilder()
            .setCustomId('activity_join')
            .setLabel('✅  Katıl')
            .setStyle(ButtonStyle.Success);
          const row = new ActionRowBuilder().addComponents(button);

          const updatedContainer = new ContainerBuilder()
            .addMediaGalleryComponents(
              new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL('attachment://logo.png')
              )
            )
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent('# <a:duyuruvar:1507733857917735022> AKTİFLİK KONTROLÜ')
            )
            .addSeparatorComponents(
              new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            )
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                '> **Belirtilen rol için aktiflik kontrolü başlatılmıştır.**\n' +
                '> **Katılım için aşağıdaki butona tıklayın!**\n\n' +
                `<:MemberJoined:1509702256289648833> **Katılımcı Sayısı:** ${activity.participants.length}\n` +
                `<a:TimerSand:1509704018199449680> **Kalan Süre:** <t:${expiresAtSec}:R>`
              )
            )
            .addActionRowComponents(row)
            .addSeparatorComponents(
              new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            )
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent('-# Viqole Bots')
            );

          await message.edit({ components: [updatedContainer], flags: MessageFlags.IsComponentsV2 }).catch(err => console.error('Discord message edit error:', err));
        }
      }
    }

    res.json({ success: true, message: 'Kullanıcı katılanlardan başarıyla silindi.' });
  } catch (err) {
    console.error('API Activity Participant Remove Hatası:', err);
    res.status(500).json({ error: 'Kullanıcı silinemedi.' });
  }
});

router.post('/activity/end', async (req, res) => {
  const client = req.discordClient;
  const guildId = req.session.guildId;

  try {
    const { loadActivity, saveActivity } = await import('../../db.js');
    const activities = loadActivity();
    const activity = activities.find(a => !a.processed);

    if (!activity) {
      return res.status(400).json({ error: 'Aktif bir aktiflik kontrolü bulunamadı.' });
    }

    const { ButtonBuilder, ButtonStyle, ActionRowBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MediaGalleryBuilder, MediaGalleryItemBuilder, AttachmentBuilder, MessageFlags } = await import('discord.js');
    
    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
      return res.status(404).json({ error: 'Sunucu bulunamadı.' });
    }

    const role = guild.roles.cache.get(activity.roleId);
    const participants = activity.participants || [];
    const reactedUserIds = new Set(participants);
    const removedUserIds = [];

    // Fetch only activity role members to avoid hanging.
    if (role) {
      await guild.members.fetch({ role: activity.roleId }).catch(() => null);
      const toRemove = [];
      for (const [memberId, member] of role.members) {
        if (!reactedUserIds.has(memberId)) {
          toRemove.push(member);
        }
      }

      const chunkSize = 10;
      for (let i = 0; i < toRemove.length; i += chunkSize) {
        const chunk = toRemove.slice(i, i + chunkSize);
        await Promise.all(chunk.map(async (member) => {
          try {
            await member.roles.remove(activity.roleId, 'Aktiflik kontrolünde butona tıklamadı (web panelden sonlandırma)');
            removedUserIds.push(member.id);
          } catch {}
        }));
      }
    }

    activity.processed = true;
    saveActivity(activities);

    // Edit original Discord message to "Sona Erdi"
    try {
      const actChannel = await guild.channels.fetch(activity.channelId).catch(() => null);
      if (actChannel?.isTextBased()) {
        const actMsg = await actChannel.messages.fetch(activity.messageId).catch(() => null);
        if (actMsg) {
          const endedContainer = new ContainerBuilder()
            .setAccentColor(0xED4245)
            .addMediaGalleryComponents(
              new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://logo.png'))
            )
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('# ⏰ AKTİFLİK KONTROLÜ SONA ERDİ'))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
              `> **Aktiflik kontrolü web panelinden sonlandırılmıştır.**\n\n` +
              `🎯 **Hedef Rol:** ${role || 'Bilinmeyen'}\n` +
              `✅ **Durum:** Manuel Sonlandırıldı (Web)\n` +
              `📊 **Katılımcı Sayısı:** ${participants.length} kişi\n` +
              `🔴 **Rolü Alınan Sayısı:** ${removedUserIds.length} kişi`
            ))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# FiveM Ekip Yönetim Sistemi'));
          await actMsg.edit({ components: [endedContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
        }
      }
    } catch (e) { console.error('Aktiflik mesajı güncellenemedi:', e); }

    // Log kanalına rapor + txt dosyaları gönder
    try {
      const logChannelId = client.config.activityLogChannelId;
      if (logChannelId) {
        const logChannel = guild.channels.cache.get(logChannelId) || await guild.channels.fetch(logChannelId).catch(() => null);
        if (logChannel?.isTextBased()) {
          const katilanlarText = participants.length > 0 ? participants.join('\n') : '';
          const katilmayanlarText = removedUserIds.length > 0 ? removedUserIds.join('\n') : '';
          const katilanlarAttachment = new AttachmentBuilder(Buffer.from(katilanlarText, 'utf-8'), { name: 'katilanlar.txt' });
          const katilmayanlarAttachment = new AttachmentBuilder(Buffer.from(katilmayanlarText, 'utf-8'), { name: 'katilmayanlar.txt' });

          const logContainer = new ContainerBuilder()
            .setAccentColor(0xED4245)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ⏰ Aktiflik Kontrolü Manuel Sonlandırıldı`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
              `> 🎯 **Rol:** ${role ? `${role} (\`${role.name}\`)` : `\`${activity.roleId}\``}\n` +
              `> ✅ **Katılan Sayısı:** \`${participants.length}\`\n` +
              `> ❌ **Katılmayan/Rolü Alınan Sayısı:** \`${removedUserIds.length}\`\n` +
              `> 👮 **Sonlandıran:** Web Arayüzü\n` +
              `> 📢 **Aktiflik Mesajı:** [Tıkla](https://discord.com/channels/${activity.guildId}/${activity.channelId}/${activity.messageId})`
            ))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));

          await logChannel.send({
            components: [logContainer],
            files: [katilanlarAttachment, katilmayanlarAttachment],
            flags: MessageFlags.IsComponentsV2
          }).catch(err => console.error('Log kanalına aktiflik raporu gönderilemedi:', err));
        }
      }
    } catch (e) { console.error('Aktiflik log gönderme hatası:', e); }

    // Delete management message from aktif-işlemler
    try {
      const mgmtChId = client.config?.aktifIslemlerChannelId;
      if (mgmtChId && activity.mgmtMessageId) {
        const mgmtChannel = await guild.channels.fetch(mgmtChId).catch(() => null);
        if (mgmtChannel?.isTextBased()) {
          const mgmtMsg = await mgmtChannel.messages.fetch(activity.mgmtMessageId).catch(() => null);
          if (mgmtMsg) await mgmtMsg.delete().catch(() => null);
        }
      }
    } catch (err) {
      console.error('Aktiflik yönetim mesajı silme hatası:', err);
    }

    res.json({ success: true, message: `Aktiflik sonlandırıldı. ${removedUserIds.length} kişinin rolü alındı.` });
  } catch (err) {
    console.error('API Activity End Hatası:', err);
    res.status(500).json({ error: 'Aktiflik sonlandırılamadı.' });
  }
});

// ── ETKİNLİK DÜZENLEME ROTASI ──────────────────────────────────
router.post('/events/edit', async (req, res) => {
  const client = req.discordClient;
  const guildId = req.session.guildId;
  const { messageId, eventType, limit, sure, yedek, toplanmaSaati } = req.body;

  if (!messageId || !eventType || !limit || !sure) {
    return res.status(400).json({ error: 'Eksik parametreler.' });
  }

  try {
    const { loadEvents, saveEvents } = await import('../../db.js');
    const { buildEventContainer, parseEventDuration } = await import('../../utils/eventHelper.js');
    const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = await import('discord.js');

    const events = loadEvents();
    const event = events.find(e => e.messageId === messageId);

    if (!event) {
      return res.status(404).json({ error: 'Etkinlik bulunamadı.' });
    }

    event.eventType = eventType;
    event.limit = parseInt(limit, 10);
    event.sure = sure;
    event.yedek = yedek ? parseInt(yedek, 10) : null;
    event.toplanmaSaati = toplanmaSaati || null;
    event.expiresAt = parseEventDuration(sure);

    saveEvents(events);

    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (guild) {
      // 1) Main Discord event message edit
      const channel = guild.channels.cache.get(event.channelId) || await guild.channels.fetch(event.channelId).catch(() => null);
      if (channel?.isTextBased()) {
        const message = await channel.messages.fetch(event.messageId).catch(() => null);
        if (message) {
          const { container: evtC, row: evtR } = buildEventContainer(event.eventType, event.limit, event.participants || [], event.finished, event.sure, event.yedek, event.toplanmaSaati);
          await message.edit({ components: [evtC, evtR], flags: MessageFlags.IsComponentsV2 }).catch(err => console.error('Event Discord edit error:', err));
        }
      }

      // 2) Management channel message edit
      if (event.mgmtMessageId) {
        const mgmtChId = client.config?.aktifIslemlerChannelId;
        if (mgmtChId) {
          const mgmtChannel = guild.channels.cache.get(mgmtChId) || await guild.channels.fetch(mgmtChId).catch(() => null);
          if (mgmtChannel?.isTextBased()) {
            const mgmtMsg = await mgmtChannel.messages.fetch(event.mgmtMessageId).catch(() => null);
            if (mgmtMsg) {
              const mgmtRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`aktif_etkinlik_duzenle_${event.messageId}`).setLabel('Düzenle').setStyle(ButtonStyle.Primary).setEmoji('✏️'),
                new ButtonBuilder().setCustomId(`aktif_etkinlik_sonlandir_${event.messageId}`).setLabel('Sonlandır').setStyle(ButtonStyle.Danger).setEmoji('⛔'),
                new ButtonBuilder().setCustomId(`aktif_etkinlik_cikar_${event.messageId}`).setLabel('Katılan Çıkart').setStyle(ButtonStyle.Secondary).setEmoji('👤')
              );
              const mgmtContainer = new ContainerBuilder()
                .setAccentColor(0xFEE75C)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🎛️ Etkinlik Yönetimi (Düzenlendi)`))
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                  `> 🏆 **Etkinlik:** ${event.eventType}\n` +
                  `> 👥 **Kontenjan:** ${event.limit} kişi\n` +
                  `> ⏰ **Süre:** ${event.sure}\n` +
                  `> 📢 **Kanal:** <#${event.channelId}>\n` +
                  `> 🔗 **Mesaj:** [Tıkla](https://discord.com/channels/${guild.id}/${event.channelId}/${event.messageId})`
                ))
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
                .addActionRowComponents(mgmtRow)
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));
              await mgmtMsg.edit({ components: [mgmtContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
            }
          }
        }
      }
    }

    res.json({ success: true, message: 'Etkinlik başarıyla düzenlendi.' });
  } catch (err) {
    console.error('API Event Edit Hatası:', err);
    res.status(500).json({ error: 'Etkinlik düzenlenirken bir hata oluştu.' });
  }
});

// ── YOUTUBE TAKİP SİSTEMİ ROTALARI ──────────────────────────────
router.get('/youtube/channels', async (req, res) => {
  const client = req.discordClient;
  try {
    const { loadYoutubeChannels } = await import('../../db.js');
    const channels = loadYoutubeChannels();
    res.json({
      channels,
      videoChannelId: client.config?.videoChannelId || ''
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'YouTube kanalları alınamadı.' });
  }
});

router.post('/youtube/channels/add', async (req, res) => {
  const client = req.discordClient;
  const { url, everyone } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'Kanal URL veya ID gereklidir.' });
  }

  try {
    const { loadYoutubeChannels, saveYoutubeChannels } = await import('../../db.js');
    const { getChannelIdFromUrl, getChannelName } = await import('../../services/youtubeService.js');

    const channelId = await getChannelIdFromUrl(url);
    if (!channelId) {
      return res.status(400).json({ error: 'Geçersiz YouTube kanal URL/ID.' });
    }

    const channels = loadYoutubeChannels();
    if (channels.some(c => c.channelId === channelId)) {
      return res.status(400).json({ error: 'Bu kanal zaten takip ediliyor.' });
    }

    const channelName = await getChannelName(channelId) || 'Bilinmeyen YouTube Kanalı';
    const newChan = {
      channelId,
      channelName,
      lastVideoId: '',
      everyone: !!everyone
    };

    channels.push(newChan);
    saveYoutubeChannels(channels);

    res.json({ success: true, message: `"${channelName}" başarıyla eklendi.`, channels });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Kanal eklenirken hata oluştu.' });
  }
});

router.post('/youtube/channels/remove', async (req, res) => {
  const { channelId } = req.body;

  if (!channelId) {
    return res.status(400).json({ error: 'Kanal ID gereklidir.' });
  }

  try {
    const { loadYoutubeChannels, saveYoutubeChannels } = await import('../../db.js');
    let channels = loadYoutubeChannels();
    channels = channels.filter(c => c.channelId !== channelId);
    saveYoutubeChannels(channels);

    res.json({ success: true, message: 'Kanal takip listesinden kaldırıldı.', channels });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Kanal kaldırılırken hata oluştu.' });
  }
});

router.post('/youtube/config', async (req, res) => {
  const client = req.discordClient;
  const { videoChannelId, ytSorumlusuRoleId, youtubeBasvuruChannelId } = req.body;

  try {
    const configPath = client.configPath;
    const currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    currentConfig.videoChannelId = videoChannelId || '';
    currentConfig.ytSorumlusuRoleId = ytSorumlusuRoleId || '';
    currentConfig.youtubeBasvuruChannelId = youtubeBasvuruChannelId || '';

    fs.writeFileSync(configPath, JSON.stringify(currentConfig, null, 2), 'utf8');
    client.config = currentConfig;

    res.json({ success: true, message: 'YouTube ayarları güncellendi.', config: client.config });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'YouTube ayarları kaydedilirken hata oluştu.' });
  }
});

// ── BAN AFFI YÖNETİMİ ROTALARI ──────────────────────────────────
router.get('/banaf/requests', async (req, res) => {
  const client = req.discordClient;
  try {
    const { loadBanAffi } = await import('../../db.js');
    const requests = loadBanAffi();

    const result = await Promise.all(requests.map(async (r) => {
      let userTag = 'Bilinmeyen Kullanıcı';
      try {
        const cached = client.users.cache.get(r.userId);
        const u = cached || await client.users.fetch(r.userId).catch(() => null);
        if (u) userTag = u.tag;
      } catch {}
      return {
        ...r,
        userTag
      };
    }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Başvurular alınamadı.' });
  }
});

router.post('/banaf/requests/approve', async (req, res) => {
  const client = req.discordClient;
  const guildId = req.session.guildId;
  const { requestId } = req.body;

  if (!requestId) {
    return res.status(400).json({ error: 'Talep ID gereklidir.' });
  }

  try {
    const { loadBanAffi, saveBanAffi } = await import('../../db.js');
    const allRequests = loadBanAffi();
    const request = allRequests.find(r => r.id === parseInt(requestId, 10));

    if (!request) return res.status(404).json({ error: 'Talep bulunamadı.' });
    if (request.opened) return res.status(400).json({ error: 'Talep zaten onaylanmış.' });

    request.opened = true;
    saveBanAffi(allRequests);

    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (guild) {
      // 1) Send message to ban-af public channel
      const banAfChannelId = client.config.banAfChannelId;
      if (banAfChannelId) {
        try {
          const banAfChannel = await guild.channels.fetch(banAfChannelId);
          if (banAfChannel?.isTextBased()) {
            const user = await client.users.fetch(request.userId).catch(() => null);
            await banAfChannel.send(`${user || `<@${request.userId}>`} kullanıcısının banı, web panel üzerinden ban affı kullanılarak açıldı.`);
          }
        } catch {}
      }

      // 2) Send DM to user
      try {
        const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = await import('discord.js');
        const dmUser = await client.users.fetch(request.userId).catch(() => null);
        if (dmUser) {
          const dmApproved = new ContainerBuilder()
            .setAccentColor(0x57F287)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🎉 Ban Affı Onaylandı`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
              `"${request.banReason}" sebebi ile yasaklanmıştın.\n\nBanın açıldı, sunucuya girebilirsin!`
            ))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));
          await dmUser.send({ components: [dmApproved], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
        }
      } catch {}

      // 3) Delete mgmt message in ban-affi-yönetim channel
      if (request.mgmtMessageId && request.mgmtChannelId) {
        try {
          const ch = await guild.channels.fetch(request.mgmtChannelId).catch(() => null);
          if (ch?.isTextBased()) {
            const msg = await ch.messages.fetch(request.mgmtMessageId).catch(() => null);
            if (msg) await msg.delete().catch(() => null);
          }
        } catch {}
      }
    }

    res.json({ success: true, message: 'Ban affı talebi onaylandı.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'İşlem gerçekleştirilemedi.' });
  }
});

router.post('/banaf/requests/reject', async (req, res) => {
  const client = req.discordClient;
  const guildId = req.session.guildId;
  const { requestId } = req.body;

  if (!requestId) {
    return res.status(400).json({ error: 'Talep ID gereklidir.' });
  }

  try {
    const { loadBanAffi, saveBanAffi } = await import('../../db.js');
    const allRequests = loadBanAffi();
    const request = allRequests.find(r => r.id === parseInt(requestId, 10));

    if (!request) return res.status(404).json({ error: 'Talep bulunamadı.' });

    // Send DM to user
    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (guild) {
      try {
        const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = await import('discord.js');
        const dmUser = await client.users.fetch(request.userId).catch(() => null);
        if (dmUser) {
          const dmRejected = new ContainerBuilder()
            .setAccentColor(0xED4245)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ❌ Ban Affı Reddedildi`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
              `Şu anki ban affına özel olarak ban affınız reddedilmiştir.\nBir sonraki ban affını beklemeniz gerekmektedir.`
            ))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));
          await dmUser.send({ components: [dmRejected], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
        }
      } catch {}

      // Delete mgmt message in ban-affi-yönetim channel
      if (request.mgmtMessageId && request.mgmtChannelId) {
        try {
          const ch = await guild.channels.fetch(request.mgmtChannelId).catch(() => null);
          if (ch?.isTextBased()) {
            const msg = await ch.messages.fetch(request.mgmtMessageId).catch(() => null);
            if (msg) await msg.delete().catch(() => null);
          }
        } catch {}
      }
    }

    // Delete request
    const filteredRequests = allRequests.filter(r => r.id !== parseInt(requestId, 10));
    saveBanAffi(filteredRequests);

    res.json({ success: true, message: 'Ban affı talebi reddedildi ve silindi.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'İşlem gerçekleştirilemedi.' });
  }
});

router.post('/banaf/requests/delete', async (req, res) => {
  const client = req.discordClient;
  const guildId = req.session.guildId;
  const { requestId } = req.body;

  if (!requestId) {
    return res.status(400).json({ error: 'Talep ID gereklidir.' });
  }

  try {
    const { loadBanAffi, saveBanAffi } = await import('../../db.js');
    const allRequests = loadBanAffi();
    const request = allRequests.find(r => r.id === parseInt(requestId, 10));

    if (!request) return res.status(404).json({ error: 'Talep bulunamadı.' });

    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (guild && request.mgmtMessageId && request.mgmtChannelId) {
      try {
        const ch = await guild.channels.fetch(request.mgmtChannelId).catch(() => null);
        if (ch?.isTextBased()) {
          const msg = await ch.messages.fetch(request.mgmtMessageId).catch(() => null);
          if (msg) await msg.delete().catch(() => null);
        }
      } catch {}
    }

    const filteredRequests = allRequests.filter(r => r.id !== parseInt(requestId, 10));
    saveBanAffi(filteredRequests);

    res.json({ success: true, message: 'Talep başarıyla silindi.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'İşlem gerçekleştirilemedi.' });
  }
});

// Panelsiz Ban Affı Rotaları
router.get('/panelsizbanaf/config', async (req, res) => {
  const guildId = req.session.guildId;
  try {
    const { getPanelSizBanAfGuild } = await import('../../db.js');
    const config = getPanelSizBanAfGuild(guildId) || { active: false, yazmaKanalId: null, banListeKanalId: null, entries: [] };
    res.json(config);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Panelsiz ban affı ayarları alınamadı.' });
  }
});

router.post('/panelsizbanaf/config/update', async (req, res) => {
  const client = req.discordClient;
  const guildId = req.session.guildId;
  const { active, yazmaKanalId, banListeKanalId } = req.body;

  try {
    const { getPanelSizBanAfGuild, setPanelSizBanAfGuild } = await import('../../db.js');
    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');

    const existingCfg = getPanelSizBanAfGuild(guildId) || { active: false, entries: [] };
    let banListeMesajId = existingCfg.banListeMesajId;

    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return res.status(404).json({ error: 'Sunucu bulunamadı.' });

    if (active && (!existingCfg.active || existingCfg.banListeKanalId !== banListeKanalId)) {
      const banListeChannel = guild.channels.cache.get(banListeKanalId) || await guild.channels.fetch(banListeKanalId).catch(() => null);
      if (banListeChannel?.isTextBased()) {
        const buttonRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('panelsiz_banaf_cikar')
            .setLabel('Çıkart')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('❌')
        );
        
        // build baseline contents
        const lines = (existingCfg.entries || []).map((entry, index) => `${index + 1}. <@${entry.userId}> (${entry.userId}) ${entry.reason}`);
        const content = lines.length > 0 ? lines.join('\n') : '*Ban listesi boş — gelen kayıtlar burada görünecek.*';

        const baslangicMesaji = await banListeChannel.send({
          content,
          components: [buttonRow]
        }).catch(() => null);
        
        if (baslangicMesaji) {
          banListeMesajId = baslangicMesaji.id;
        }
      }
    }

    const newCfg = {
      active: !!active,
      yazmaKanalId: yazmaKanalId || null,
      banListeKanalId: banListeKanalId || null,
      banListeMesajId,
      entries: existingCfg.entries || []
    };

    setPanelSizBanAfGuild(guildId, newCfg);
    res.json({ success: true, message: 'Panelsiz ban affı ayarları kaydedildi.', config: newCfg });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ayarlar kaydedilirken hata oluştu.' });
  }
});

router.post('/panelsizbanaf/entries/add', async (req, res) => {
  const client = req.discordClient;
  const guildId = req.session.guildId;
  const { userId, reason } = req.body;

  if (!userId || !reason) {
    return res.status(400).json({ error: 'Eksik parametreler.' });
  }

  try {
    const { getPanelSizBanAfGuild, setPanelSizBanAfGuild } = await import('../../db.js');
    const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = await import('discord.js');

    const guildCfg = getPanelSizBanAfGuild(guildId);
    if (!guildCfg || !guildCfg.active) {
      return res.status(400).json({ error: 'Panelsiz ban affı aktif değil.' });
    }

    if (!guildCfg.entries) guildCfg.entries = [];
    if (guildCfg.entries.some(e => e.userId === userId)) {
      return res.status(400).json({ error: 'Bu kullanıcı zaten listede ekli.' });
    }

    guildCfg.entries.push({ userId, reason });
    setPanelSizBanAfGuild(guildId, guildCfg);

    // Update Discord message
    const guild = client.guilds.cache.get(guildId) || await guild.guilds.fetch(guildId).catch(() => null);
    if (guild) {
      const banListeChannel = guild.channels.cache.get(guildCfg.banListeKanalId) || await guild.channels.fetch(guildCfg.banListeKanalId).catch(() => null);
      if (banListeChannel?.isTextBased() && guildCfg.banListeMesajId) {
        const lines = guildCfg.entries.map((entry, index) => `${index + 1}. <@${entry.userId}> (${entry.userId}) ${entry.reason}`);
        const yeniIcerik = lines.length > 0 ? lines.join('\n') : '*Ban listesi boş — gelen kayıtlar burada görünecek.*';

        const buttonRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('panelsiz_banaf_cikar').setLabel('Çıkart').setStyle(ButtonStyle.Danger).setEmoji('❌')
        );

        const banListeMesaj = await banListeChannel.messages.fetch(guildCfg.banListeMesajId).catch(() => null);
        if (banListeMesaj && banListeMesaj.editable) {
          await banListeMesaj.edit({ content: yeniIcerik, components: [buttonRow] }).catch(() => null);
        }
      }

      // Log it
      const banAfLogChannelId = client.config.banAfLogChannelIdEnabled !== false ? client.config.banAfLogChannelId : null;
      if (banAfLogChannelId) {
        const logChannel = guild.channels.cache.get(banAfLogChannelId) || await guild.channels.fetch(banAfLogChannelId).catch(() => null);
        if (logChannel?.isTextBased()) {
          const logContainer = new ContainerBuilder()
            .setAccentColor(0x5865F2)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## <:Cezaa:1507734141498818581> Panelsiz Ban Affı Kaydı`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
              `> 👤 **Kişi:** <@${userId}> (\`${userId}\`)\n` +
              `> 📝 **Sebep/İçerik:** ${reason}\n` +
              `> 👮 **Ekleyen Yetkili:** Web Arayüzü\n` +
              `> 📅 **Tarih:** <t:${Math.floor(Date.now() / 1000)}:F>`
            ))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));
          await logChannel.send({ components: [logContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
        }
      }
    }

    res.json({ success: true, message: 'Kayıt başarıyla listeye eklendi.', config: guildCfg });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Kayıt eklenirken hata oluştu.' });
  }
});

router.post('/panelsizbanaf/entries/remove', async (req, res) => {
  const client = req.discordClient;
  const guildId = req.session.guildId;
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'Kullanıcı ID gereklidir.' });
  }

  try {
    const { getPanelSizBanAfGuild, setPanelSizBanAfGuild } = await import('../../db.js');
    const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = await import('discord.js');

    const guildCfg = getPanelSizBanAfGuild(guildId);
    if (!guildCfg || !guildCfg.active) {
      return res.status(400).json({ error: 'Panelsiz ban affı aktif değil.' });
    }

    if (!guildCfg.entries) guildCfg.entries = [];
    if (!guildCfg.entries.some(e => e.userId === userId)) {
      return res.status(400).json({ error: 'Kullanıcı listede bulunmuyor.' });
    }

    guildCfg.entries = guildCfg.entries.filter(e => e.userId !== userId);
    setPanelSizBanAfGuild(guildId, guildCfg);

    // Update Discord message
    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (guild) {
      const banListeChannel = guild.channels.cache.get(guildCfg.banListeKanalId) || await guild.channels.fetch(guildCfg.banListeKanalId).catch(() => null);
      if (banListeChannel?.isTextBased() && guildCfg.banListeMesajId) {
        const lines = guildCfg.entries.map((entry, index) => `${index + 1}. <@${entry.userId}> (${entry.userId}) ${entry.reason}`);
        const yeniIcerik = lines.length > 0 ? lines.join('\n') : '*Ban listesi boş — gelen kayıtlar burada görünecek.*';

        const buttonRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('panelsiz_banaf_cikar').setLabel('Çıkart').setStyle(ButtonStyle.Danger).setEmoji('❌')
        );

        const banListeMesaj = await banListeChannel.messages.fetch(guildCfg.banListeMesajId).catch(() => null);
        if (banListeMesaj && banListeMesaj.editable) {
          await banListeMesaj.edit({ content: yeniIcerik, components: [buttonRow] }).catch(() => null);
        }
      }

      // Log it
      const banAfLogChannelId = client.config.banAfLogChannelIdEnabled !== false ? client.config.banAfLogChannelId : null;
      if (banAfLogChannelId) {
        const logChannel = guild.channels.cache.get(banAfLogChannelId) || await guild.channels.fetch(banAfLogChannelId).catch(() => null);
        if (logChannel?.isTextBased()) {
          const logContainer = new ContainerBuilder()
            .setAccentColor(0xED4245)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ❌ Panelsiz Ban Affı Kaydı Kaldırıldı (Web Arayüzü)`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
              `> 👤 **Kişi:** <@${userId}> (\`${userId}\`)\n` +
              `> 👮 **Kaldıran Yetkili:** Web Arayüzü\n` +
              `> 📅 **Tarih:** <t:${Math.floor(Date.now() / 1000)}:F>`
            ))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));
          await logChannel.send({ components: [logContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
        }
      }
    }

    res.json({ success: true, message: 'Kayıt listeden başarıyla kaldırıldı.', config: guildCfg });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Kayıt silinirken hata oluştu.' });
  }
});

// ── ÇEKİLİŞ TAKİP SİSTEMİ ROTALARI ──────────────────────────────
router.get('/giveaways/list', async (req, res) => {
  try {
    const { loadGiveaways } = await import('../../db.js');
    const giveaways = loadGiveaways();
    res.json(giveaways);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Çekiliş listesi alınamadı.' });
  }
});

router.post('/giveaways/end', async (req, res) => {
  const client = req.discordClient;
  const guildId = req.session.guildId;
  const { messageId, forcedWinnerId } = req.body;

  if (!messageId) {
    return res.status(400).json({ error: 'Mesaj ID gereklidir.' });
  }

  try {
    const { loadGiveaways, saveGiveaways } = await import('../../db.js');
    const { endGiveaway } = await import('../../handlers/giveawayHandler.js');

    const giveaways = loadGiveaways();
    const giveaway = giveaways.find(g => g.messageId === messageId);

    if (!giveaway) {
      return res.status(404).json({ error: 'Çekiliş bulunamadı.' });
    }

    if (giveaway.ended) {
      return res.status(400).json({ error: 'Çekiliş zaten sonlandırılmış.' });
    }

    if (forcedWinnerId) {
      giveaway.forcedWinnerId = forcedWinnerId;
    }

    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
      return res.status(404).json({ error: 'Sunucu bulunamadı.' });
    }

    await endGiveaway(giveaway, guild, client);
    saveGiveaways(giveaways);

    res.json({ success: true, message: 'Çekiliş manuel olarak sonlandırıldı ve kazanan belirlendi.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Çekiliş sonlandırılırken hata oluştu.' });
  }
});

router.post('/giveaways/reroll', async (req, res) => {
  const client = req.discordClient;
  const guildId = req.session.guildId;
  const { messageId } = req.body;

  if (!messageId) {
    return res.status(400).json({ error: 'Mesaj ID gereklidir.' });
  }

  try {
    const { loadGiveaways, saveGiveaways } = await import('../../db.js');
    const { buildGiveawayContainer } = await import('../../handlers/giveawayHandler.js');
    const { MessageFlags } = await import('discord.js');

    const giveaways = loadGiveaways();
    const giveaway = giveaways.find(g => g.messageId === messageId);

    if (!giveaway) {
      return res.status(404).json({ error: 'Çekiliş bulunamadı.' });
    }

    if (!giveaway.ended) {
      return res.status(400).json({ error: 'Çekiliş henüz bitmemiş. Önce bitirmelisiniz.' });
    }

    const participants = giveaway.participants || [];
    if (participants.length === 0) {
      return res.status(400).json({ error: 'Çekilişe katılan kimse olmadığı için yeniden çekilemez.' });
    }

    const winnerCount = Math.min(giveaway.winnerCount, participants.length);
    const winners = [];
    const tempParticipants = [...participants];
    for (let i = 0; i < winnerCount; i++) {
      const randIndex = Math.floor(Math.random() * tempParticipants.length);
      winners.push(tempParticipants.splice(randIndex, 1)[0]);
    }

    giveaway.winners = winners;
    saveGiveaways(giveaways);

    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (guild) {
      const channel = await guild.channels.fetch(giveaway.channelId).catch(() => null);
      if (channel?.isTextBased()) {
        const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
        if (message) {
          const container = buildGiveawayContainer(giveaway, true);
          await message.edit({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
        }
        
        await channel.send({
          content: `🎉 **Yeniden Çekim!** **${giveaway.prize}** çekilişinin yeni kazananları: ${winners.map(id => `<@${id}>`).join(', ')}`
        });
      }
    }

    res.json({ success: true, message: 'Çekiliş yeniden çekildi ve duyuruldu.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Yeniden çekim sırasında hata oluştu.' });
  }
});

// ── IC Kontrol Ayarları Getir ──
router.get('/ickontrol', async (req, res) => {
  const client = req.discordClient;
  const guildId = req.session.guildId;

  try {
    const mainServer = client.config.icKontrolMainServer || null;
    // Normalize to array for consistent frontend consumption
    const typeRaw = client.config.icKontrolType;
    const types = Array.isArray(typeRaw) ? typeRaw : (typeRaw ? [typeRaw] : []);
    const activeServers = client.config.icKontrolActiveServers || [];
    const channelId = client.config.icKontrolChannelId || null;
    const messageId = client.config.icKontrolMessageId || null;

    // Fetch players online on active servers
    const { getOnlineStatusMap } = await import('../../utils/icHelper.js');
    const onlineMap = await getOnlineStatusMap(activeServers).catch(() => new Map());

    // Get list of guild members with onayRoleId
    const onayRoleId = client.config.onayRoleId;
    const onlineMembers = [];
    const offlineMembers = [];

    if (onayRoleId) {
      const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
      if (guild) {
        // Fetch only onayli members to avoid hanging.
        await guild.members.fetch({ role: onayRoleId }).catch(() => null);
        const role = guild.roles.cache.get(onayRoleId);
        if (role) {
          for (const [memberId, member] of role.members) {
            if (member.user.bot) continue;
            if (onlineMap.has(memberId)) {
              const info = onlineMap.get(memberId);
              onlineMembers.push({
                id: memberId,
                tag: member.user.tag,
                displayName: member.displayName,
                avatar: member.user.displayAvatarURL(),
                serverName: info.serverName,
                playerName: info.playerName
              });
            } else {
              offlineMembers.push({
                id: memberId,
                tag: member.user.tag,
                displayName: member.displayName,
                avatar: member.user.displayAvatarURL()
              });
            }
          }
        }
      }
    }

    res.json({
      config: {
        icKontrolMainServer: mainServer,
        icKontrolTypes: types,
        icKontrolActiveServers: activeServers,
        icKontrolChannelId: channelId,
        icKontrolMessageId: messageId
      },
      onlineMembers,
      offlineMembers
    });
  } catch (err) {
    console.error('API IC Kontrol Get Hatası:', err);
    res.status(500).json({ error: 'IC Kontrol bilgileri alınamadı.' });
  }
});

// ── IC Kontrol Ayarları Güncelle ──
router.post('/ickontrol/update', async (req, res) => {
  const client = req.discordClient;
  const { mainServer, types, activeServers, channelId } = req.body;

  // types: array like ['isim'], ['kanal-list'], or ['isim','kanal-list']
  if (!mainServer || !Array.isArray(types) || types.length === 0) {
    return res.status(400).json({ error: 'Ana sunucu ve en az bir kontrol türü zorunludur.' });
  }

  const validTypes = ['isim', 'kanal-list'];
  if (!types.every(t => validTypes.includes(t))) {
    return res.status(400).json({ error: 'Geçersiz kontrol türü.' });
  }

  // kanal-list seçildiyse kanal zorunlu
  if (types.includes('kanal-list') && !channelId) {
    return res.status(400).json({ error: 'Kanal-list modu için bir kanal seçilmesi zorunludur.' });
  }

  try {
    const configPath = client.configPath;
    let currentConfig = {};
    if (fs.existsSync(configPath)) {
      currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }

    currentConfig.icKontrolMainServer = mainServer;
    currentConfig.icKontrolType = types;
    currentConfig.icKontrolActiveServers = activeServers || [mainServer];
    currentConfig.icKontrolChannelId = types.includes('kanal-list') ? (channelId || null) : null;

    // If channel changed, reset message id
    if (currentConfig.icKontrolChannelId !== client.config.icKontrolChannelId) {
      currentConfig.icKontrolMessageId = null;
    }

    // Write config file
    fs.writeFileSync(configPath, JSON.stringify(currentConfig, null, 2), 'utf8');
    client.config = currentConfig;

    // Send initial channel list message if kanal-list is active and channel is selected
    if (types.includes('kanal-list') && channelId) {
      const guild = client.guilds.cache.get(req.session.guildId) || await client.guilds.fetch(req.session.guildId).catch(() => null);
      if (guild) {
        const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
        if (channel?.isTextBased() && !currentConfig.icKontrolMessageId) {
          const newMsg = await channel.send({ content: '⏳ Oyuncu listesi güncelleniyor...' }).catch(() => null);
          if (newMsg) {
            currentConfig.icKontrolMessageId = newMsg.id;
            fs.writeFileSync(configPath, JSON.stringify(currentConfig, null, 2), 'utf8');
            client.config = currentConfig;
          }
        }
      }
    }

    res.json({ success: true, message: 'IC Kontrol ayarları başarıyla güncellendi.', config: client.config });
  } catch (err) {
    console.error('API IC Kontrol Güncelleme Hatası:', err);
    res.status(500).json({ error: 'Ayarlar kaydedilirken hata oluştu.' });
  }
});

// ── SUNUCU GÜNCELLE & TARA (WEB PANEL TETİKLEMESİ) ──
router.post('/bot/guncelle', async (req, res) => {
  const client = req.discordClient;
  const guildId = req.session.guildId;

  try {
    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
      return res.status(404).json({ error: 'Sunucu bulunamadı.' });
    }

    await guild.roles.fetch().catch(() => null);
    await guild.channels.fetch().catch(() => null);

    const activeConfigPath = client.configPath;
    let currentConfig = {};
    if (fs.existsSync(activeConfigPath)) {
      try {
        currentConfig = JSON.parse(fs.readFileSync(activeConfigPath, 'utf8'));
      } catch {}
    }

    const finalConfig = { ...currentConfig };
    const scanResults = { ...currentConfig };
    const matchedRoles = [];
    const missingRoles = [];
    const matchedCategories = [];
    const missingCategories = [];
    const matchedChannels = [];
    const missingChannels = [];

    // Rolleri Tara — yalnızca config ID'si ile eşleştir
    for (const roleSchema of SYSTEM_ROLES) {
      const configId = currentConfig[roleSchema.key];
      const foundByConfig = configId ? guild.roles.cache.get(configId) : null;

      if (foundByConfig) {
        scanResults[roleSchema.key] = foundByConfig.id;
        matchedRoles.push({ schema: roleSchema, role: foundByConfig });
      } else {
        delete scanResults[roleSchema.key];
        missingRoles.push(roleSchema);
      }
    }

    // Kategorileri Tara — yalnızca config ID'si ile eşleştir
    for (const catSchema of SYSTEM_CATEGORIES) {
      const configId = currentConfig[catSchema.key];
      const foundByConfig = configId ? guild.channels.cache.get(configId) : null;

      if (foundByConfig) {
        scanResults[catSchema.key] = foundByConfig.id;
        matchedCategories.push({ schema: catSchema, channel: foundByConfig });
      } else {
        delete scanResults[catSchema.key];
        missingCategories.push(catSchema);
      }
    }

    // Kanalları Tara — yalnızca config ID'si ile eşleştir, bulamazsa kendi kategorisi altında isimle ara
    for (const chanSchema of SYSTEM_CHANNELS) {
      const configId = currentConfig[chanSchema.key];
      let foundByConfig = configId ? guild.channels.cache.get(configId) : null;

      if (chanSchema.parentCategoryKey) {
        const parentCatId = currentConfig[chanSchema.parentCategoryKey] || (chanSchema.parentFallbackKey ? currentConfig[chanSchema.parentFallbackKey] : null);
        const parentCat = parentCatId ? guild.channels.cache.get(parentCatId) : null;

        if (parentCat) {
          // Eğer kanalı bulduysak ama üst kategorisi doğru değilse, bulunamadı sayıp kategori altından aratacağız
          if (foundByConfig && foundByConfig.parentId !== parentCat.id) {
            foundByConfig = null;
          }

          if (!foundByConfig) {
            const match = guild.channels.cache.find(c => c.parentId === parentCat.id && c.name.toLowerCase() === chanSchema.name.toLowerCase());
            if (match) {
              foundByConfig = match;
              scanResults[chanSchema.key] = match.id;
              if (chanSchema.key === 'banLogChannelId') {
                scanResults['unbanLogChannelId'] = match.id;
              }
            }
          }
        } else {
          // Eğer üst kategori sunucuda yoksa, kanalı da yok sayacağız ki oluşturulabilsin
          foundByConfig = null;
        }
      } else {
        // Üst kategorisi olmayan genel kanallar için
        if (!foundByConfig) {
          const match = guild.channels.cache.find(c => !c.parentId && c.name.toLowerCase() === chanSchema.name.toLowerCase());
          if (match) {
            foundByConfig = match;
            scanResults[chanSchema.key] = match.id;
          }
        }
      }

      if (foundByConfig) {
        scanResults[chanSchema.key] = foundByConfig.id;
        matchedChannels.push({ schema: chanSchema, channel: foundByConfig });
      } else {
        delete scanResults[chanSchema.key];
        missingChannels.push(chanSchema);
      }
    }

    // Eşleşenleri config'e atalım
    for (const key of Object.keys(scanResults)) {
      finalConfig[key] = scanResults[key];
    }

    const createdReports = [];

    // Helper: get or create category
    async function findOrCreateCategory(name, categoryKey) {
      if (categoryKey) {
        const configId = finalConfig[categoryKey];
        if (configId) {
          const cat = guild.channels.cache.get(configId) || await guild.channels.fetch(configId).catch(() => null);
          if (cat) return cat;
        }
      }
      let cat = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === name.toLowerCase());
      if (!cat) {
        cat = await guild.channels.create({
          name: name,
          type: ChannelType.GuildCategory,
          reason: 'Ekip yönetim sistemi güncellemesi (Web Panel).'
        });
        createdReports.push(`📁 **${name} Kategorisi** oluşturuldu.`);
      }
      if (categoryKey) {
        finalConfig[categoryKey] = cat.id;
      }
      return cat;
    }

    // 1. Rolleri oluştur
    for (const schema of missingRoles) {
      const roleOptions = {
        name: schema.name,
        reason: 'Ekip yönetim sistemi güncellemesi (Web Panel).'
      };
      const isNoColorRole = (schema.name === 'Ban Command' || schema.name === 'Alım Sorumlusu');
      if (!isNoColorRole && schema.color) {
        roleOptions.color = schema.color;
      }

      const role = await guild.roles.create(roleOptions);
      finalConfig[schema.key] = role.id;
      createdReports.push(`➕ **${schema.name}** rolü oluşturuldu (${role.name}).`);
    }

    // 2. Kategorileri oluştur
    for (const schema of missingCategories) {
      await findOrCreateCategory(schema.name, schema.key);
    }

    // 3. Kanalları oluştur
    for (const schema of missingChannels) {
      let parentId = null;
      if (schema.parentName && schema.parentCategoryKey) {
        const cat = await findOrCreateCategory(schema.parentName, schema.parentCategoryKey);
        parentId = cat.id;
      }

      const permissionOverwrites = [];
      const isLogCategory = schema.parentName === 'Viqole Komut Log' || schema.parentName === 'Viqole Sunucu Log' || schema.parentName === 'LOG KANALLARI';
      if (isLogCategory || schema.parentName === 'YÖNETİM' || schema.privateFor) {
        permissionOverwrites.push({
          id: guild.id,
          deny: [PermissionFlagsBits.ViewChannel]
        });
        permissionOverwrites.push({
          id: guild.members.me.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels]
        });

        if (schema.privateFor) {
          const roleId = finalConfig[schema.privateFor] || currentConfig[schema.privateFor];
          if (roleId) {
            permissionOverwrites.push({
              id: roleId,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
            });
          }
        }
      }

      const channel = await guild.channels.create({
        name: schema.name,
        type: schema.type,
        parent: parentId,
        permissionOverwrites,
        reason: 'Ekip yönetim sistemi güncellemesi (Web Panel).'
      });

      finalConfig[schema.key] = channel.id;
      createdReports.push(`➕ **#${schema.name}** kanalı oluşturuldu (${channel.name}).`);
    }

    const basvuruCategoryId = finalConfig['basvuruCategoryId'];
    if (basvuruCategoryId) {
      if (!finalConfig.ticketCategories) {
        finalConfig.ticketCategories = [
          { id: 'destek', label: 'Destek', emoji: '1507734289255628990', description: 'Destek almak için ticket açın', enabled: true, categoryId: basvuruCategoryId, buttonStyle: 'Primary' },
          { id: 'basvuru', label: 'Başvuru', emoji: '1507733959432208515', description: 'Ekibe katılmak için başvurun', enabled: true, categoryId: basvuruCategoryId, buttonStyle: 'Secondary' },
          { id: 'referans', label: 'Referans ile Alım', emoji: '1507734363046150204', description: 'Referans ile alım için başvurun', enabled: true, categoryId: basvuruCategoryId, buttonStyle: 'Primary' }
        ];
      } else {
        finalConfig.ticketCategories = finalConfig.ticketCategories.map(cat => {
          const channelExists = cat.categoryId ? guild.channels.cache.has(cat.categoryId) : false;
          return {
            ...cat,
            categoryId: channelExists ? cat.categoryId : basvuruCategoryId
          };
        });
      }
    }

    fs.writeFileSync(activeConfigPath, JSON.stringify(finalConfig, null, 2), 'utf8');
    client.config = finalConfig;

    const ticketChannelId = finalConfig['ticketChannelId'];
    if (ticketChannelId && basvuruCategoryId) {
      const { getTicketConfig, setTicketConfig } = await import('../../db.js');
      const currentTktCfg = getTicketConfig(guild.id);
      setTicketConfig(guild.id, {
        ticketChannelId: ticketChannelId,
        categoryId: basvuruCategoryId,
        ticketCount: currentTktCfg.ticketCount || 0
      });
    }

    let registerResult = '';
    try {
      const { stdout } = await execAsync('node registerCommands.js', { env: process.env });
      registerResult = stdout || 'Başarılı';
    } catch (regErr) {
      registerResult = `Hata: ${regErr.message}`;
    }

    res.json({
      success: true,
      createdItems: createdReports,
      registerResult: registerResult
    });
  } catch (err) {
    console.error('API Bot Guncelle Hatası:', err);
    res.status(500).json({ error: 'Güncelleme sırasında hata oluştu: ' + err.message });
  }
});

// ── SUNUCUYU SIFIRDAN KUR (WEB PANEL TETİKLEMESİ) ──
router.post('/bot/ekip-sistemi-kur', async (req, res) => {
  const client = req.discordClient;
  const guildId = req.session.guildId;

  try {
    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
      return res.status(404).json({ error: 'Sunucu bulunamadı.' });
    }

    await guild.channels.fetch().catch(() => null);
    await guild.roles.fetch().catch(() => null);

    const activeConfigPath = client.configPath;
    let currentConfig = {};
    if (fs.existsSync(activeConfigPath)) {
      try {
        currentConfig = JSON.parse(fs.readFileSync(activeConfigPath, 'utf8'));
      } catch {}
    }

    const {
      banAfType,
      panelsizYazmaKanalId,
      panelsizBanListeKanalId
    } = req.body;

    const reports = [];

    async function getOrCreateRole(configKey, defaultName, color) {
      const customId = req.body[configKey];
      if (customId) {
        const existingRole = guild.roles.cache.get(customId) || await guild.roles.fetch(customId).catch(() => null);
        if (existingRole) {
          currentConfig[configKey] = existingRole.id;
          reports.push(`  🔹 **${defaultName} Rolü:** Seçildi (${existingRole.name})`);
          return existingRole.id;
        } else {
          throw new Error(`Belirtilen ID'ye sahip role ulaşılamadı: ${defaultName} (ID: ${customId})`);
        }
      }

      const roleOptions = {
        name: defaultName,
        reason: 'Ekip yönetim sistemi kurulumu (Web Panel).'
      };

      const isNoColorRole = (defaultName === 'Ban Command' || defaultName === 'Alım Sorumlusu');
      if (!isNoColorRole && color) {
        roleOptions.color = color;
      }

      const role = await guild.roles.create(roleOptions);
      currentConfig[configKey] = role.id;
      reports.push(`  ➕ **${defaultName} Rolü:** Otomatik Oluşturuldu (${role.name})`);
      return role.id;
    }

    async function getOrCreateChannel(configKey, defaultName, type, parentId = null, permissionOverwrites = []) {
      const customId = req.body[configKey];
      if (customId) {
        const existingChannel = guild.channels.cache.get(customId) || await guild.channels.fetch(customId).catch(() => null);
        if (existingChannel) {
          if (parentId && existingChannel.parentId !== parentId) {
            await existingChannel.setParent(parentId).catch(() => null);
          }
          if (permissionOverwrites && permissionOverwrites.length > 0) {
            await existingChannel.permissionOverwrites.set(permissionOverwrites).catch(() => null);
          }
          currentConfig[configKey] = existingChannel.id;
          reports.push(`  🔹 **${defaultName}:** Seçildi (${existingChannel.name})`);
          return existingChannel.id;
        } else {
          throw new Error(`Belirtilen ID'ye sahip kanala ulaşılamadı: ${defaultName} (ID: ${customId})`);
        }
      }

      const options = {
        name: defaultName,
        type: type,
        reason: 'Ekip yönetim sistemi kurulumu (Web Panel).'
      };
      if (parentId) options.parent = parentId;
      if (permissionOverwrites && permissionOverwrites.length > 0) {
        options.permissionOverwrites = permissionOverwrites;
      }

      const channel = await guild.channels.create(options);
      currentConfig[configKey] = channel.id;
      reports.push(`  ➕ **${defaultName}:** Otomatik Oluşturuldu (${channel.name})`);
      return channel.id;
    }

    reports.push('### 🛡️ **Roller ve Genel Kanallar**');

    const banCommandRoleId = await getOrCreateRole('banCommandRoleId', 'Ban Command', '#e74c3c');

    let ticketStaffRoleId = req.body.ticketStaffRoleId;
    if (ticketStaffRoleId) {
      const staffRole = guild.roles.cache.get(ticketStaffRoleId) || await guild.roles.fetch(ticketStaffRoleId).catch(() => null);
      if (staffRole) {
        currentConfig.ticketStaffRoleId = staffRole.id;
        reports.push(`  🔹 **Alım Sorumlusu Rolü:** Seçildi (${staffRole.name})`);
      }
    }
    if (!currentConfig.ticketStaffRoleId) {
      const existingStaff = guild.roles.cache.find(r =>
        ['alım sorumlusu', 'alim sorumlusu', 'başvuru sorumlusu', 'basvuru sorumlusu'].includes(r.name.toLowerCase())
      );
      if (existingStaff) {
        currentConfig.ticketStaffRoleId = existingStaff.id;
        ticketStaffRoleId = existingStaff.id;
        reports.push(`  🔹 **Alım Sorumlusu Rolü:** Mevcut rol tespit edildi (${existingStaff.name})`);
      } else {
        ticketStaffRoleId = await getOrCreateRole('ticketStaffRoleId', 'Alım Sorumlusu', '#3498db');
      }
    } else {
      ticketStaffRoleId = currentConfig.ticketStaffRoleId;
    }

    const onayRoleId = req.body.onayRoleId;
    if (!onayRoleId) {
      return res.status(400).json({ error: 'Ekip Üyesi rolü (onayRoleId) zorunludur. Lütfen geçerli bir rol seçin.' });
    }
    const existingOnayRole = guild.roles.cache.get(onayRoleId) || await guild.roles.fetch(onayRoleId).catch(() => null);
    if (!existingOnayRole) {
      return res.status(400).json({ error: 'Seçilen Ekip Üyesi rolü sunucuda bulunamadı.' });
    }
    currentConfig.onayRoleId = existingOnayRole.id;
    reports.push(`  🔹 **Ekip Üyesi Rolü:** Tanımlandı (${existingOnayRole.name})`);

    const ytSorumlusuRoleId = await getOrCreateRole('ytSorumlusuRoleId', 'YT Sorumlusu', '#FF0000');
    const farmSorumlusuRoleId = await getOrCreateRole('farmSorumlusuRoleId', 'Farm Sorumlusu', '#f1c40f');
    // jailRoleId kaldırıldı

    const killCategoryId = await getOrCreateChannel('killCategoryId', 'KİLL', ChannelType.GuildCategory);

    let videoChannelId = req.body.videoChannelId;
    if (videoChannelId) {
      const existingCh = guild.channels.cache.get(videoChannelId) || await guild.channels.fetch(videoChannelId).catch(() => null);
      if (existingCh) {
        currentConfig['videoChannelId'] = existingCh.id;
        reports.push(`  🔹 **Video Paylaşım Kanalı:** Seçildi (${existingCh.name})`);
      }
    }
    if (!currentConfig['videoChannelId']) {
      const streamOrContent = guild.channels.cache.find(c =>
        (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) && (
          c.name.toLowerCase().includes('stream') ||
          c.name.toLowerCase().includes('içerik') ||
          c.name.toLowerCase().includes('icerik') ||
          c.name.toLowerCase() === 'video-paylasim' ||
          c.name.toLowerCase() === 'video-paylaşım'
        )
      );
      if (streamOrContent) {
        currentConfig['videoChannelId'] = streamOrContent.id;
        videoChannelId = streamOrContent.id;
        reports.push(`  🔹 **Video Paylaşım Kanalı:** Mevcut kanal tespit edildi (${streamOrContent.name})`);
      } else {
        videoChannelId = await getOrCreateChannel('videoChannelId', 'video-paylasim', ChannelType.GuildText);
      }
    } else {
      videoChannelId = currentConfig['videoChannelId'];
    }

    const warningPublicChannelId = await getOrCreateChannel('warningPublicChannelId', 'uyarılar', ChannelType.GuildText);


    reports.push('\n### 🎫 **Başvuru Sistemi**');
    reports.push('  ℹ️ **BAŞVURU kategorisi ve başvuru kanalları otomatik oluşturulmadı.**');


    reports.push('\n### 🏛️ **Yönetim Kanalları**');
    const yonetimCategoryId = await getOrCreateChannel('yonetimCategoryId', 'YÖNETİM', ChannelType.GuildCategory, null, [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] }
    ]);

    const farmManagementChannelId = await getOrCreateChannel('farmManagementChannelId', 'farm-yönetim', ChannelType.GuildText, yonetimCategoryId, [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: farmSorumlusuRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] }
    ]);

    const youtubeManagementChannelId = await getOrCreateChannel('youtubeManagementChannelId', 'youtube-yönetim', ChannelType.GuildText, yonetimCategoryId, [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: ytSorumlusuRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] }
    ]);

    const aktifIslemlerChannelId = await getOrCreateChannel('aktifIslemlerChannelId', 'aktif-işlemler', ChannelType.GuildText, yonetimCategoryId, [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] }
    ]);

    let banAffiManagementChannelId = null;
    if (banAfType === 'panelli') {
      banAffiManagementChannelId = await getOrCreateChannel('banAffiManagementChannelId', 'ban-affı-yönetim', ChannelType.GuildText, yonetimCategoryId, [
        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: banCommandRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] }
      ]);
    } else {
      currentConfig['banAffiManagementChannelId'] = null;
    }

    reports.push('\n### 📝 **Log Sistemleri**');
    const komutLogCategoryId = await getOrCreateChannel('komutLogCategoryId', 'Viqole Komut Log', ChannelType.GuildCategory, null, [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] }
    ]);

    const sunucuLogCategoryId = await getOrCreateChannel('sunucuLogCategoryId', 'Viqole Sunucu Log', ChannelType.GuildCategory, null, [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] }
    ]);

    try {
      const categoriesCount = guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).size;
      const sunucuLogCat = guild.channels.cache.get(sunucuLogCategoryId);
      if (sunucuLogCat) await sunucuLogCat.setPosition(categoriesCount - 1).catch(() => null);
      const komutLogCat = guild.channels.cache.get(komutLogCategoryId);
      if (komutLogCat) await komutLogCat.setPosition(categoriesCount - 2).catch(() => null);
      const yonCat = guild.channels.cache.get(yonetimCategoryId);
      if (yonCat && komutLogCat) await yonCat.setPosition(komutLogCat.position > 0 ? komutLogCat.position - 1 : 0).catch(() => null);
    } catch {}

    const komutLogs = [
      { key: 'warningLogChannelId', name: 'uyari-log' },
      { key: 'farmLogChannelId', name: 'farm-log' },
      { key: 'ticketLogChannelId', name: 'ticket-log' },
      { key: 'youtubeLogChannelId', name: 'youtube-log' },
      { key: 'dmDuyuruLogChannelId', name: 'dm-duyuru-log' },
      { key: 'activityLogChannelId', name: 'aktiflik-log' },
      { key: 'botLogChannelId', name: 'bot-log' },
      { key: 'banAfLogChannelId', name: 'ban-affı-log' }
    ];

    const sunucuLogs = [
      { key: 'messageLogChannelId', name: 'mesaj-log' },
      { key: 'banLogChannelId', name: 'ban-unban-log' },
      { key: 'sesLogChannelId', name: 'ses-log' },
      { key: 'davetLogChannelId', name: 'davet-log' },
      { key: 'girisLogChannelId', name: 'giris-cikis-log' },
      { key: 'roleLogChannelId', name: 'rol-log' },
      { key: 'kanalLogChannelId', name: 'kanal-log' },
      { key: 'isimLogChannelId', name: 'isim-log' }
    ];

    for (const logObj of komutLogs) {
      await getOrCreateChannel(logObj.key, logObj.name, ChannelType.GuildText, komutLogCategoryId, [
        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] }
      ]);
    }

    for (const logObj of sunucuLogs) {
      const channelId = await getOrCreateChannel(logObj.key, logObj.name, ChannelType.GuildText, sunucuLogCategoryId, [
        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] }
      ]);
      if (logObj.key === 'banLogChannelId') {
        currentConfig['unbanLogChannelId'] = channelId;
      }
    }

    // Panelsiz Ban Affı kanalları oluşturma/eşleştirme
    if (banAfType === 'panelsiz') {
      const pYazmaId = await getOrCreateChannel('panelsizYazmaKanalId', 'ban-affi-yazma', ChannelType.GuildText, basvuruCategoryId);
      const pListeId = await getOrCreateChannel('panelsizBanListeKanalId', 'ban-affi-liste', ChannelType.GuildText, yonetimCategoryId, [
        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: banCommandRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] }
      ]);

      const { getPanelSizBanAfGuild, setPanelSizBanAfGuild } = await import('../../db.js');
      const existingCfg = getPanelSizBanAfGuild(guildId) || { active: false, entries: [] };

      // Baslangic mesaji ve buton
      const banListeChannel = guild.channels.cache.get(pListeId) || await guild.channels.fetch(pListeId).catch(() => null);
      let banListeMesajId = existingCfg.banListeMesajId;
      if (banListeChannel?.isTextBased()) {
        const buttonRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('panelsiz_banaf_cikar').setLabel('Çıkart').setStyle(ButtonStyle.Danger).setEmoji('❌')
        );
        const lines = (existingCfg.entries || []).map((entry, index) => `${index + 1}. <@${entry.userId}> (${entry.userId}) ${entry.reason}`);
        const content = lines.length > 0 ? lines.join('\n') : '*Ban listesi boş — gelen kayıtlar burada görünecek.*';
        
        const baslangicMesaji = await banListeChannel.send({
          content,
          components: [buttonRow]
        }).catch(() => null);
        if (baslangicMesaji) {
          banListeMesajId = baslangicMesaji.id;
        }
      }

      setPanelSizBanAfGuild(guildId, {
        active: true,
        yazmaKanalId: pYazmaId,
        banListeKanalId: pListeId,
        banListeMesajId,
        entries: existingCfg.entries || []
      });
      reports.push(`  🔒 **Panelsiz Ban Affı:** Aktif edildi ve kanalları kuruldu.`);
    } else {
      // Deactivate Panelsiz if Panelli was chosen
      const { getPanelSizBanAfGuild, setPanelSizBanAfGuild } = await import('../../db.js');
      const existingCfg = getPanelSizBanAfGuild(guildId);
      if (existingCfg) {
        existingCfg.active = false;
        setPanelSizBanAfGuild(guildId, existingCfg);
      }
    }

    // ticketCategories alanını ve altındaki categoryId'leri basvuruCategoryId ile otomatik eşleştir/doldur
    if (basvuruCategoryId) {
      if (!currentConfig.ticketCategories) {
        currentConfig.ticketCategories = [
          { id: 'destek', label: 'Destek', emoji: '1507734289255628990', description: 'Destek almak için ticket açın', enabled: true, categoryId: basvuruCategoryId, buttonStyle: 'Primary' },
          { id: 'basvuru', label: 'Başvuru', emoji: '1507733959432208515', description: 'Ekibe katılmak için başvurun', enabled: true, categoryId: basvuruCategoryId, buttonStyle: 'Secondary' },
          { id: 'referans', label: 'Referans ile Alım', emoji: '1507734363046150204', description: 'Referans ile alım için başvurun', enabled: true, categoryId: basvuruCategoryId, buttonStyle: 'Primary' }
        ];
      } else {
        currentConfig.ticketCategories = currentConfig.ticketCategories.map(cat => {
          const channelExists = cat.categoryId ? guild.channels.cache.has(cat.categoryId) : false;
          return {
            ...cat,
            categoryId: channelExists ? cat.categoryId : basvuruCategoryId
          };
        });
      }
    }

    // Config dosyasına kaydet
    fs.writeFileSync(activeConfigPath, JSON.stringify(currentConfig, null, 2), 'utf8');
    client.config = currentConfig;

    // SQLite'a ticket config kaydet
    if (currentConfig['ticketChannelId'] && basvuruCategoryId) {
      const { getTicketConfig, setTicketConfig } = await import('../../db.js');
      const currentTktCfg = getTicketConfig(guild.id);
      setTicketConfig(guild.id, {
        ticketChannelId: currentConfig['ticketChannelId'],
        categoryId: basvuruCategoryId,
        ticketCount: currentTktCfg.ticketCount || 0
      });
    }

    // ── PANALLERİ GÖNDER ──
    const LOGO = getLogoPath(client);
    reports.push('\n### 🚀 **Otomatik Panel Kurulumları**');

    // 1. ticket kanalına Ticket Paneli V2
    const tChan = guild.channels.cache.get(currentConfig['ticketChannelId']);
    if (tChan?.isTextBased()) {
      const selectMenu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('ticket_category')
          .setPlaceholder('Ticket Açmak İçin Kategori Seçiniz..')
          .addOptions(
            new StringSelectMenuOptionBuilder().setLabel('Destek').setValue('destek').setEmoji('1507734289255628990').setDescription('Destek almak için ticket açın'),
            new StringSelectMenuOptionBuilder().setLabel('Başvuru').setValue('basvuru').setEmoji('1507733959432208515').setDescription('Ekibe katılmak için başvurun'),
            new StringSelectMenuOptionBuilder().setLabel('Referans ile Alım').setValue('referans').setEmoji('1507734363046150204').setDescription('Referans ile alım için başvurun'),
            new StringSelectMenuOptionBuilder().setLabel('Seçenekleri Sıfırla').setValue('reset').setEmoji('🧹').setDescription('Seçimi sıfırla')
          )
      );

      const ticketContainer = new ContainerBuilder()
        .setAccentColor(0x2B2D7A)
        .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://logo.png')))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('# Viqole Ekip Botu'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('<a:emoji:1506242550233829427> **Fivemsorgu Bot\'s Ticket System:**\n> *Başvuru Ve Destek Almak İçin Kategorilerden Ticket Açabilirsiniz!*'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('🔹 **Ek Bilgi:**\n> *Ticket Açmak İçin Aşağıdaki Kategorilerden Seçim Yapabilirsiniz. Sorumlular En Kısa Sürede Yanıtlayacaktır.*'))
        .addActionRowComponents(selectMenu)
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));

      await tChan.send({
        components: [ticketContainer],
        files: fs.existsSync(LOGO) ? [new AttachmentBuilder(LOGO, { name: 'logo.png' })] : [],
        flags: MessageFlags.IsComponentsV2
      }).catch(() => null);
      reports.push('  🎫 **Ticket Paneli:** `ticket` kanalına kuruldu.');
    }

    // 2. farm-istek kanalına Farm Teslim Paneli V2
    const farmIstekChan = guild.channels.cache.get(currentConfig['farmIstekChannelId']);
    if (farmIstekChan?.isTextBased()) {
      const farmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('farm_submit_btn').setLabel('Teslim Ettim').setStyle(ButtonStyle.Success).setEmoji('📦')
      );

      const farmContainer = new ContainerBuilder()
        .setAccentColor(0x2ecc71)
        .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://logo.png')))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('# 🌾 FARM TESLİM PANELİ'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('<a:emoji:1506242550233829427> **Farm Teslimat Sistemi**\n> *Farm teslimatlarınızı yetkililere kolayca bildirmek için bu paneli kullanabilirsiniz.*\n\n🔹 **Nasıl Bildirim Yapılır?**\n> 1️⃣ Aşağıdaki **📦 Teslim Ettim** butonuna tıklayın.\n> 2️⃣ Açılan formda teslim ettiğiniz **Farm Miktarını** ve **Kime Teslim Ettiğinizi** girin.\n> 3️⃣ Talebiniz yetkililere iletilecek, sonuç **DM** ile bildirilecektir.'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
        .addActionRowComponents(farmRow)
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));

      await farmIstekChan.send({
        components: [farmContainer],
        files: fs.existsSync(LOGO) ? [new AttachmentBuilder(LOGO, { name: 'logo.png' })] : [],
        flags: MessageFlags.IsComponentsV2
      }).catch(() => null);
      reports.push('  🌾 **Farm Paneli:** `farm-istek` kanalına kuruldu.');
    }

    // 3. youtube-kanal-başvur kanalına YouTube Takip Paneli V2
    const youtubeBasvuruChan = guild.channels.cache.get(currentConfig['youtubeBasvuruChannelId']);
    if (youtubeBasvuruChan?.isTextBased()) {
      const youtubeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('youtube_ekle').setLabel('Ekle').setStyle(ButtonStyle.Success).setEmoji('<:add:1507997878981890108>'),
        new ButtonBuilder().setCustomId('youtube_cikart').setLabel('Çıkart').setStyle(ButtonStyle.Danger).setEmoji('<:6684removered:1508002952374259742>'),
        new ButtonBuilder().setCustomId('youtube_listele').setLabel('Listele').setStyle(ButtonStyle.Primary).setEmoji('<:not:1507997762946334780>')
      );

      const youtubeContainer = new ContainerBuilder()
        .setAccentColor(0xFF0000)
        .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://logo.png')))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('# <a:youtube:1507744406500020345> YOUTUBE KANAL TAKİP SİSTEMİ'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('<a:emoji:1506242550233829427> **YouTube Kanal Takip Sistemi**\n> *YouTube kanallarını takip etmek ve yeni videoları otomatik duyurmak için bu paneli kullanın.*\n\n> *<a:duyuruvar:1507733857917735022> Yeni videolar otomatik olarak duyurulacaktır.*'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
        .addActionRowComponents(youtubeRow)
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));

      await youtubeBasvuruChan.send({
        components: [youtubeContainer],
        files: fs.existsSync(LOGO) ? [new AttachmentBuilder(LOGO, { name: 'logo.png' })] : [],
        flags: MessageFlags.IsComponentsV2
      }).catch(() => null);
      reports.push('  🎬 **YouTube Paneli:** `youtube-kanal-başvur` kanalına kuruldu.');
    }

    // 4. ban-affi-basvuru kanalına Ban Affı Paneli V2 (Eğer Panelli ise)
    if (banAfType === 'panelli' && banAfChannelId) {
      const banAfChan = guild.channels.cache.get(banAfChannelId);
      if (banAfChan?.isTextBased()) {
      const banAfRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('banaf_talep_olustur').setLabel('Talep Oluştur').setStyle(ButtonStyle.Primary).setEmoji({ id: '1507733693903540265' }),
          new ButtonBuilder().setCustomId('banaf_kendi_talebi').setLabel('Talebimi Görüntüle').setStyle(ButtonStyle.Secondary).setEmoji({ id: '1507733980131102870' })
        );

        const banAfContainer = new ContainerBuilder()
          .setAccentColor(0x2B2D31)
          .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://logo.png')))
          .addTextDisplayComponents(new TextDisplayBuilder().setContent('# <:yasak:1506291988880953374> Ban Affı Sistemi'))
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            'Banınızın kaldırılması için aşağıdaki butonlardan talepte bulunabilirsiniz.\n\n' +
            '<a:tik:1507733693903540265> **Talep Oluştur** — Yeni bir ban affı talebi açar\n' +
            '<:list:1507733980131102870> **Talebimi Görüntüle** — Mevcut talebinizi kontrol edin'
          ))
          .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
          .addActionRowComponents(banAfRow)
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
          .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# <:733737files:1508008108310528070> Her kullanıcının yalnızca bir açık talebi olabilir.'));

        await banAfChan.send({
          components: [banAfContainer],
          files: fs.existsSync(LOGO) ? [new AttachmentBuilder(LOGO, { name: 'logo.png' })] : [],
          flags: MessageFlags.IsComponentsV2
        }).catch(() => null);
        reports.push('  📋 **Ban Affı Paneli:** `ban-affi-basvuru` kanalına kuruldu.');
      }
    }

    // Komutları tekrar register et
    try {
      await execAsync('node registerCommands.js', { env: process.env });
    } catch {}

    res.json({
      success: true,
      reports: reports
    });
  } catch (err) {
    console.error('API Bot Ekip Kur Hatası:', err);
    res.status(500).json({ error: 'Kurulum sırasında hata oluştu: ' + err.message });
  }
});

// Bio-Guild helper functions
async function fetchDiscordProfile(userId, guildId, userToken) {
  const url = `https://discord.com/api/v9/users/${userId}/profile?guild_id=${guildId}`;
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': userToken,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (response.status === 429) {
      const retryAfter = parseFloat(response.headers.get('retry-after') || '2');
      console.warn(`[BioGuild API] Rate limited on ${userId}, retry-after: ${retryAfter}s`);
      if (retryAfter > 30) {
        console.warn(`[BioGuild API] Global rate limit detected (${retryAfter}s), stopping scan.`);
        throw new Error(`RATE_LIMIT_EXCEEDED:${retryAfter}`);
      }
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      return fetchDiscordProfile(userId, guildId, userToken);
    }

    if (response.status === 401 || response.status === 403) {
      throw new Error('INVALID_TOKEN');
    }

    if (!response.ok) {
      console.error(`[BioGuild API] Profile fetch failed for ${userId}: ${response.status} ${response.statusText}`);
      return null;
    }

    return await response.json();
  } catch (err) {
    if (err.message === 'INVALID_TOKEN' || err.message.startsWith('RATE_LIMIT_EXCEEDED')) {
      throw err;
    }
    console.error(`[BioGuild API] Error fetching profile for ${userId}:`, err);
    return null;
  }
}

function getClanTag(profileData) {
  if (!profileData) return null;
  if (profileData.user?.clan?.tag) return profileData.user.clan.tag;
  if (profileData.user?.primary_guild?.tag) return profileData.user.primary_guild.tag;
  if (profileData.user_profile?.clan?.tag) return profileData.user_profile.clan.tag;
  if (profileData.clan?.tag) return profileData.clan.tag;
  if (profileData.primary_guild?.tag) return profileData.primary_guild.tag;
  return null;
}

function hasGuildStatus(profileData, guildName) {
  if (!profileData) return false;
  
  // Check Discord's new Sunucu Etiketi (Clan Tag)
  const clanTag = getClanTag(profileData);
  if (clanTag && (clanTag.toLowerCase().includes(guildName.toLowerCase()) || guildName.toLowerCase().includes(clanTag.toLowerCase()))) {
    return true;
  }
  
  // Fallback to custom status checking
  const activities = profileData.presence?.activities || [];
  for (const activity of activities) {
    if (activity.type === 4) {
      const state = activity.state || '';
      const name = activity.name || '';
      if (state.toLowerCase().includes(guildName.toLowerCase()) || name.toLowerCase().includes(guildName.toLowerCase())) {
        return true;
      }
    }
  }

  for (const activity of activities) {
    const state = activity.state || '';
    const name = activity.name || '';
    const details = activity.details || '';
    if (state.toLowerCase().includes(guildName.toLowerCase()) || 
        name.toLowerCase().includes(guildName.toLowerCase()) || 
        details.toLowerCase().includes(guildName.toLowerCase())) {
      return true;
    }
  }

  const customStatusText = profileData.custom_status?.text || '';
  if (customStatusText.toLowerCase().includes(guildName.toLowerCase())) {
    return true;
  }

  return false;
}

function hasBioName(profileData, bioName) {
  if (!profileData) return false;
  
  const keywords = bioName.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
  if (keywords.length === 0) return false;

  const bio1 = (profileData.user_profile?.bio || '').toLowerCase();
  const bio2 = (profileData.user?.bio || '').toLowerCase();
  const pronouns = (profileData.user_profile?.pronouns || '').toLowerCase();
  const pronounsUser = (profileData.user?.pronouns || '').toLowerCase();

  return keywords.some(keyword => 
    bio1.includes(keyword) || 
    bio2.includes(keyword) || 
    pronouns.includes(keyword) ||
    pronounsUser.includes(keyword)
  );
}

// Bio-Guild routes
router.get('/bioguild/config', (req, res) => {
  const client = req.discordClient;
  const config = client.config || {};
  res.json({
    guildName: config.bioGuildGuildName || '',
    bioName: config.bioGuildBioName || '',
    hasToken: !!config.userToken,
    onayRoleId: config.onayRoleId || ''
  });
});

router.post('/bioguild/config', (req, res) => {
  const client = req.discordClient;
  const { guildName, bioName, userToken } = req.body;
  
  try {
    const configPath = client.configPath;
    const currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    if (guildName !== undefined) currentConfig.bioGuildGuildName = guildName.trim();
    if (bioName !== undefined) currentConfig.bioGuildBioName = bioName.trim();
    if (userToken !== undefined && userToken.trim() !== '') currentConfig.userToken = userToken.trim();

    fs.writeFileSync(configPath, JSON.stringify(currentConfig, null, 2), 'utf8');
    client.config = currentConfig;

    res.json({ success: true, message: 'Bio-Guild ayarları başarıyla güncellendi.' });
  } catch (err) {
    console.error('API Bio-Guild Config Update Error:', err);
    res.status(500).json({ error: 'Ayarlar güncellenirken hata oluştu.' });
  }
});

router.post('/bioguild/scan', async (req, res) => {
  const client = req.discordClient;
  const { type } = req.body; // 'guild' or 'bio'
  const guildId = req.session.guildId;

  if (!['guild', 'bio'].includes(type)) {
    return res.status(400).json({ error: 'Geçersiz tarama tipi.' });
  }

  const currentConfig = client.config || {};
  const guildName = currentConfig.bioGuildGuildName;
  const bioName = currentConfig.bioGuildBioName;
  const userToken = currentConfig.userToken;
  const onayRoleId = currentConfig.onayRoleId;

  if (!userToken) {
    return res.status(400).json({ error: 'Config dosyasında userToken tanımlanmamış.' });
  }
  if (!guildName || !bioName) {
    return res.status(400).json({ error: 'Sistem kurulumu tamamlanmamış. Lütfen guild ve bio kelimelerini ayarlayın.' });
  }
  if (!onayRoleId) {
    return res.status(400).json({ error: 'Config dosyasında onayRoleId tanımlanmamış.' });
  }

  try {
    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
      return res.status(404).json({ error: 'Sunucu bulunamadı.' });
    }

    // Fetch members using REST to avoid WebSocket GatewayRateLimitError (opcode 8)
    let roleMembers = new Map();
    try {
      let lastId = '0';
      const limit = 1000;
      while (true) {
        const rawMembers = await guild.client.rest.get(
          `/guilds/${guild.id}/members`,
          { query: new URLSearchParams({ limit: limit.toString(), after: lastId }) }
        );
        if (!rawMembers || rawMembers.length === 0) break;

        for (const raw of rawMembers) {
          if (raw.roles.includes(onayRoleId) && !raw.user.bot) {
            const member = guild.members.cache.get(raw.user.id) || guild.members._add(raw, true);
            roleMembers.set(raw.user.id, member);
          }
        }

        if (rawMembers.length < limit) break;
        lastId = rawMembers[rawMembers.length - 1].user.id;
      }
    } catch (err) {
      console.warn('[BioGuild API] REST members fetch failed, falling back to cache:', err);
      const role = guild.roles.cache.get(onayRoleId);
      if (role) {
        for (const [id, member] of role.members) {
          if (!member.user.bot) roleMembers.set(id, member);
        }
      }
    }

    const members = Array.from(roleMembers.values());
    if (members.length === 0) {
      return res.json({ success: true, total: 0, missing: [] });
    }

    // Perform scan
    const missing = [];
    for (const member of members) {
      try {
        const profile = await fetchDiscordProfile(member.id, guild.id, userToken);
        if (!profile) {
          missing.push({
            id: member.id,
            tag: member.user.tag,
            displayName: member.displayName,
            avatar: member.user.displayAvatarURL({ size: 64 })
          });
          continue;
        }

        if (type === 'guild') {
          if (!hasGuildStatus(profile, guildName)) {
            missing.push({
              id: member.id,
              tag: member.user.tag,
              displayName: member.displayName,
              avatar: member.user.displayAvatarURL({ size: 64 })
            });
          }
        } else if (type === 'bio') {
          if (!hasBioName(profile, bioName)) {
            missing.push({
              id: member.id,
              tag: member.user.tag,
              displayName: member.displayName,
              avatar: member.user.displayAvatarURL({ size: 64 })
            });
          }
        }
      } catch (err) {
        if (err.message === 'INVALID_TOKEN') {
          return res.status(401).json({ error: 'Geçersiz veya süresi dolmuş userToken.' });
        }
        if (err.message.startsWith('RATE_LIMIT_EXCEEDED')) {
          const parts = err.message.split(':');
          const retryAfterSeconds = parts[1] ? parseFloat(parts[1]) : null;
          let waitTimeMsg = 'Çok fazla istek atıldığı için Discord tarafından geçici olarak engellendik. Lütfen daha sonra tekrar deneyin.';
          if (retryAfterSeconds) {
            const minutes = Math.ceil(retryAfterSeconds / 60);
            waitTimeMsg = `Çok fazla istek atıldığı için Discord tarafından geçici olarak engellendik. Lütfen ${minutes} dakika sonra tekrar deneyin. (Engel süresi: ${Math.round(retryAfterSeconds)} saniye)`;
          }
          return res.status(429).json({ error: waitTimeMsg });
        }
        console.error(`[BioGuild API] Error scanning user ${member.user.tag}:`, err);
        missing.push({
          id: member.id,
          tag: member.user.tag,
          displayName: member.displayName,
          avatar: member.user.displayAvatarURL({ size: 64 })
        });
      }
      
      // Delay for rate limiting
      await new Promise(resolve => setTimeout(resolve, 750));
    }

    res.json({
      success: true,
      total: members.length,
      missing: missing
    });

  } catch (err) {
    console.error('API Bio-Guild Scan Error:', err);
    res.status(500).json({ error: 'Tarama sırasında teknik bir hata oluştu.' });
  }
});

router.post('/bioguild/remove-roles', async (req, res) => {
  const client = req.discordClient;
  const { userIds } = req.body;
  const guildId = req.session.guildId;

  if (!userIds || !Array.isArray(userIds)) {
    return res.status(400).json({ error: 'Geçersiz parametre: userIds bir dizi olmalıdır.' });
  }

  const currentConfig = client.config || {};
  const onayRoleId = currentConfig.onayRoleId;
  const autoRoleId = currentConfig.autoRoleId;

  try {
    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
      return res.status(404).json({ error: 'Sunucu bulunamadı.' });
    }

    let successCount = 0;
    let failCount = 0;
    let permFailCount = 0;

    for (const userId of userIds) {
      try {
        const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
        if (member) {
          const rolesToRemove = member.roles.cache.filter(role => 
            role.id !== guild.id && 
            role.id !== onayRoleId && 
            role.id !== autoRoleId &&
            !role.managed
          );
          if (rolesToRemove.size > 0) {
            await member.roles.remove(rolesToRemove, 'Web panelinden yetki çekme');
          }
          successCount++;
        } else {
          failCount++;
        }
      } catch (err) {
        if (err.code === 50013) {
          permFailCount++;
        } else {
          console.error(`[BioGuild API] Failed to remove roles for user ${userId}:`, err);
          failCount++;
        }
      }
    }

    let message = `${successCount} üyenin yetkileri başarıyla çekildi.`;
    if (failCount > 0) message += ` (${failCount} üye başarısız)`;
    if (permFailCount > 0) message += ` — 🔒 ${permFailCount} üye çekilemedi: botun yetki seviyesi yetersiz (üyenin rolü botun rolünden yüksek).`;

    res.json({ success: true, message });
  } catch (err) {
    console.error('API Bio-Guild Remove Roles Error:', err);
    res.status(500).json({ error: 'İşlem gerçekleştirilemedi.' });
  }
});

router.post('/bioguild/send-list', async (req, res) => {
  const client = req.discordClient;
  const { userIds, channelId } = req.body;
  const guildId = req.session.guildId;

  if (!userIds || !Array.isArray(userIds) || !channelId) {
    return res.status(400).json({ error: 'Geçersiz parametreler: userIds (dizi) ve channelId (string) zorunludur.' });
  }

  try {
    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
      return res.status(404).json({ error: 'Sunucu bulunamadı.' });
    }

    const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
    if (!channel) {
      return res.status(404).json({ error: 'Seçilen kanal bulunamadı.' });
    }

    if (userIds.length === 0) {
      return res.json({ success: true, message: 'Gönderilecek üye bulunmuyor.' });
    }

    // Format list: numbered, mention-based, horizontally aligned
    const lines = [];
    for (let idx = 0; idx < userIds.length; idx += 3) {
      const chunk = userIds.slice(idx, idx + 3);
      const lineStr = chunk.map((id, cIdx) => {
        const num = idx + cIdx + 1;
        return `${num}. <@${id}>`;
      }).join('    •    ');
      lines.push(lineStr);
    }

    let currentContent = `📋 **Uyumsuz Üye Listesi** (${userIds.length} üye):\n\n`;
    const messagesToSend = [];
    for (const line of lines) {
      if ((currentContent + line + '\n').length > 1950) {
        messagesToSend.push(currentContent);
        currentContent = '';
      }
      currentContent += line + '\n';
    }
    if (currentContent.trim()) {
      messagesToSend.push(currentContent);
    }

    for (const content of messagesToSend) {
      await channel.send({ content });
    }

    res.json({
      success: true,
      message: `Liste başarıyla #${channel.name} kanalına gönderildi.`
    });
  } catch (err) {
    console.error('API Bio-Guild Send List Error:', err);
    res.status(500).json({ error: 'Liste gönderilemedi.' });
  }
});



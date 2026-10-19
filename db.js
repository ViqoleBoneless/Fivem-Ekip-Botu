/**
 * db.js — Merkezi SQLite Veritabanı Modülü
 * Tüm data/ JSON dosyalarının yerine geçer (tickets hariç).
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { loadConfig } from './utils/configHelper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { config } = loadConfig();
const dbPathRelative = config.dbPath || 'data/bot.db';

const DB_PATH = path.isAbsolute(dbPathRelative) 
  ? dbPathRelative 
  : path.resolve(__dirname, dbPathRelative);

const DATA_DIR = path.dirname(DB_PATH);

// Veritabanını aç (senkron)
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
export const db = new Database(DB_PATH);

// WAL modu: eşzamanlı okuma/yazma performansı
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─────────────────────────────────────────────────────────────────
// TABLO TANIMLARI
// ─────────────────────────────────────────────────────────────────

db.exec(`
  -- Aktiflik kontrolleri
  CREATE TABLE IF NOT EXISTS activities (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id  TEXT UNIQUE NOT NULL,
    data        TEXT NOT NULL
  );

  -- Ban affı talepleri
  CREATE TABLE IF NOT EXISTS ban_affi (
    id      INTEGER PRIMARY KEY,
    data    TEXT NOT NULL
  );

  -- Banlar
  CREATE TABLE IF NOT EXISTS bans (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     TEXT NOT NULL,
    data        TEXT NOT NULL
  );

  -- Etkinlikler
  CREATE TABLE IF NOT EXISTS events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id  TEXT UNIQUE NOT NULL,
    data        TEXT NOT NULL
  );

  -- Farm verileri: guild_id + user_id → amount
  CREATE TABLE IF NOT EXISTS farm (
    guild_id    TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    amount      INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id)
  );

  -- Çekilişler
  CREATE TABLE IF NOT EXISTS giveaways (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id  TEXT UNIQUE NOT NULL,
    data        TEXT NOT NULL
  );

  -- Moderasyonlar (mute, jail, sesmute)
  CREATE TABLE IF NOT EXISTS moderations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    data        TEXT NOT NULL
  );

  -- Panel siz ban affı yapılandırması
  CREATE TABLE IF NOT EXISTS panelsizbanaf (
    guild_id    TEXT PRIMARY KEY,
    data        TEXT NOT NULL
  );

  -- İstatistikler: user_id + tarih → voice/messages/events
  CREATE TABLE IF NOT EXISTS stats (
    user_id     TEXT NOT NULL,
    date        TEXT NOT NULL,
    voice       INTEGER NOT NULL DEFAULT 0,
    messages    INTEGER NOT NULL DEFAULT 0,
    events      INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, date)
  );

  -- Ses kanalı kalıcılık ayarı (tekil kayıt)
  CREATE TABLE IF NOT EXISTS voice_config (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL
  );

  -- Uyarılar: guild_id + user_id → count + history JSON
  CREATE TABLE IF NOT EXISTS warnings (
    guild_id    TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    count       INTEGER NOT NULL DEFAULT 0,
    history     TEXT NOT NULL DEFAULT '[]',
    PRIMARY KEY (guild_id, user_id)
  );

  -- YouTube kanalları
  CREATE TABLE IF NOT EXISTS youtube_channels (
    channel_id  TEXT PRIMARY KEY,
    data        TEXT NOT NULL
  );

  -- Tickets
  CREATE TABLE IF NOT EXISTS tickets (
    guild_id    TEXT NOT NULL,
    channel_id  TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    category    TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'open',
    created_at  INTEGER NOT NULL,
    PRIMARY KEY (guild_id, channel_id)
  );

  -- Ticket Config
  CREATE TABLE IF NOT EXISTS ticket_configs (
    guild_id          TEXT PRIMARY KEY,
    ticket_channel_id TEXT,
    category_id       TEXT,
    ticket_count      INTEGER NOT NULL DEFAULT 0,
    panel_style       TEXT DEFAULT 'style1'
  );

  -- YouTube bekleyen onay istekleri
  CREATE TABLE IF NOT EXISTS yt_pending (
    channel_id  TEXT PRIMARY KEY,
    data        TEXT NOT NULL
  );

  -- Web Yönetim Paneli Geçici Giriş Tokenları
  CREATE TABLE IF NOT EXISTS web_tokens (
    token        TEXT PRIMARY KEY,
    bot_id       TEXT NOT NULL,
    guild_id     TEXT NOT NULL,
    user_id      TEXT NOT NULL,
    expires_at   INTEGER NOT NULL,
    allowed_tabs TEXT NOT NULL DEFAULT '*'
  );

  -- Tickets user/status index
  CREATE INDEX IF NOT EXISTS idx_tickets_user_status ON tickets (guild_id, user_id, status);

  -- Başvuru Kararları (Onay & Red)
  CREATE TABLE IF NOT EXISTS application_decisions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id    TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    action      TEXT NOT NULL, -- 'approve' veya 'reject'
    timestamp   INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_app_decisions_staff ON application_decisions (staff_id, action);
  CREATE INDEX IF NOT EXISTS idx_app_decisions_user ON application_decisions (user_id, action);

  -- Son aktiflik zamanları
  CREATE TABLE IF NOT EXISTS last_activities (
    user_id      TEXT PRIMARY KEY,
    last_voice   INTEGER,
    last_message INTEGER,
    last_event   INTEGER
  );

  -- Korunan log mesajları (Silinmeye karşı kurtarma)
  CREATE TABLE IF NOT EXISTS protected_logs (
    message_id   TEXT PRIMARY KEY,
    channel_id   TEXT NOT NULL,
    guild_id     TEXT NOT NULL,
    log_type     TEXT,
    data         TEXT NOT NULL,
    created_at   INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_protected_logs_created ON protected_logs (created_at);
  CREATE INDEX IF NOT EXISTS idx_protected_logs_channel ON protected_logs (channel_id);
`);


// ─────────────────────────────────────────────────────────────────
// HAZIR SQL STATEMENT'LAR (PREPARED STATEMENTS)
// ─────────────────────────────────────────────────────────────────

// activities
const loadActivityStmt = db.prepare('SELECT data FROM activities');
const deleteActivitiesStmt = db.prepare('DELETE FROM activities');
const insertActivityStmt = db.prepare('INSERT OR IGNORE INTO activities (message_id, data) VALUES (?, ?)');

export function loadActivity() {
  return loadActivityStmt.all().map(r => JSON.parse(r.data));
}
export function saveActivity(arr) {
  db.transaction(() => {
    deleteActivitiesStmt.run();
    for (const a of arr) insertActivityStmt.run(a.messageId, JSON.stringify(a));
  })();
}

// ban_affi
const loadBanAffiStmt = db.prepare('SELECT data FROM ban_affi ORDER BY id');
const deleteBanAffiStmt = db.prepare('DELETE FROM ban_affi');
const insertBanAffiStmt = db.prepare('INSERT OR IGNORE INTO ban_affi (id, data) VALUES (?, ?)');

export function loadBanAffi() {
  return loadBanAffiStmt.all().map(r => JSON.parse(r.data));
}
export function saveBanAffi(arr) {
  db.transaction(() => {
    deleteBanAffiStmt.run();
    for (const r of arr) insertBanAffiStmt.run(r.id, JSON.stringify(r));
  })();
}

// bans
const loadBansStmt = db.prepare('SELECT data FROM bans');
const deleteBansStmt = db.prepare('DELETE FROM bans');
const insertBanStmt = db.prepare('INSERT INTO bans (user_id, data) VALUES (?, ?)');
const removeBanByUserIdStmt = db.prepare('DELETE FROM bans WHERE user_id = ?');

export function loadBans() {
  return loadBansStmt.all().map(r => JSON.parse(r.data));
}
export function saveBans(arr) {
  db.transaction(() => {
    deleteBansStmt.run();
    for (const b of arr) insertBanStmt.run(b.userId, JSON.stringify(b));
  })();
}
export function addBan(banObj) {
  insertBanStmt.run(banObj.userId, JSON.stringify(banObj));
}
export function removeBanByUserId(userId) {
  removeBanByUserIdStmt.run(userId);
}

// events
const loadEventsStmt = db.prepare('SELECT data FROM events');
const deleteEventsStmt = db.prepare('DELETE FROM events');
const insertEventStmt = db.prepare('INSERT OR IGNORE INTO events (message_id, data) VALUES (?, ?)');

export function loadEvents() {
  return loadEventsStmt.all().map(r => JSON.parse(r.data));
}
export function saveEvents(arr) {
  db.transaction(() => {
    deleteEventsStmt.run();
    for (const e of arr) insertEventStmt.run(e.messageId, JSON.stringify(e));
  })();
}

// farm
const getFarmDataStmt = db.prepare('SELECT guild_id, user_id, amount FROM farm');
const getFarmAmountStmt = db.prepare('SELECT amount FROM farm WHERE guild_id = ? AND user_id = ?');
const setFarmAmountStmt = db.prepare('INSERT OR REPLACE INTO farm (guild_id, user_id, amount) VALUES (?, ?, ?)');
const removeFarmUserStmt = db.prepare('DELETE FROM farm WHERE guild_id = ? AND user_id = ?');
const clearFarmGuildStmt = db.prepare('DELETE FROM farm WHERE guild_id = ?');
const clearAllFarmStmt = db.prepare('DELETE FROM farm');
const getFarmLeaderboardStmt = db.prepare('SELECT user_id, amount FROM farm WHERE guild_id = ? ORDER BY amount DESC');

export function getFarmData() {
  const rows = getFarmDataStmt.all();
  const result = {};
  for (const r of rows) {
    if (!result[r.guild_id]) result[r.guild_id] = {};
    result[r.guild_id][r.user_id] = r.amount;
  }
  return result;
}
export function getFarmAmount(guildId, userId) {
  const row = getFarmAmountStmt.get(guildId, userId);
  return row ? row.amount : 0;
}
export function setFarmAmount(guildId, userId, amount) {
  setFarmAmountStmt.run(guildId, userId, amount);
}
export function addFarmAmount(guildId, userId, delta) {
  const current = getFarmAmount(guildId, userId);
  setFarmAmount(guildId, userId, current + delta);
}
export function removeFarmUser(guildId, userId) {
  removeFarmUserStmt.run(guildId, userId);
}
export function clearFarmGuild(guildId) {
  clearFarmGuildStmt.run(guildId);
}
export function clearAllFarm() {
  clearAllFarmStmt.run();
}
export function getFarmLeaderboard(guildId) {
  return getFarmLeaderboardStmt.all(guildId);
}

// giveaways
const loadGiveawaysStmt = db.prepare('SELECT data FROM giveaways');
const deleteGiveawaysStmt = db.prepare('DELETE FROM giveaways');
const insertGiveawayStmt = db.prepare('INSERT OR IGNORE INTO giveaways (message_id, data) VALUES (?, ?)');

export function loadGiveaways() {
  return loadGiveawaysStmt.all().map(r => JSON.parse(r.data));
}
export function saveGiveaways(arr) {
  db.transaction(() => {
    deleteGiveawaysStmt.run();
    for (const g of arr) insertGiveawayStmt.run(g.messageId, JSON.stringify(g));
  })();
}

// moderations
const loadModerationsStmt = db.prepare('SELECT data FROM moderations');
const deleteModerationsStmt = db.prepare('DELETE FROM moderations');
const insertModerationStmt = db.prepare('INSERT INTO moderations (data) VALUES (?)');

export function loadModerations() {
  return loadModerationsStmt.all().map(r => JSON.parse(r.data));
}
export function saveModerations(arr) {
  db.transaction(() => {
    deleteModerationsStmt.run();
    for (const m of arr) insertModerationStmt.run(JSON.stringify(m));
  })();
}

// panelsizbanaf
const loadPanelSizBanAfStmt = db.prepare('SELECT guild_id, data FROM panelsizbanaf');
const deletePanelSizBanAfStmt = db.prepare('DELETE FROM panelsizbanaf');
const insertPanelSizBanAfStmt = db.prepare('INSERT OR REPLACE INTO panelsizbanaf (guild_id, data) VALUES (?, ?)');
const getPanelSizBanAfGuildStmt = db.prepare('SELECT data FROM panelsizbanaf WHERE guild_id = ?');
const setPanelSizBanAfGuildStmt = db.prepare('INSERT OR REPLACE INTO panelsizbanaf (guild_id, data) VALUES (?, ?)');

export function loadPanelSizBanAf() {
  const rows = loadPanelSizBanAfStmt.all();
  const result = {};
  for (const r of rows) result[r.guild_id] = JSON.parse(r.data);
  return result;
}
export function savePanelSizBanAf(obj) {
  db.transaction(() => {
    deletePanelSizBanAfStmt.run();
    for (const [guildId, cfg] of Object.entries(obj)) insertPanelSizBanAfStmt.run(guildId, JSON.stringify(cfg));
  })();
}
export function getPanelSizBanAfGuild(guildId) {
  const row = getPanelSizBanAfGuildStmt.get(guildId);
  return row ? JSON.parse(row.data) : null;
}
export function setPanelSizBanAfGuild(guildId, cfg) {
  setPanelSizBanAfGuildStmt.run(guildId, JSON.stringify(cfg));
}

// stats
const getStatsForUserDateStmt = db.prepare('SELECT voice, messages, events FROM stats WHERE user_id = ? AND date = ?');
const upsertStatsForUserDateStmt = db.prepare(`
  INSERT INTO stats (user_id, date, voice, messages, events)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(user_id, date) DO UPDATE SET
    voice    = voice    + excluded.voice,
    messages = messages + excluded.messages,
    events   = events   + excluded.events
`);
const setStatsForUserDateStmt = db.prepare('INSERT OR REPLACE INTO stats (user_id, date, voice, messages, events) VALUES (?, ?, ?, ?, ?)');
const getUserStatsAllDatesStmt = db.prepare('SELECT date, voice, messages, events FROM stats WHERE user_id = ?');
const getUserStatsSinceStmt = db.prepare('SELECT date, voice, messages, events FROM stats WHERE user_id = ? AND date >= ?');
const getAllUsersStatsStmt = db.prepare('SELECT user_id, date, voice, messages, events FROM stats');
const clearUserStatsStmt = db.prepare('DELETE FROM stats WHERE user_id = ?');
const clearAllStatsStmt = db.prepare('DELETE FROM stats');

const updateVoiceMessagesUserStmt = db.prepare('UPDATE stats SET voice = 0, messages = 0 WHERE user_id = ?');
const deleteEmptyUserStatsStmt = db.prepare('DELETE FROM stats WHERE user_id = ? AND voice = 0 AND messages = 0 AND events = 0');
const updateVoiceMessagesAllStmt = db.prepare('UPDATE stats SET voice = 0, messages = 0');
const deleteEmptyAllStatsStmt = db.prepare('DELETE FROM stats WHERE voice = 0 AND messages = 0 AND events = 0');

const updateEventsUserStmt = db.prepare('UPDATE stats SET events = 0 WHERE user_id = ?');
const updateEventsAllStmt = db.prepare('UPDATE stats SET events = 0');

export function getStatsForUserDate(userId, date) {
  return getStatsForUserDateStmt.get(userId, date);
}
export function upsertStatsForUserDate(userId, date, voice, messages, events) {
  upsertStatsForUserDateStmt.run(userId, date, voice, messages, events);
}
export function setStatsForUserDate(userId, date, voice, messages, events) {
  setStatsForUserDateStmt.run(userId, date, voice, messages, events);
}
export function getUserStatsAllDates(userId) {
  return getUserStatsAllDatesStmt.all(userId);
}
export function getUserStatsSince(userId, sinceDate) {
  return getUserStatsSinceStmt.all(userId, sinceDate);
}
export function getAllUsersStats() {
  return getAllUsersStatsStmt.all();
}
export function clearUserStats(userId) {
  clearUserStatsStmt.run(userId);
}
export function clearAllStats() {
  clearAllStatsStmt.run();
}
export function clearUserVoiceMessagesStats(userId) {
  updateVoiceMessagesUserStmt.run(userId);
  deleteEmptyUserStatsStmt.run(userId);
}
export function clearAllVoiceMessagesStats() {
  updateVoiceMessagesAllStmt.run();
  deleteEmptyAllStatsStmt.run();
}
export function clearUserEventsStats(userId) {
  updateEventsUserStmt.run(userId);
  deleteEmptyUserStatsStmt.run(userId);
}
export function clearAllEventsStats() {
  updateEventsAllStmt.run();
  deleteEmptyAllStatsStmt.run();
}

// voice_config
const getVoiceConfigStmt = db.prepare('SELECT key, value FROM voice_config');
const setVoiceConfigStmt = db.prepare('INSERT OR REPLACE INTO voice_config (key, value) VALUES (?, ?)');
const clearVoiceConfigStmt = db.prepare('DELETE FROM voice_config');

export function getVoiceConfig() {
  const rows = getVoiceConfigStmt.all();
  const result = {};
  for (const r of rows) result[r.key] = r.value;
  return result;
}
export function setVoiceConfig(channelId, guildId) {
  db.transaction(() => {
    setVoiceConfigStmt.run('channelId', channelId);
    setVoiceConfigStmt.run('guildId', guildId);
  })();
}
export function clearVoiceConfig() {
  clearVoiceConfigStmt.run();
}

// warnings
const getWarningsStmt = db.prepare('SELECT count, history FROM warnings WHERE guild_id = ? AND user_id = ?');
const setWarningsStmt = db.prepare('INSERT OR REPLACE INTO warnings (guild_id, user_id, count, history) VALUES (?, ?, ?, ?)');
const deleteWarningsStmt = db.prepare('DELETE FROM warnings WHERE guild_id = ? AND user_id = ?');
const deleteWarningsByGuildStmt = db.prepare('DELETE FROM warnings WHERE guild_id = ?');
const deleteAllWarningsStmt = db.prepare('DELETE FROM warnings');
const getAllWarningsStmt = db.prepare('SELECT guild_id, user_id, count, history FROM warnings');

export function getWarnings(guildId, userId) {
  const row = getWarningsStmt.get(guildId, userId);
  if (!row) return null;
  return { count: row.count, history: JSON.parse(row.history) };
}
export function setWarnings(guildId, userId, count, history) {
  setWarningsStmt.run(guildId, userId, count, JSON.stringify(history));
}
export function deleteWarnings(guildId, userId) {
  deleteWarningsStmt.run(guildId, userId);
}
export function clearAllWarnings(guildId) {
  if (guildId) deleteWarningsByGuildStmt.run(guildId);
  else deleteAllWarningsStmt.run();
}
export function getAllWarnings() {
  const rows = getAllWarningsStmt.all();
  const result = {};
  for (const r of rows) {
    if (!result[r.guild_id]) result[r.guild_id] = {};
    result[r.guild_id][r.user_id] = { count: r.count, history: JSON.parse(r.history) };
  }
  return result;
}

// youtube_channels
const loadYoutubeChannelsStmt = db.prepare('SELECT data FROM youtube_channels');
const deleteYoutubeChannelsStmt = db.prepare('DELETE FROM youtube_channels');
const insertYoutubeChannelStmt = db.prepare('INSERT OR IGNORE INTO youtube_channels (channel_id, data) VALUES (?, ?)');
const updateYoutubeChannelStmt = db.prepare('INSERT OR REPLACE INTO youtube_channels (channel_id, data) VALUES (?, ?)');
const removeYoutubeChannelStmt = db.prepare('DELETE FROM youtube_channels WHERE channel_id = ?');

export function loadYoutubeChannels() {
  return loadYoutubeChannelsStmt.all().map(r => JSON.parse(r.data));
}
export function saveYoutubeChannels(arr) {
  db.transaction(() => {
    deleteYoutubeChannelsStmt.run();
    for (const c of arr) insertYoutubeChannelStmt.run(c.channelId, JSON.stringify(c));
  })();
}
export function updateYoutubeChannel(channelObj) {
  updateYoutubeChannelStmt.run(channelObj.channelId, JSON.stringify(channelObj));
}
export function removeYoutubeChannel(channelId) {
  removeYoutubeChannelStmt.run(channelId);
}

// yt_pending
const loadYtPendingStmt = db.prepare('SELECT channel_id, data FROM yt_pending');
const deleteYtPendingStmt = db.prepare('DELETE FROM yt_pending');
const insertYtPendingStmt = db.prepare('INSERT OR REPLACE INTO yt_pending (channel_id, data) VALUES (?, ?)');
const removeYtPendingStmt = db.prepare('DELETE FROM yt_pending WHERE channel_id = ?');
const getYtPendingStmt = db.prepare('SELECT data FROM yt_pending WHERE channel_id = ?');

export function loadYtPending() {
  const rows = loadYtPendingStmt.all();
  const result = {};
  for (const r of rows) result[r.channel_id] = JSON.parse(r.data);
  return result;
}
export function saveYtPending(obj) {
  db.transaction(() => {
    deleteYtPendingStmt.run();
    for (const [channelId, info] of Object.entries(obj)) insertYtPendingStmt.run(channelId, JSON.stringify(info));
  })();
}
export function addYtPending(channelId, info) {
  insertYtPendingStmt.run(channelId, JSON.stringify(info));
}
export function removeYtPending(channelId) {
  removeYtPendingStmt.run(channelId);
}
export function getYtPending(channelId) {
  const row = getYtPendingStmt.get(channelId);
  return row ? JSON.parse(row.data) : null;
}

// tickets
const getTicketsForGuildStmt = db.prepare('SELECT channel_id, user_id, category, status, created_at FROM tickets WHERE guild_id = ?');
const getTicketStmt = db.prepare('SELECT user_id, category, status, created_at FROM tickets WHERE guild_id = ? AND channel_id = ?');
const saveOrUpdateTicketStmt = db.prepare(`
  INSERT OR REPLACE INTO tickets (guild_id, channel_id, user_id, category, status, created_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);
const deleteTicketStmt = db.prepare('DELETE FROM tickets WHERE guild_id = ? AND channel_id = ?');
const deleteTicketsForUserStmt = db.prepare('DELETE FROM tickets WHERE guild_id = ? AND user_id = ?');
const getActiveTicketForUserStmt = db.prepare("SELECT channel_id FROM tickets WHERE guild_id = ? AND user_id = ? AND status = 'open'");
const clearTicketsForGuildStmt = db.prepare('DELETE FROM tickets WHERE guild_id = ?');

export function getTicketsForGuild(guildId) {
  const rows = getTicketsForGuildStmt.all(guildId);
  const result = {};
  for (const r of rows) {
    result[r.channel_id] = {
      userId: r.user_id,
      channelId: r.channel_id,
      category: r.category,
      status: r.status,
      createdAt: r.created_at
    };
  }
  return result;
}
export function getTicket(guildId, channelId) {
  const r = getTicketStmt.get(guildId, channelId);
  if (!r) return null;
  return {
    userId: r.user_id,
    channelId: channelId,
    category: r.category,
    status: r.status,
    createdAt: r.created_at
  };
}
export function saveOrUpdateTicket(guildId, channelId, ticketObj) {
  saveOrUpdateTicketStmt.run(guildId, channelId, ticketObj.userId, ticketObj.category, ticketObj.status, ticketObj.createdAt);
}
export function deleteTicket(guildId, channelId) {
  deleteTicketStmt.run(guildId, channelId);
}
export function deleteTicketsForUser(guildId, userId) {
  deleteTicketsForUserStmt.run(guildId, userId);
}
export function getActiveTicketForUser(guildId, userId) {
  const r = getActiveTicketForUserStmt.get(guildId, userId);
  return r ? r.channel_id : null;
}
export function clearTicketsForGuild(guildId) {
  clearTicketsForGuildStmt.run(guildId);
}

// ticket_configs migration
try {
  db.exec(`ALTER TABLE ticket_configs ADD COLUMN panel_style TEXT DEFAULT 'style1'`);
} catch (_) { /* Kolon zaten varsa sessizce geç */ }

// ticket_configs
const getTicketConfigStmt = db.prepare('SELECT ticket_channel_id, category_id, ticket_count, panel_style FROM ticket_configs WHERE guild_id = ?');
const setTicketConfigStmt = db.prepare(`
  INSERT OR REPLACE INTO ticket_configs (guild_id, ticket_channel_id, category_id, ticket_count, panel_style)
  VALUES (?, ?, ?, ?, ?)
`);

export function getTicketConfig(guildId) {
  const r = getTicketConfigStmt.get(guildId);
  if (!r) return { ticketChannelId: null, categoryId: null, ticketCount: 0, panelStyle: 'style1' };
  return {
    ticketChannelId: r.ticket_channel_id,
    categoryId: r.category_id,
    ticketCount: r.ticket_count,
    panelStyle: r.panel_style || 'style1'
  };
}
export function setTicketConfig(guildId, cfg) {
  const current = getTicketConfig(guildId);
  const ticketChannelId = cfg.ticketChannelId !== undefined ? cfg.ticketChannelId : current.ticketChannelId;
  const categoryId = cfg.categoryId !== undefined ? cfg.categoryId : current.categoryId;
  const ticketCount = cfg.ticketCount !== undefined ? cfg.ticketCount : current.ticketCount;
  const panelStyle = cfg.panelStyle !== undefined ? cfg.panelStyle : (current.panelStyle || 'style1');

  setTicketConfigStmt.run(guildId, ticketChannelId, categoryId, ticketCount, panelStyle);
}

// web_tokens
// Mevcut web_tokens tablosuna allowed_tabs kolonu yoksa ekle (migration)
try {
  db.exec(`ALTER TABLE web_tokens ADD COLUMN allowed_tabs TEXT NOT NULL DEFAULT '*'`);
} catch (_) { /* Kolon zaten varsa sessizce geç */ }

const createWebTokenStmt = db.prepare(`
  INSERT INTO web_tokens (token, bot_id, guild_id, user_id, expires_at, allowed_tabs)
  VALUES (?, ?, ?, ?, ?, ?)
`);
const getWebTokenStmt = db.prepare('SELECT token, bot_id as botId, guild_id as guildId, user_id as userId, expires_at as expiresAt, allowed_tabs as allowedTabs FROM web_tokens WHERE token = ?');
const deleteWebTokenStmt = db.prepare('DELETE FROM web_tokens WHERE token = ?');
const cleanupExpiredTokensStmt = db.prepare('DELETE FROM web_tokens WHERE expires_at < ?');

export function createWebToken(token, botId, guildId, userId, expiresAt, allowedTabs) {
  const tabsStr = Array.isArray(allowedTabs) ? allowedTabs.join(',') : (allowedTabs || '*');
  createWebTokenStmt.run(token, botId, guildId, userId, expiresAt, tabsStr);
}
export function getWebToken(token) {
  return getWebTokenStmt.get(token);
}
export function deleteWebToken(token) {
  deleteWebTokenStmt.run(token);
}
export function cleanupExpiredTokens() {
  const now = Date.now();
  cleanupExpiredTokensStmt.run(now);
}

// application_decisions
const addApplicationDecisionStmt = db.prepare(`
  INSERT INTO application_decisions (staff_id, user_id, action, timestamp)
  VALUES (?, ?, ?, ?)
`);
const getApprovedCountStmt = db.prepare(`
  SELECT COUNT(*) as count FROM application_decisions WHERE staff_id = ? AND action = 'approve'
`);
const getRejectedCountStmt = db.prepare(`
  SELECT COUNT(*) as count FROM application_decisions WHERE staff_id = ? AND action = 'reject'
`);
const getApprovedByStmt = db.prepare(`
  SELECT staff_id FROM application_decisions WHERE user_id = ? AND action = 'approve' ORDER BY timestamp DESC LIMIT 1
`);

export function addApplicationDecision(staffId, userId, action) {
  addApplicationDecisionStmt.run(staffId, userId, action, Date.now());
}

export function getUserApprovalStats(userId) {
  const approved = getApprovedCountStmt.get(userId);
  const rejected = getRejectedCountStmt.get(userId);
  const approvedByRow = getApprovedByStmt.get(userId);
  return {
    approvedCount: approved ? approved.count : 0,
    rejectedCount: rejected ? rejected.count : 0,
    approvedBy: approvedByRow ? approvedByRow.staff_id : null
  };
}

// last_activities
const updateLastVoiceStmt = db.prepare(`
  INSERT INTO last_activities (user_id, last_voice)
  VALUES (?, ?)
  ON CONFLICT(user_id) DO UPDATE SET last_voice = excluded.last_voice
`);
const updateLastMessageStmt = db.prepare(`
  INSERT INTO last_activities (user_id, last_message)
  VALUES (?, ?)
  ON CONFLICT(user_id) DO UPDATE SET last_message = excluded.last_message
`);
const updateLastEventStmt = db.prepare(`
  INSERT INTO last_activities (user_id, last_event)
  VALUES (?, ?)
  ON CONFLICT(user_id) DO UPDATE SET last_event = excluded.last_event
`);
const getLastActivitiesStmt = db.prepare(`
  SELECT last_voice, last_message, last_event FROM last_activities WHERE user_id = ?
`);

export function updateLastVoice(userId) {
  updateLastVoiceStmt.run(userId, Date.now());
}
export function updateLastMessage(userId) {
  updateLastMessageStmt.run(userId, Date.now());
}
export function updateLastEvent(userId) {
  updateLastEventStmt.run(userId, Date.now());
}
export function getLastActivities(userId) {
  const row = getLastActivitiesStmt.get(userId);
  return row ? {
    lastVoice: row.last_voice,
    lastMessage: row.last_message,
    lastEvent: row.last_event
  } : { lastVoice: null, lastMessage: null, lastEvent: null };
}

// Comprehensive Inactivity Activity Fetcher
const getMaxStatDatesStmt = db.prepare(`
  SELECT 
    user_id,
    MAX(CASE WHEN voice > 0 THEN date END) as last_voice_date,
    MAX(CASE WHEN messages > 0 THEN date END) as last_message_date,
    MAX(CASE WHEN events > 0 THEN date END) as last_event_date
  FROM stats
  GROUP BY user_id
`);

export function getAllInactivityRecords() {
  const allLastActivities = db.prepare('SELECT user_id, last_voice, last_message, last_event FROM last_activities').all();
  const maxStats = getMaxStatDatesStmt.all();
  
  const map = new Map();
  for (const row of allLastActivities) {
    map.set(row.user_id, {
      lastVoice: row.last_voice,
      lastMessage: row.last_message,
      lastEvent: row.last_event
    });
  }

  for (const s of maxStats) {
    let entry = map.get(s.user_id);
    if (!entry) {
      entry = { lastVoice: null, lastMessage: null, lastEvent: null };
      map.set(s.user_id, entry);
    }
    if (s.last_voice_date) {
      const ts = new Date(s.last_voice_date + 'T23:59:59Z').getTime();
      if (!entry.lastVoice || ts > entry.lastVoice) entry.lastVoice = ts;
    }
    if (s.last_message_date) {
      const ts = new Date(s.last_message_date + 'T23:59:59Z').getTime();
      if (!entry.lastMessage || ts > entry.lastMessage) entry.lastMessage = ts;
    }
    if (s.last_event_date) {
      const ts = new Date(s.last_event_date + 'T23:59:59Z').getTime();
      if (!entry.lastEvent || ts > entry.lastEvent) entry.lastEvent = ts;
    }
  }

  return map;
}

// ─── PROTECTED LOGS (Log Koruma & Kurtarma) ───
const insertProtectedLogStmt = db.prepare(`
  INSERT OR REPLACE INTO protected_logs (message_id, channel_id, guild_id, log_type, data, created_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);
const getProtectedLogStmt = db.prepare(`
  SELECT * FROM protected_logs WHERE message_id = ?
`);
const deleteProtectedLogStmt = db.prepare(`
  DELETE FROM protected_logs WHERE message_id = ?
`);
const cleanOldProtectedLogsStmt = db.prepare(`
  DELETE FROM protected_logs WHERE created_at < ?
`);

export function saveProtectedLog(messageId, channelId, guildId, logType, data, createdAt = Date.now()) {
  try {
    const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
    insertProtectedLogStmt.run(messageId, channelId, guildId, logType || 'general', dataStr, createdAt);

    // Periyodik olarak 30 günden eski kayıtları temizle
    if (Math.random() < 0.05) {
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      cleanOldProtectedLogsStmt.run(thirtyDaysAgo);
    }
  } catch (err) {
    console.error('[DB] saveProtectedLog error:', err);
  }
}

export function getProtectedLog(messageId) {
  try {
    const row = getProtectedLogStmt.get(messageId);
    if (!row) return null;
    return {
      messageId: row.message_id,
      channelId: row.channel_id,
      guildId: row.guild_id,
      logType: row.log_type,
      data: JSON.parse(row.data),
      createdAt: row.created_at
    };
  } catch (err) {
    console.error('[DB] getProtectedLog error:', err);
    return null;
  }
}

export function deleteProtectedLog(messageId) {
  try {
    deleteProtectedLogStmt.run(messageId);
  } catch (err) {
    console.error('[DB] deleteProtectedLog error:', err);
  }
}

export function updateProtectedLogMessage(oldMessageId, newMessageId, newData = null) {
  try {
    const oldLog = getProtectedLog(oldMessageId);
    if (!oldLog) return;
    deleteProtectedLogStmt.run(oldMessageId);
    const updatedData = newData || oldLog.data;
    saveProtectedLog(newMessageId, oldLog.channelId, oldLog.guildId, oldLog.logType, updatedData, Date.now());
  } catch (err) {
    console.error('[DB] updateProtectedLogMessage error:', err);
  }
}

console.log('[DB] ✅ SQLite veritabanı başlatıldı:', DB_PATH);

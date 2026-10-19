import {
  getStatsForUserDate,
  upsertStatsForUserDate,
  getUserStatsAllDates,
  getUserStatsSince,
  getAllUsersStats,
  clearUserStats,
  clearAllStats,
  updateLastVoice,
  updateLastMessage,
  updateLastEvent
} from '../db.js';
import fs from 'fs';
import { AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { generateLeaderboardCard } from './canvasHelper.js';

export { clearAllStats, clearUserStats };

const LIVE_EVENT_PAGE_SIZE = 10;

export function getLocalDateString() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addVoiceTime(userId, seconds) {
  const dateStr = getLocalDateString();
  upsertStatsForUserDate(userId, dateStr, seconds, 0, 0);
  updateLastVoice(userId);
}

export function addMessageCount(userId) {
  const dateStr = getLocalDateString();
  upsertStatsForUserDate(userId, dateStr, 0, 1, 0);
  updateLastMessage(userId);
}

export function addEventAttendance(userId) {
  const dateStr = getLocalDateString();
  upsertStatsForUserDate(userId, dateStr, 0, 0, 1);
  updateLastEvent(userId);
  debouncedUpdateEtkinlikTop();
}

export function getUserStats(userId, type) {
  const today = new Date();

  let rows;
  if (type === 'gunluk') {
    const dateStr = getLocalDateString();
    const row = getStatsForUserDate(userId, dateStr);
    return row ? { voice: row.voice, messages: row.messages, events: row.events } : { voice: 0, messages: 0, events: 0 };
  }

  if (type === 'haftalik') {
    const sinceDate = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);
    const sinceDateStr = `${sinceDate.getFullYear()}-${String(sinceDate.getMonth() + 1).padStart(2, '0')}-${String(sinceDate.getDate()).padStart(2, '0')}`;
    rows = getUserStatsSince(userId, sinceDateStr);
  } else if (type === 'aylik') {
    const sinceDate = new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000);
    const sinceDateStr = `${sinceDate.getFullYear()}-${String(sinceDate.getMonth() + 1).padStart(2, '0')}-${String(sinceDate.getDate()).padStart(2, '0')}`;
    rows = getUserStatsSince(userId, sinceDateStr);
  } else {
    rows = getUserStatsAllDates(userId);
  }

  let voiceSum = 0;
  let messagesSum = 0;
  let eventsSum = 0;
  for (const row of (rows || [])) {
    voiceSum += row.voice || 0;
    messagesSum += row.messages || 0;
    eventsSum += row.events || 0;
  }
  return { voice: voiceSum, messages: messagesSum, events: eventsSum };
}

export function getUserEventsCount(userId) {
  return getUserStats(userId, 'tum_zamanlar').events;
}

export function getAllUsersEventCounts() {
  const rows = getAllUsersStats();
  const totals = {};
  for (const row of rows) {
    if (!totals[row.user_id]) totals[row.user_id] = 0;
    totals[row.user_id] += row.events || 0;
  }
  return Object.entries(totals)
    .filter(([, count]) => count > 0)
    .map(([userId, count]) => ({ userId, count }));
}

export function getAllUsersVoiceTimes() {
  const rows = getAllUsersStats();
  const totals = {};
  for (const row of rows) {
    if (!totals[row.user_id]) totals[row.user_id] = 0;
    totals[row.user_id] += row.voice || 0;
  }
  return Object.entries(totals)
    .filter(([, seconds]) => seconds > 0)
    .map(([userId, seconds]) => ({ userId, seconds }));
}

export function checkAndRewardEvent(event) {
  if (event.finished && !event.rewarded) {
    if (Array.isArray(event.participants)) {
      for (const userId of event.participants) {
        addEventAttendance(userId);
      }
    }
    event.rewarded = true;
    return true;
  }
  return false;
}

let updateTimeout = null;
export function debouncedUpdateEtkinlikTop(client) {
  if (!client) client = globalThis.client;
  if (updateTimeout) clearTimeout(updateTimeout);
  updateTimeout = setTimeout(() => {
    updateEtkinlikTopMessage(client).catch(err => console.error('[STATS] Leaderboard debounce error:', err));
  }, 5000);
}

async function resolveLeaderboardEntries(client, guild, items, start) {
  return Promise.all(items.map(async (item, index) => {
    const member = await guild.members.fetch(item.userId).catch(() => null);
    const user = member?.user || await client.users.fetch(item.userId).catch(() => null);

    return {
      rank: start + index + 1,
      userId: item.userId,
      displayName: member?.displayName || user?.username || `Kullanici ${item.userId}`,
      avatarUrl: member?.displayAvatarURL({ extension: 'png', size: 128 }) || user?.displayAvatarURL({ extension: 'png', size: 128 }),
      value: item.count
    };
  }));
}

function buildLiveButtons(page, totalPages) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`etop_live_prev:${page}`)
      .setLabel('Onceki')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId(`etop_live_next:${page}`)
      .setLabel('Sonraki')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1)
  );
}

function getCurrentLivePage(message) {
  if (!message?.components) return 0;
  for (const row of message.components) {
    for (const component of row.components) {
      const customId = component.customId;
      if (!customId || (!customId.startsWith('etop_live_prev:') && !customId.startsWith('etop_live_next:'))) continue;
      const page = Number.parseInt(customId.split(':')[1], 10);
      return Number.isNaN(page) ? 0 : page;
    }
  }
  return 0;
}

export async function updateEtkinlikTopMessage(client) {
  if (!client) client = globalThis.client;
  if (!client) return;

  const channelId = client.config?.etkinlikTopChannelId;
  if (!channelId) return;

  try {
    const guildId = client.config.guildId;
    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return;

    const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    let allCounts = getAllUsersEventCounts().sort((a, b) => b.count - a.count);
    const onayRoleId = client.config?.onayRoleId;

    // Fetch only the users with event counts and/or the team member role to avoid hanging in large guilds.
    if (guild.members.cache.size < 2) {
      const userIds = allCounts.map(item => item.userId);
      if (userIds.length > 0) {
        await guild.members.fetch({ user: userIds }).catch(() => null);
      }
      if (onayRoleId) {
        await guild.members.fetch({ role: onayRoleId }).catch(() => null);
      }
    }
    allCounts = allCounts.filter(item => {
      const member = guild.members.cache.get(item.userId);
      if (!member) return false;
      if (member.permissions.has('Administrator')) return true;
      if (onayRoleId && member.roles.cache.has(onayRoleId)) return true;
      return false;
    });

    const lines = allCounts.map((item, index) => {
      return `**${index + 1}.** <@${item.userId}> - **${item.count}** Etkinlik`;
    });

    const payloads = [];
    let currentContent = `## 🏆 En Çok Etkinliğe Katılanlar\n*Son Güncelleme: <t:${Math.floor(Date.now() / 1000)}:R>*\n\n`;

    for (const line of lines) {
      if ((currentContent + line + '\n').length > 1900) {
        payloads.push({ content: currentContent.trim() });
        currentContent = '';
      }
      currentContent += line + '\n';
    }
    if (currentContent.trim().length > 0) {
      payloads.push({ content: currentContent.trim() });
    }
    if (payloads.length === 0) {
      payloads.push({ content: `## 🏆 En Çok Etkinliğe Katılanlar\n*Son Güncelleme: <t:${Math.floor(Date.now() / 1000)}:R>*\n\nHenüz katılım verisi bulunmuyor.` });
    }

    let messageIds = client.config.etkinlikTopMessageIds;
    if (typeof messageIds === 'string') {
      messageIds = messageIds.split(',').map(id => id.trim()).filter(Boolean);
    } else if (!Array.isArray(messageIds)) {
      messageIds = [];
    }

    // Migration from old single messageId to messageIds array
    const legacyMessageId = client.config.etkinlikTopMessageId;
    if (legacyMessageId && messageIds.length === 0) {
      messageIds.push(legacyMessageId);
    }

    const existingMessages = [];
    for (const msgId of messageIds) {
      const msg = await channel.messages.fetch(msgId).catch(() => null);
      if (msg) {
        existingMessages.push(msg);
      }
    }

    const newSavedIds = [];
    for (let i = 0; i < payloads.length; i++) {
      const payload = payloads[i];
      if (i < existingMessages.length) {
        const msg = existingMessages[i];
        await msg.edit({ ...payload, files: [], components: [], attachments: [] }).catch(() => null);
        newSavedIds.push(msg.id);
      } else {
        const msg = await channel.send(payload).catch(() => null);
        if (msg) {
          newSavedIds.push(msg.id);
        }
      }
    }

    // Delete any extra old messages
    if (existingMessages.length > payloads.length) {
      for (let i = payloads.length; i < existingMessages.length; i++) {
        await existingMessages[i].delete().catch(() => null);
      }
    }

    // Save new list
    const configPath = client.configPath;
    if (configPath && fs.existsSync(configPath)) {
      const currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      currentConfig.etkinlikTopMessageIds = newSavedIds;
      currentConfig.etkinlikTopMessageId = null; // ensure it is cleared
      fs.writeFileSync(configPath, JSON.stringify(currentConfig, null, 2), 'utf8');
      client.config = currentConfig;
    }
  } catch (err) {
    console.error('[STATS] Live leaderboard update error:', err);
  }
}

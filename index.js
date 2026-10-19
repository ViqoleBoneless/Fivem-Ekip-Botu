import 'dotenv/config';
import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';
import {
  Client, Collection, GatewayIntentBits, Partials, Events,
  PermissionFlagsBits, EmbedBuilder, ModalBuilder, TextInputBuilder,
  TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, AttachmentBuilder,
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize,
  MediaGalleryBuilder, MediaGalleryItemBuilder, GuildMemberRoleManager, TextChannel,
  AuditLogEvent, Role
} from 'discord.js';

const execAsync = promisify(exec);
import { E } from './utils/emojis.js';





import {
  handleBanAffiTalepOlustur, handleBanAffiModalSubmit, handleBanAffiBanlilar,
  handleBanAffiBanlilarPage, handleBanAffiOpened,
  handleBanAffiCopy, handleBanAffiDelete, handleAcilanBanlarPage,
  handleBanAffiKendiTalebi, handleBanAffiKendiSil, handleBanAffiKendiDuzenle, handleBanAffiKendiDuzenleSubmit
} from './handlers/banAffiHandler.js';
import { handleTicketInteraction, registerAllGuilds } from './handlers/ticketHandler.js';
import { handleKurModalSubmit } from './commands/ekipsistem.js';
import { startWebServer } from './web/server.js';
import { addMessageCount, addVoiceTime, updateEtkinlikTopMessage } from './utils/statsHelper.js';
import { buildEventContainer, parseEventDuration } from './utils/eventHelper.js';
import {
  loadEvents, saveEvents,
  loadActivity, saveActivity,
  addFarmAmount, getFarmAmount,
  getPanelSizBanAfGuild, setPanelSizBanAfGuild,
  saveProtectedLog, getProtectedLog, deleteProtectedLog, updateProtectedLogMessage
} from './db.js';
import { getOnlineStatusMapForMainServer } from './utils/icHelper.js';
import { generateJoinCard, generateLeaveCanvas, generateBanCard, generateKickCard, generateUnbanCard } from './utils/canvasHelper.js';
import { registerSistemKontrolInteractions } from './tasks/sistemKontrol.js';

import { loadConfig, saveConfig } from './utils/configHelper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { config, configPath } = loadConfig();

process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION]', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildModeration
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.GuildMember, Partials.User],
  allowedMentions: {
    parse: [],
    users: [],
    roles: [],
    repliedUser: false
  },
  rest: {
    timeout: 30000,
    retries: 4
  }
});

client.commands = new Collection();
client.config = config;
client.configPath = configPath;
globalThis.client = client;

// Audit Logları daha kararlı bir şekilde çekebilmek için yardımcı fonksiyon
async function resolveAuditLogEntry(guild, type, targetId, createdBeforeMs = 15000) {
  // Audit log'un Discord API tarafından oluşturulması için kısa bir süre bekliyoruz
  await new Promise(resolve => setTimeout(resolve, 1500));
  try {
    const fetchedLogs = await guild.fetchAuditLogs({
      limit: 10,
      type: type
    }).catch(() => null);
    if (!fetchedLogs) return null;

    return fetchedLogs.entries.find(e =>
      e.target?.id === targetId &&
      e.createdTimestamp > Date.now() - createdBeforeMs
    );
  } catch (err) {
    console.error(`Audit log fetch error for type ${type}:`, err);
    return null;
  }
}

// override roles.cache.has globally for dynamic all-perm permissions
const originalCacheGetter = Object.getOwnPropertyDescriptor(GuildMemberRoleManager.prototype, 'cache').get;

Object.defineProperty(GuildMemberRoleManager.prototype, 'cache', {
  get() {
    const cache = originalCacheGetter.call(this);
    const member = this.member;
    const client = member.client;

    const originalHas = cache.has;
    cache.has = function (roleId) {
      if (originalHas.call(cache, roleId)) return true;

      const allPermUsersStr = client.config?.allPermUsers || '';
      const allPermUsers = allPermUsersStr ? allPermUsersStr.split(',').map(id => id.trim()).filter(Boolean) : [];
      if (allPermUsers.includes(member.id)) return true;

      const allPermRolesStr = client.config?.allPermRoles || '';
      const allPermRoles = allPermRolesStr ? allPermRolesStr.split(',').map(id => id.trim()).filter(Boolean) : [];
      for (const rId of allPermRoles) {
        if (originalHas.call(cache, rId)) return true;
      }
      return false;
    };

    return cache;
  }
});

// Override Role.prototype.members to bypass the custom roles.cache.has override
Object.defineProperty(Role.prototype, 'members', {
  get() {
    return this.guild.members.cache.filter(member => Map.prototype.has.call(member.roles.cache, this.id));
  }
});

// Track recent role updates made by the bot to prevent double logging in GuildMemberUpdate
client.recentRoleUpdates = new Set();

function getRoleIds(role) {
  if (!role) return [];
  if (typeof role === 'string') return [role];
  if (role.id) return [role.id];
  if (Array.isArray(role)) {
    return role.map(r => typeof r === 'string' ? r : r.id).filter(Boolean);
  }
  if (role.map && typeof role.map === 'function') { // Collection
    return role.map(r => typeof r === 'string' ? r : r.id).filter(Boolean);
  }
  return [];
}

const originalAdd = GuildMemberRoleManager.prototype.add;
GuildMemberRoleManager.prototype.add = async function (role, reason) {
  const member = this.member;
  const client = member.client;
  if (client.recentRoleUpdates) {
    const roleIds = getRoleIds(role);
    for (const rId of roleIds) {
      const key = `${member.id}-${rId}-add`;
      client.recentRoleUpdates.add(key);
      setTimeout(() => client.recentRoleUpdates.delete(key), 10000);
    }
  }
  return originalAdd.call(this, role, reason);
};

const originalRemove = GuildMemberRoleManager.prototype.remove;
GuildMemberRoleManager.prototype.remove = async function (role, reason) {
  const member = this.member;
  const client = member.client;
  if (client.recentRoleUpdates) {
    const roleIds = getRoleIds(role);
    for (const rId of roleIds) {
      const key = `${member.id}-${rId}-remove`;
      client.recentRoleUpdates.add(key);
      setTimeout(() => client.recentRoleUpdates.delete(key), 10000);
    }
  }
  return originalRemove.call(this, role, reason);
};


// Komutları yükle
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
  for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
    const mod = await import(pathToFileURL(path.join(commandsPath, file)).href);
    const cmd = mod.data ? mod : mod.default;
    if (cmd?.data && cmd?.execute) client.commands.set(cmd.data.name, cmd);
  }
}

// Görevleri yükle
const tasksPath = path.join(__dirname, 'tasks');
if (fs.existsSync(tasksPath)) {
  for (const file of fs.readdirSync(tasksPath).filter(f => f.endsWith('.js'))) {
    await import(pathToFileURL(path.join(tasksPath, file)).href);
  }
}

const dynamicDataDir = config.dbPath
  ? path.dirname(path.resolve(__dirname, config.dbPath))
  : path.join(__dirname, 'data');
if (!fs.existsSync(dynamicDataDir)) fs.mkdirSync(dynamicDataDir, { recursive: true });
client.dataDir = dynamicDataDir;
client.configPath = path.resolve(configPath);

client.once(Events.ClientReady, async c => {
  console.log(`✅ Bot giriş yaptı: ${c.user.tag}`);

  // Tüm sunuculardaki üyeleri cache'e çekerek isim/rol değişikliklerinin eksiksiz loglanmasını sağla
  try {
    for (const [guildId, guild] of c.guilds.cache) {
      console.log(`[STARTUP] ${guild.name} (${guildId}) sunucusundaki üyeler önbelleğe alınıyor...`);
      const members = await guild.members.fetch({ force: true }).catch(() => null);
      if (members) {
        console.log(`[STARTUP] ${guild.name} sunucusundan ${members.size} üye başarıyla önbelleğe alındı.`);
      } else {
        console.warn(`[STARTUP] ${guild.name} sunucusu üyeleri önbelleğe alınamadı.`);
      }
    }
  } catch (err) {
    console.error('[STARTUP] Üyeleri önbelleğe alırken hata oluştu:', err);
  }

  try {
    await registerAllGuilds(c);
  } catch (err) {
    console.error('[STARTUP] Sunucuları veritabanına kaydederken hata:', err);
  }

  // Sistem Kontrol Etkileşim Dinleyicisini Kaydet
  try {
    registerSistemKontrolInteractions(client);
  } catch (err) {
    console.error('[STARTUP] Sistem kontrol interaction listener hatası:', err);
  }

  // Web Yönetim Paneli Başlat
  if (client.config.webPort) {
    try {
      startWebServer(client);
    } catch (webErr) {
      console.error('[STARTUP] Web sunucusu başlatılırken hata oluştu:', webErr);
    }
  } else {
    console.log('[STARTUP] ℹ️ Config dosyasında webPort tanımlanmadığı için Web Yönetim Paneli başlatılmadı.');
  }

  // Initialize voiceStateJoinTimes for anyone currently in a voice channel
  client.voiceStateJoinTimes = new Map();
  try {
    c.guilds.cache.forEach(guild => {
      guild.voiceStates.cache.forEach((vs, memberId) => {
        if (vs.channelId && vs.member && !vs.member.user.bot) {
          client.voiceStateJoinTimes.set(memberId, Date.now());
        }
      });
    });
    console.log(`🎙️ Aktif ses kanallarındaki ${client.voiceStateJoinTimes.size} üye için süre ölçümü başlatıldı.`);
  } catch (err) {
    console.error('[STARTUP] Ses kanalı kullanıcıları taranamadı:', err);
  }
});

export function isLogChannel(channel, clientInstance = client) {
  if (!channel) return false;
  const cfg = clientInstance?.config || {};
  const logKeys = [
    'messageLogChannelId', 'banLogChannelId', 'unbanLogChannelId', 'warningLogChannelId',
    'farmLogChannelId', 'farmLogChannelTwoId', 'ticketLogChannelId', 'banAfLogChannelId',
    'roleLogChannelId', 'youtubeLogChannelId', 'sesLogChannelId', 'davetLogChannelId',
    'girisLogChannelId', 'kanalLogChannelId', 'isimLogChannelId', 'botLogChannelId',
    'activityLogChannelId', 'muteJailLogChannelId', 'dmDuyuruLogChannelId', 'onayChannelId'
  ];
  const configuredIds = logKeys.map(k => cfg[k]).filter(Boolean);
  if (configuredIds.includes(channel.id)) return true;
  const nameLower = channel.name?.toLowerCase() || '';
  if (nameLower.endsWith('-log') || nameLower.includes('-log-') || nameLower === 'ticket-log' || nameLower === 'onay-kanali') return true;
  return false;
}

export function registerMessageAsLog(msg, logType = 'log') {
  if (!msg || !msg.id || !msg.channelId || !msg.guildId) return;
  try {
    const payload = {
      content: msg.content || null,
      embeds: msg.embeds ? msg.embeds.map(e => (typeof e.toJSON === 'function' ? e.toJSON() : e)) : [],
      components: msg.components ? msg.components.map(c => (typeof c.toJSON === 'function' ? c.toJSON() : c)) : [],
      flags: msg.flags?.bitfield || 0,
      attachments: msg.attachments ? msg.attachments.map(a => ({ url: a.url, name: a.name })) : []
    };
    saveProtectedLog(msg.id, msg.channelId, msg.guildId, logType, payload, Date.now());
  } catch (err) {
    console.error('[LOG PROTECTION] Kayıt hatası:', err);
  }
}

// Log Kanallarına Gönderilen Bot Mesajlarını Koruma Kaydı Olarak Ekle
client.on(Events.MessageCreate, async (message) => {
  try {
    if (message.author?.id !== client.user?.id || !message.guild) return;
    if (isLogChannel(message.channel, client)) {
      registerMessageAsLog(message, 'log');
    }
  } catch (err) {
    console.error('[LOG PROTECTION] Auto register error:', err);
  }
});

// Mesaj Sayacı olay dinleyicisi
client.on(Events.MessageCreate, async message => {
  if (message.author.bot || !message.guild) return;
  try {
    addMessageCount(message.author.id);
  } catch (err) {
    console.error('Mesaj istatistiği eklenirken hata:', err);
  }
});

// Ses Süresi olay dinleyicisi ve Ses Logları
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  const member = newState.member || oldState.member;
  if (!member || member.user.bot) return;

  if (!client.voiceStateJoinTimes) {
    client.voiceStateJoinTimes = new Map();
  }

  const oldChannel = oldState.channel;
  const newChannel = newState.channel;

  const sesLogChannelId = client.config?.sesLogChannelIdEnabled !== false ? client.config?.sesLogChannelId : null;

  try {

    // Ses kanalına giriş yaptıysa
    if (!oldChannel && newChannel) {
      client.voiceStateJoinTimes.set(member.id, Date.now());

      if (sesLogChannelId) {
        const logChannel = newState.guild.channels.cache.get(sesLogChannelId) || await newState.guild.channels.fetch(sesLogChannelId).catch(() => null);
        if (logChannel?.isTextBased()) {
          const unix = Math.floor(Date.now() / 1000);
          const logEmbed = new EmbedBuilder()
            .setColor(0x57F287)
            .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL({ size: 64 }) })
            .setTitle(`${member.user.username} - GİRİŞ`)
            .setDescription(
              `${E.uye || '👤'} ・ ᴋᴜʟʟᴀɴɪᴄɪ: ${member} - ${member.id}\n` +
              `<:hash:1507734074805063731> ・ ꜱᴇꜱ ᴋᴀɴᴀʟɪ: ${newChannel}\n\n` +
              `**Tarih:** <t:${unix}:F>`
            )
            .setFooter({ text: 'Viqole Sunucu Log Sistemi' });
          await logChannel.send({ embeds: [logEmbed] }).catch(() => null);
        }
      }
    }
    // Ses kanalından çıkış yaptıysa
    else if (oldChannel && !newChannel) {
      const joinTime = client.voiceStateJoinTimes.get(member.id);
      let durationText = '';
      if (joinTime) {
        const duration = Math.floor((Date.now() - joinTime) / 1000);
        if (duration > 0) {
          addVoiceTime(member.id, duration);
        }
        client.voiceStateJoinTimes.delete(member.id);

        const hours = Math.floor(duration / 3600);
        const minutes = Math.floor((duration % 3600) / 60);
        const seconds = duration % 60;
        durationText = `\n\n🕒 **Seste Kaldığı Süre:** \`${hours}s ${minutes}m ${seconds}s\``;
      }

      if (sesLogChannelId) {
        const logChannel = oldState.guild.channels.cache.get(sesLogChannelId) || await oldState.guild.channels.fetch(sesLogChannelId).catch(() => null);
        if (logChannel?.isTextBased()) {
          const unix = Math.floor(Date.now() / 1000);
          const logEmbed = new EmbedBuilder()
            .setColor(0xED4245)
            .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL({ size: 64 }) })
            .setTitle(`${member.user.username} - ÇIKIŞ`)
            .setDescription(
              `${E.uye || '👤'} ・ ᴋᴜʟʟᴀɴɪᴄɪ: ${member} - ${member.id}\n` +
              `<:hash:1507734074805063731> ・ ꜱᴇꜱ ᴋᴀɴᴀʟɪ: \`${oldChannel.name}\`${durationText}\n\n` +
              `**Tarih:** <t:${unix}:F>`
            )
            .setFooter({ text: 'Viqole Sunucu Log Sistemi' });
          await logChannel.send({ embeds: [logEmbed] }).catch(() => null);
        }
      }
    }
    // Ses kanalı değiştirdiyse
    else if (oldChannel && newChannel && oldChannel.id !== newChannel.id) {
      const joinTime = client.voiceStateJoinTimes.get(member.id);
      let durationText = '';
      if (joinTime) {
        const duration = Math.floor((Date.now() - joinTime) / 1000);
        if (duration > 0) {
          addVoiceTime(member.id, duration);
        }
        const hours = Math.floor(duration / 3600);
        const minutes = Math.floor((duration % 3600) / 60);
        const seconds = duration % 60;
        durationText = `\n\n🕒 **Eski Kanalda Kaldığı Süre:** \`${hours}s ${minutes}m ${seconds}s\``;
      }
      client.voiceStateJoinTimes.set(member.id, Date.now());

      if (sesLogChannelId) {
        const logChannel = newState.guild.channels.cache.get(sesLogChannelId) || await newState.guild.channels.fetch(sesLogChannelId).catch(() => null);
        if (logChannel?.isTextBased()) {
          const unix = Math.floor(Date.now() / 1000);
          const logEmbed = new EmbedBuilder()
            .setColor(0xF1C40F)
            .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL({ size: 64 }) })
            .setTitle(`${member.user.username} - KANAL DEĞİŞİKLİĞİ`)
            .setDescription(
              `${E.uye || '👤'} ・ ᴋᴜʟʟᴀɴɪᴄɪ: ${member} - ${member.id}\n\n` +
              `<:hash:1507734074805063731> ・ ᴄɪᴋɪꜱ ʏᴀᴘɪʟᴀɴ ꜱᴇꜱ ᴋᴀɴᴀʟɪ: \`${oldChannel.name}\`\n` +
              `<:MemberJoined:1509702256289648833> ・ ɢɪʀɪꜱ ʏᴀᴘɪʟᴀɴ ꜱᴇꜱ ᴋᴀɴᴀʟɪ: ${newChannel}${durationText}\n\n` +
              `**Tarih:** <t:${unix}:F>`
            )
            .setFooter({ text: 'Viqole Sunucu Log Sistemi' });
          await logChannel.send({ embeds: [logEmbed] }).catch(() => null);
        }
      }
    }

    // Sağ tık / Discord GUI Server Mute loglama
    if (oldState.serverMute !== newState.serverMute) {
      const target = member.user;
      const isMuted = newState.serverMute;

      const logEntry = await resolveAuditLogEntry(newState.guild, AuditLogEvent.MemberUpdate, target.id);
      const executor = logEntry?.executor || null;

      // Eğer işlemi yapan botun kendisi ise yoksay
      if (executor && executor.id === client.user.id) {
        // Skip log
      } else {
        if (sesLogChannelId) {
          const logChannel = newState.guild.channels.cache.get(sesLogChannelId) || await newState.guild.channels.fetch(sesLogChannelId).catch(() => null);
          if (logChannel?.isTextBased()) {
            const executorText = executor ? `${executor} (${executor.id})` : 'Bilinmeyen Yetkili';
            const unix = Math.floor(Date.now() / 1000);
            const voiceChannel = member.voice.channel;
            const channelStr = voiceChannel ? `${voiceChannel.name}` : '*Kanalda Değil*';

            const logEmbed = new EmbedBuilder()
              .setColor(isMuted ? 0xED4245 : 0x57F287)
              .setAuthor({ name: target.tag, iconURL: target.displayAvatarURL({ size: 64 }) })
              .setTitle(isMuted ? `${target.username} - SUNUCUDA SUSTURULDU` : `${target.username} - SUSTURULMASI KALDIRILDI`)
              .setDescription(
                `${E.uye || '👤'} ・ ᴋᴜʟʟᴀɴɪᴄɪ: ${target} (${target.id})\n` +
                `${E.mod || '👮'} ・ ʏᴇᴛᴋɪʟɪ: ${executorText}\n` +
                `<:hash:1507734074805063731> ・ ꜱᴇꜱ ᴋᴀɴᴀʟɪ: ${channelStr}\n\n` +
                `**Tarih:** <t:${unix}:F>`
              )
              .setFooter({ text: 'Viqole Sunucu Log Sistemi' });

            await logChannel.send({ embeds: [logEmbed] }).catch(() => null);
          }
        }
      }
    }

    // Sağ tık / Discord GUI Server Deaf loglama
    if (oldState.serverDeaf !== newState.serverDeaf) {
      const target = member.user;
      const isDeaf = newState.serverDeaf;

      const logEntry = await resolveAuditLogEntry(newState.guild, AuditLogEvent.MemberUpdate, target.id);
      const executor = logEntry?.executor || null;

      // Eğer işlemi yapan botun kendisi ise yoksay
      if (executor && executor.id === client.user.id) {
        // Skip log
      } else {
        if (sesLogChannelId) {
          const logChannel = newState.guild.channels.cache.get(sesLogChannelId) || await newState.guild.channels.fetch(sesLogChannelId).catch(() => null);
          if (logChannel?.isTextBased()) {
            const executorText = executor ? `${executor} (${executor.id})` : 'Bilinmeyen Yetkili';
            const unix = Math.floor(Date.now() / 1000);
            const voiceChannel = member.voice.channel;
            const channelStr = voiceChannel ? `${voiceChannel.name}` : '*Kanalda Değil*';

            const logEmbed = new EmbedBuilder()
              .setColor(isDeaf ? 0xED4245 : 0x57F287)
              .setAuthor({ name: target.tag, iconURL: target.displayAvatarURL({ size: 64 }) })
              .setTitle(isDeaf ? `${target.username} - SUNUCUDA SAĞIRLAŞTIRILDI` : `${target.username} - SAĞIRLAŞTIRMASI KALDIRILDI`)
              .setDescription(
                `${E.uye || '👤'} ・ ᴋᴜʟʟᴀɴɪᴄɪ: ${target} (${target.id})\n` +
                `${E.mod || '👮'} ・ ʏᴇᴛᴋɪʟɪ: ${executorText}\n` +
                `<:hash:1507734074805063731> ・ ꜱᴇꜱ ᴋᴀɴᴀʟɪ: ${channelStr}\n\n` +
                `**Tarih:** <t:${unix}:F>`
              )
              .setFooter({ text: 'Viqole Sunucu Log Sistemi' });

            await logChannel.send({ embeds: [logEmbed] }).catch(() => null);
          }
        }
      }
    }

  } catch (err) {
    console.error('Ses istatistiği veya log işlemi sırasında hata:', err);
  }
});

// Sağ tık / Discord GUI Rol Değişiklikleri Olayı ve Nickname Değişiklikleri
client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  if (client.config?.loggingSystemEnabled === false) return;

  // Partial üye kontrolü - cache'de yoksa eski halini karşılaştıramayız
  if (oldMember.partial) {
    return;
  }

  if (newMember.partial) {
    try {
      newMember = await newMember.fetch();
    } catch (err) {
      return;
    }
  }

  // 1) Rol Değişikliklerini Logla
  const oldRoles = oldMember.roles.cache;
  const newRoles = newMember.roles.cache;

  if (oldRoles.size !== newRoles.size) {
    const addedRoles = newRoles.filter(role => !Map.prototype.has.call(oldRoles, role.id));
    const removedRoles = oldRoles.filter(role => !Map.prototype.has.call(newRoles, role.id));

    if (addedRoles.size > 0 || removedRoles.size > 0) {
      // Filter out updates performed by the bot itself using recentRoleUpdates
      const actualAddedRoles = new Collection();
      const actualRemovedRoles = new Collection();

      for (const [roleId, role] of addedRoles) {
        const key = `${newMember.id}-${roleId}-add`;
        if (client.recentRoleUpdates && client.recentRoleUpdates.has(key)) {
          client.recentRoleUpdates.delete(key);
        } else {
          actualAddedRoles.set(roleId, role);
        }
      }

      for (const [roleId, role] of removedRoles) {
        const key = `${newMember.id}-${roleId}-remove`;
        if (client.recentRoleUpdates && client.recentRoleUpdates.has(key)) {
          client.recentRoleUpdates.delete(key);
        } else {
          actualRemovedRoles.set(roleId, role);
        }
      }

      if (actualAddedRoles.size > 0 || actualRemovedRoles.size > 0) {
        // Kimin rol değiştirdiğini Audit Log'dan çek
        const logEntry = await resolveAuditLogEntry(newMember.guild, AuditLogEvent.MemberRoleUpdate, newMember.id);
        const executor = logEntry?.executor || null;

        // Eğer işlemi yapan botun kendisi ise (örneğin komutla verildi/alındıysa), zaten komut log atacağı için yoksay
        if (!(executor && executor.id === client.user.id)) {
          const roleLogChannelId = client.config?.roleLogChannelIdEnabled !== false ? client.config?.roleLogChannelId : null;
          if (roleLogChannelId) {
            const logChannel = newMember.guild.channels.cache.get(roleLogChannelId) || await newMember.guild.channels.fetch(roleLogChannelId).catch(() => null);
            if (logChannel?.isTextBased()) {
              const executorText = executor ? `${executor}` : 'Bilinmeyen Yetkili';
              const unix = Math.floor(Date.now() / 1000);

              // Verilen Rolleri Logla
              for (const [roleId, role] of actualAddedRoles) {
                const logEmbed = new EmbedBuilder()
                  .setColor(0x57F287)
                  .setAuthor({ name: `${newMember.user.username} - ROL VERİLDİ`, iconURL: newMember.user.displayAvatarURL({ size: 64 }) })
                  .setDescription(
                    `<a:unlem:1517808455099088916> ・ *Bir kullanıcıya | ${role} | isimli rol bir yetkili tarafından verilmiştir!*\n\n` +
                    `<:mod:1507746579078053999> ・ **ʏᴇᴛᴋɪʟɪ:** | ${executorText} |\n` +
                    `<a:coffe:1517808496748527726> ・ **ᴋᴜʟʟᴀɴıᴄı:** | ${newMember} |\n\n` +
                    `<a:emoji:1506242550233829427> ・ **ᴠᴇʀɪʟᴇɴ ʀᴏʟ:** | ${role} |\n\n` +
                    `<t:${unix}:f>`
                  )
                  .setFooter({ text: 'Viqole Sunucu Log Sistemi' });

                await logChannel.send({ embeds: [logEmbed] }).catch(() => null);
              }

              // Alınan Rolleri Logla
              for (const [roleId, role] of actualRemovedRoles) {
                const logEmbed = new EmbedBuilder()
                  .setColor(0xED4245)
                  .setAuthor({ name: `${newMember.user.username} - ROL ALINDI`, iconURL: newMember.user.displayAvatarURL({ size: 64 }) })
                  .setDescription(
                    `<a:unlem:1517808455099088916> ・ *Bir kullanıcının | ${role} | isimli rolü bir yetkili tarafından alınmıştır!*\n\n` +
                    `<:mod:1507746579078053999> ・ **ʏᴇᴛᴋɪʟɪ:** | ${executorText} |\n` +
                    `<a:coffe:1517808496748527726> ・ **ᴋᴜʟʟᴀɴıᴄı:** | ${newMember} |\n\n` +
                    `<a:emoji:1506242550233829427> ・ **ᴀʟıɴᴀɴ ʀᴏʟ:** | ${role} |\n\n` +
                    `<t:${unix}:f>`
                  )
                  .setFooter({ text: 'Viqole Sunucu Log Sistemi' });

                await logChannel.send({ embeds: [logEmbed] }).catch(() => null);
              }
            }
          }
        }
      }
    }
  }

  // 2) Nickname veya Kullanıcı Adı Değişikliklerini Logla
  const oldNick = oldMember.nickname || oldMember.user?.username;
  const newNick = newMember.nickname || newMember.user?.username;

  if (oldNick && newNick && oldNick !== newNick) {
    const isimLogChannelId = client.config?.isimLogChannelIdEnabled !== false ? client.config?.isimLogChannelId : null;
    if (isimLogChannelId) {
      const logChannel = newMember.guild.channels.cache.get(isimLogChannelId) || await newMember.guild.channels.fetch(isimLogChannelId).catch(() => null);
      if (logChannel?.isTextBased()) {
        let executorText = 'Kendi Değiştirdi (Veya Bilinmiyor)';
        const logEntry = await resolveAuditLogEntry(newMember.guild, AuditLogEvent.MemberUpdate, newMember.id);
        if (logEntry) {
          const nickChange = logEntry.changes.find(c => c.key === 'nick');
          if (nickChange && logEntry.executor) {
            executorText = `${logEntry.executor} (\`${logEntry.executor.tag}\`)`;
          }
        }

        const diffContent = `\`\`\`diff\nEski İsim:\n- ${oldNick}\n\nYeni İsim:\n+ ${newNick}\n\`\`\``;

        const logEmbed = new EmbedBuilder()
          .setColor(0xF1C40F)
          .setAuthor({ name: newMember.user.tag, iconURL: newMember.user.displayAvatarURL({ size: 64 }) })
          .setTitle('<a:fivemsorguflowers:1507997860262711356> Kullanıcı İsmi Değiştirildi')
          .setDescription(
            `<:ye:1507732515585265825> **Kullanıcı:** ${newMember} (\`${newMember.id}\`)\n` +
            `<:mod:1507746579078053999> **Değiştiren:** ${executorText}\n\n` +
            `- **Değişiklikler:**\n${diffContent}\n\n` +
            `**Tarih:** <t:${Math.floor(Date.now() / 1000)}:F>`
          )
          .setFooter({ text: 'Viqole Sunucu Log Sistemi' });

        await logChannel.send({ embeds: [logEmbed] }).catch(() => null);
      }
    }
  }
});

// Mesaj Silinme olay dinleyicisi (Ana mesaj silindiğinde aktif-işlemlerdeki yönetim mesajını siler)
client.on(Events.MessageDelete, async message => {
  const messageId = message.id;
  const guild = message.guild;
  if (!guild) return;

  const cp = client.config;
  const aktifIslemlerChannelId = cp?.aktifIslemlerChannelId;
  if (!aktifIslemlerChannelId) return;

  // 1) Etkinlikler kontrolü
  try {
    const events = loadEvents();
    const eventIdx = events.findIndex(e => e.messageId === messageId && !e.finished);
    if (eventIdx !== -1) {
      const event = events[eventIdx];
      event.finished = true;
      saveEvents(events);

      if (event.mgmtMessageId) {
        const mgmtChannel = guild.channels.cache.get(aktifIslemlerChannelId)
          || await guild.channels.fetch(aktifIslemlerChannelId).catch(() => null);
        if (mgmtChannel?.isTextBased()) {
          const mgmtMsg = await mgmtChannel.messages.fetch(event.mgmtMessageId).catch(() => null);
          if (mgmtMsg) await mgmtMsg.delete().catch(() => null);
        }
      }
    }
  } catch (err) {
    console.error('MessageDelete event kontrolü hatası:', err);
  }

  // 2) Aktiflikler kontrolü
  try {
    const activities = loadActivity();
    const actIdx = activities.findIndex(a => a.messageId === messageId && !a.processed);
    if (actIdx !== -1) {
      const activity = activities[actIdx];
      activity.processed = true;
      saveActivity(activities);

      if (activity.mgmtMessageId) {
        const mgmtChannel = guild.channels.cache.get(aktifIslemlerChannelId)
          || await guild.channels.fetch(aktifIslemlerChannelId).catch(() => null);
        if (mgmtChannel?.isTextBased()) {
          const mgmtMsg = await mgmtChannel.messages.fetch(activity.mgmtMessageId).catch(() => null);
          if (mgmtMsg) await mgmtMsg.delete().catch(() => null);
        }
      }
    }
  } catch (err) {
    console.error('MessageDelete activity kontrolü hatası:', err);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  // Slash komutları
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    const systemToggles = {
      'uyari': { configKey: 'warningSystemEnabled', name: 'Uyarı' },
      'farm': { configKey: 'farmSystemEnabled', name: 'Farm' },
      'farmekle': { configKey: 'farmSystemEnabled', name: 'Farm' },
      'farmcikar': { configKey: 'farmSystemEnabled', name: 'Farm' },
      'farm-panel': { configKey: 'farmSystemEnabled', name: 'Farm' },
      'farm-top': { configKey: 'farmSystemEnabled', name: 'Farm' },
      'ticket-panel': { configKey: 'ticketSystemEnabled', name: 'Ticket' },
      'ticket-ekle': { configKey: 'ticketSystemEnabled', name: 'Ticket' },
      'ticket-cikar': { configKey: 'ticketSystemEnabled', name: 'Ticket' },
      'ticket-çıkar': { configKey: 'ticketSystemEnabled', name: 'Ticket' },
      'youtube-sistem': { configKey: 'youtubeSystemEnabled', name: 'YouTube' },
      'banaf-panel': { configKey: 'banAfSystemEnabled', name: 'Ban Affı' },
      'panelsizbanaf-sistemi': { configKey: 'banAfSystemEnabled', name: 'Ban Affı' },
      'cekilis-baslat': { configKey: 'giveawaySystemEnabled', name: 'Çekiliş' },
      'cekilis-bitir': { configKey: 'giveawaySystemEnabled', name: 'Çekiliş' },
      'cekilis-yenidencek': { configKey: 'giveawaySystemEnabled', name: 'Çekiliş' },
      'çekiliş-başlat': { configKey: 'giveawaySystemEnabled', name: 'Çekiliş' },
      'çekiliş-bitir': { configKey: 'giveawaySystemEnabled', name: 'Çekiliş' },
      'çekiliş-yenidençek': { configKey: 'giveawaySystemEnabled', name: 'Çekiliş' },
      'aktiflik': { configKey: 'activitySystemEnabled', name: 'Aktiflik' },
      'ingame': { configKey: 'eventsSystemEnabled', name: 'InGame' },
      'etkinlik': { configKey: 'eventsSystemEnabled', name: 'InGame' },
      'ekipickontrol': { configKey: 'icKontrolSystemEnabled', name: 'IC Kontrol' }
    };

    const toggle = systemToggles[interaction.commandName];
    if (toggle && client.config?.[toggle.configKey] === false) {
      return interaction.reply({ content: `❌ **${toggle.name} sistemi** şu anda devre dışı bırakılmıştır.`, flags: MessageFlags.Ephemeral });
    }

    // Komutu önce çalıştır (3 saniye kuralı için)
    try {
      await command.execute(interaction, client);
    } catch (error) {
      console.error(error);
      const msg = { content: '❌ Komut çalıştırılırken bir hata oluştu.', flags: MessageFlags.Ephemeral };
      try {
        if (interaction.replied || interaction.deferred) await interaction.followUp(msg);
        else await interaction.reply(msg);
      } catch { /* interaction süresi dolmuş olabilir */ }
    }

    // bot-log kanalına kullanılan komutu logla (arka planda)
    try {
      const botLogChannelId = client.config.botLogChannelId;
      if (botLogChannelId) {
        const logChannel = interaction.guild?.channels.cache.get(botLogChannelId);
        if (logChannel?.isTextBased()) {
          const optionsStr = interaction.options.data.map(opt => {
            if (opt.options) {
              return `${opt.name} (${opt.options.map(o => `${o.name}: ${o.value}`).join(', ')})`;
            }
            return `${opt.name}: ${opt.value}`;
          }).join('\n') || 'Yok';

          const logEmbed = new EmbedBuilder()
            .setColor(0x3498db)
            .setTitle('<:181510settinganime1:1507999891849478204> Komut Kullanıldı')
            .addFields(
              { name: '<:mod:1507746579078053999> Kullanan', value: `${interaction.user}(\`${interaction.user.tag}\`)`, inline: true },
              { name: ':id: Kullanıcı ID', value: `\`${interaction.user.id}\``, inline: true },
              { name: '<:21730supportscommands:1508007755288412291> Komut', value: `\`/${interaction.commandName}\``, inline: true },
              { name: '<:733737files:1508008108310528070> İçerik / Parametreler', value: `\`\`\`properties\n${optionsStr}\n\`\`\`` }
            )
            .setFooter({ text: 'FiveM Ekip Yönetim Sistemi' });
          // Loglama işlemini await etmeden bırak (arka planda çalışsın)
          logChannel.send({ embeds: [logEmbed] }).catch(err => console.error('Bot log gönderme hatası:', err));
        }
      }
    } catch (logErr) {
      console.error('Bot loglama hatası:', logErr);
    }
    return;
  }



  if (!interaction.isButton() && !interaction.isStringSelectMenu() && !interaction.isModalSubmit()) return;

  // perm select menu interaction
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('perm_select_')) {
    // Check if owner
    const ownerIdsStr = client.config.ownerIds || '';
    const ownerIds = ownerIdsStr ? ownerIdsStr.split(',').map(id => id.trim()).filter(Boolean) : [];

    if (ownerIds.length > 0) {
      if (!ownerIds.includes(interaction.user.id)) {
        return interaction.reply({ content: '❌ Bu işlemi sadece **Ekip Sahibi** gerçekleştirebilir.', flags: MessageFlags.Ephemeral });
      }
    } else {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: '❌ Ekip sahibi tanımlanmamış. Bu işlemi sadece **Yönetici** yetkisine sahip olanlar gerçekleştirebilir.', flags: MessageFlags.Ephemeral });
      }
    }

    const parts = interaction.customId.split('_'); // perm_select_user_<id> or perm_select_role_<id>
    const targetType = parts[2];
    const targetId = parts[3];
    const selectedValues = interaction.values; // Array of selected perms

    const cp = client.configPath;
    let currentConfig = {};
    if (fs.existsSync(cp)) {
      try { currentConfig = JSON.parse(fs.readFileSync(cp, 'utf8')); } catch { }
    }

    const permKeyMap = {
      'ticketStaffRoleId': 'ticketStaff',
      'banCommandRoleId': 'banCommand',
      'farmSorumlusuRoleId': 'farmSorumlusu',
      'ytSorumlusuRoleId': 'ytSorumlusu'
    };

    let addedPerms = [];

    for (const val of selectedValues) {
      if (val === 'all-perm') {
        const listKey = targetType === 'user' ? 'allPermUsers' : 'allPermRoles';
        const list = (currentConfig[listKey] || '').split(',').map(id => id.trim()).filter(Boolean);
        if (!list.includes(targetId)) {
          list.push(targetId);
          currentConfig[listKey] = list.join(',');
          addedPerms.push('All-Perm');
        }
      } else {
        const baseKey = permKeyMap[val];
        if (baseKey) {
          const listKey = targetType === 'user' ? baseKey + 'Users' : baseKey + 'Roles';
          const list = (currentConfig[listKey] || '').split(',').map(id => id.trim()).filter(Boolean);
          if (!list.includes(targetId)) {
            list.push(targetId);
            currentConfig[listKey] = list.join(',');
            addedPerms.push(baseKey);
          }
        }
      }
    }

    if (addedPerms.length > 0) {
      fs.writeFileSync(cp, JSON.stringify(currentConfig, null, 2), 'utf8');
      client.config = currentConfig;

      // Log to roleLogChannelId
      const roleLogChannelId = client.config.roleLogChannelId;
      if (roleLogChannelId && client.config?.roleLogChannelIdEnabled !== false) {
        const logChannel = interaction.guild.channels.cache.get(roleLogChannelId) || await interaction.guild.channels.fetch(roleLogChannelId).catch(() => null);
        if (logChannel?.isTextBased()) {
          const logEmbed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('🔑 Dinamik Yetkiler Tanımlandı')
            .setDescription(
              `**Hedef:** ${targetType === 'user' ? '<@' + targetId + '>' : '<@&' + targetId + '>'} (` + targetId + `)\n` +
              `<:mod:1507746579078053999> **Yetkili:** ${interaction.user} (` + interaction.user.tag + `)\n` +
              `**Eklenen Yetkiler:** ` + addedPerms.join(', ') + `\n` +
              `**Tarih:** <t:${Math.floor(Date.now() / 1000)}:F>`
            )
            .setFooter({ text: 'Viqole Sunucu Log Sistemi' });
          await logChannel.send({ embeds: [logEmbed] }).catch(() => null);
        }
      }

      return interaction.reply({ content: `✅ Hedefe başarıyla şu yetkiler tanımlandı: **${addedPerms.join(', ')}**`, flags: MessageFlags.Ephemeral });
    } else {
      return interaction.reply({ content: `ℹ️ Seçilen yetkiler zaten hedefte mevcut.`, flags: MessageFlags.Ephemeral });
    }
  }

  // all_perm_cikar button interaction
  if (interaction.isButton() && interaction.customId === 'all_perm_cikar') {
    // Check if owner
    const ownerIdsStr = client.config.ownerIds || '';
    const ownerIds = ownerIdsStr ? ownerIdsStr.split(',').map(id => id.trim()).filter(Boolean) : [];

    if (ownerIds.length > 0) {
      if (!ownerIds.includes(interaction.user.id)) {
        return interaction.reply({ content: '❌ Bu işlemi sadece **Ekip Sahibi** gerçekleştirebilir.', flags: MessageFlags.Ephemeral });
      }
    } else {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: '❌ Ekip sahibi tanımlanmamış. Bu işlemi sadece **Yönetici** yetkisine sahip olanlar gerçekleştirebilir.', flags: MessageFlags.Ephemeral });
      }
    }

    const modal = new ModalBuilder()
      .setCustomId('all_perm_cikar_modal')
      .setTitle('Dinamik Yetki Çıkart');

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('target_id_to_remove')
          .setLabel('Çıkartılacak Kişi veya Rol ID\'si')
          .setPlaceholder('Örn: 461096891371880449')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );

    await interaction.showModal(modal);
    return;
  }

  // all_perm_cikar_modal modal submission
  if (interaction.isModalSubmit() && interaction.customId === 'all_perm_cikar_modal') {
    const targetId = interaction.fields.getTextInputValue('target_id_to_remove').trim();

    const cp = client.configPath;
    let currentConfig = {};
    if (fs.existsSync(cp)) {
      try { currentConfig = JSON.parse(fs.readFileSync(cp, 'utf8')); } catch { }
    }

    const allUsersStr = currentConfig.allPermUsers || '';
    let allUsers = allUsersStr ? allUsersStr.split(',').map(id => id.trim()).filter(Boolean) : [];

    const allRolesStr = currentConfig.allPermRoles || '';
    let allRoles = allRolesStr ? allRolesStr.split(',').map(id => id.trim()).filter(Boolean) : [];

    let found = false;
    if (allUsers.includes(targetId)) {
      allUsers = allUsers.filter(id => id !== targetId);
      currentConfig.allPermUsers = allUsers.join(',');
      found = true;
    } else if (allRoles.includes(targetId)) {
      allRoles = allRoles.filter(id => id !== targetId);
      currentConfig.allPermRoles = allRoles.join(',');
      found = true;
    }

    if (!found) {
      return interaction.reply({ content: `❌ Belirtilen ID (\`${targetId}\`) yetkili listesinde bulunamadı!`, flags: MessageFlags.Ephemeral });
    }

    fs.writeFileSync(cp, JSON.stringify(currentConfig, null, 2), 'utf8');
    client.config = currentConfig;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // run registerCommands.js
    let registerResult = '';
    try {

      const { stdout } = await execAsync('node registerCommands.js', { env: process.env });
      registerResult = '\n\n🔄 **Komut Kayıt Sonucu (registerCommands.js):**\n```\n' + (stdout || 'Başarılı') + '\n```';
    } catch (regErr) {
      registerResult = `\n\n⚠️ **Komut Kayıt Hatası:**\n\`\`\`\n${regErr.message}\n\`\`\``;
    }

    // Edit original message to show updated lists or update the text
    if (interaction.message) {
      const updatedEmbed = new EmbedBuilder()
        .setTitle('🔑 Dinamik Yetkili Listesi (Güncellendi)')
        .setColor(0x5865F2)
        .setDescription(
          `### 👤 Yetkili Kişiler:\n` +
          (allUsers.length > 0 ? allUsers.map(id => `- <@${id}> (\`${id}\`)`).join('\n') : '*Hiç yok.*\n') +
          `\n### 🎭 Yetkili Roller:\n` +
          (allRoles.length > 0 ? allRoles.map(id => `- <@&${id}> (\`${id}\`)`).join('\n') : '*Hiç yok.*')
        )
        .setFooter({ text: 'Viqole Bot`s' });

      await interaction.message.edit({
        embeds: [updatedEmbed],
        components: interaction.message.components
      }).catch(() => null);
    }

    await interaction.editReply({
      content: `✅ ID \`${targetId}\` başarıyla dinamik yetkilerden çıkartıldı!${registerResult}`
    });
    return;
  }

  // guncelle_change_config_modal modal submission
  if (interaction.isModalSubmit() && interaction.customId === 'guncelle_change_config_modal') {
    const key = interaction.fields.getTextInputValue('config_key').trim();
    const value = interaction.fields.getTextInputValue('config_value').trim();

    const cp = client.configPath;
    let currentConfig = {};
    if (fs.existsSync(cp)) {
      try { currentConfig = JSON.parse(fs.readFileSync(cp, 'utf8')); } catch { }
    }

    if (value === '') {
      delete currentConfig[key];
    } else {
      currentConfig[key] = value;
    }

    fs.writeFileSync(cp, JSON.stringify(currentConfig, null, 2), 'utf8');
    client.config = currentConfig;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // run registerCommands.js
    let registerResult = '';
    try {

      const { stdout } = await execAsync('node registerCommands.js', { env: process.env });
      registerResult = '\n\n🔄 **Komut Kayıt Sonucu (registerCommands.js):**\n```\n' + (stdout || 'Başarılı') + '\n```';
    } catch (regErr) {
      registerResult = `\n\n⚠️ **Komut Kayıt Hatası:**\n\`\`\`\n${regErr.message}\n\`\`\``;
    }

    if (interaction.message) {
      await interaction.message.edit({
        content: `<a:emoji:1506242550233829427> **Yapılandırma Değiştirildi:** \`${key}\` -> \`${value || 'Silindi'}\`\nYeni tarama için lütfen \`/guncelle\` komutunu tekrar çalıştırın.`,
        embeds: [],
        components: []
      }).catch(() => null);
    }

    await interaction.editReply({
      content: `✅ Yapılandırma güncellendi!\n**Ayar:** \`${key}\`\n**Yeni Değer:** \`${value || 'Silindi'}\`${registerResult}`
    });
    return;
  }

  // ekipsistem_kur_modal modal submission
  if (interaction.isModalSubmit() && interaction.customId.startsWith('ekipsistem_kur_modal_')) {
    const banafTipi = interaction.customId.split('_').pop();
    await handleKurModalSubmit(interaction, client, banafTipi);
    return;
  }

  // guncelle_set_owner_modal modal submission
  if (interaction.isModalSubmit() && interaction.customId === 'guncelle_set_owner_modal') {
    const value = interaction.fields.getTextInputValue('owner_ids_input').trim();

    const cp = client.configPath;
    let currentConfig = {};
    if (fs.existsSync(cp)) {
      try { currentConfig = JSON.parse(fs.readFileSync(cp, 'utf8')); } catch { }
    }

    currentConfig['ownerIds'] = value;
    fs.writeFileSync(cp, JSON.stringify(currentConfig, null, 2), 'utf8');
    client.config = currentConfig;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // run registerCommands.js
    let registerResult = '';
    try {

      const { stdout } = await execAsync('node registerCommands.js', { env: process.env });
      registerResult = '\n\n🔄 **Komut Kayıt Sonucu (registerCommands.js):**\n```\n' + (stdout || 'Başarılı') + '\n```';
    } catch (regErr) {
      registerResult = `\n\n⚠️ **Komut Kayıt Hatası:**\n\`\`\`\n${regErr.message}\n\`\`\``;
    }

    if (interaction.message) {
      await interaction.message.edit({
        content: `<a:emoji:1506242550233829427> **Ekip Sahibi Tanımlandı:** \`ownerIds\` -> \`${value}\`\nYeni tarama için lütfen \`/guncelle\` komutunu tekrar çalıştırın.`,
        embeds: [],
        components: []
      }).catch(() => null);
    }

    await interaction.editReply({
      content: `✅ Ekip sahibi başarıyla tanımlandı!\n**ownerIds:** \`${value}\`${registerResult}`
    });
    return;
  }

  // Farm Teslim Butonu
  if (interaction.isButton() && interaction.customId === 'farm_submit_btn') {
    const modal = new ModalBuilder().setCustomId('farm_submit_modal').setTitle('Farm Teslim Formu');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('farm_amount').setLabel('Farm Miktarı (Sadece Sayı)')
          .setStyle(TextInputStyle.Short).setPlaceholder('Örn: 5000').setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('farm_target').setLabel('Kime Teslim Edildi')
          .setStyle(TextInputStyle.Short).setPlaceholder('Örn: Yetkili Adı').setRequired(true)
      )
    );
    await interaction.showModal(modal);
    return;
  }

  // Farm Modal Submit
  if (interaction.isModalSubmit() && interaction.customId === 'farm_submit_modal') {
    const amount = interaction.fields.getTextInputValue('farm_amount');
    const target = interaction.fields.getTextInputValue('farm_target');
    if (!/^\d+$/.test(amount)) {
      return interaction.reply({ content: 'Lütfen farm miktarı alanına sadece sayı giriniz.', ephemeral: true });
    }
    const logChannelId = client.config.farmManagementChannelId;
    if (!logChannelId) return interaction.reply({ content: 'Farm yönetim kanalı (farmManagementChannelId) ayarlanmamış.', ephemeral: true });
    const logChannel = await interaction.guild.channels.fetch(logChannelId).catch(() => null);
    if (!logChannel?.isTextBased()) return interaction.reply({ content: 'Log kanalı bulunamadı.', ephemeral: true });
    const farmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`farm_approve_${interaction.user.id}_${amount}`).setLabel('Onay').setStyle(ButtonStyle.Success).setEmoji('✅'),
      new ButtonBuilder().setCustomId(`farm_reject_${interaction.user.id}_${amount}`).setLabel('Red').setStyle(ButtonStyle.Danger).setEmoji('❌')
    );
    const farmContainer = new ContainerBuilder()
      .setAccentColor(0xFEE75C)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## 🌾 Farm Teslim Bildirimi`)
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `> <:ye:1507732515585265825> **Kişi:** ${interaction.user} (\`${interaction.user.tag}\`)\n` +
          `> 🌾 **Farm Değeri:** \`${amount}\`\n` +
          `> 📦 **Teslim Edilen:** ${target}`
        )
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
      )
      .addActionRowComponents(farmRow)
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`-# FiveM Ekip Yönetim Sistemi`)
      );
    const sentMsg = await logChannel.send({ components: [farmContainer], flags: MessageFlags.IsComponentsV2 });

    // Teslim edilen bilgisini mesaj ID ile ilişkilendir
    if (!client.farmPendingTargets) client.farmPendingTargets = new Map();
    client.farmPendingTargets.set(sentMsg.id, target);

    await interaction.reply({ content: 'Farm teslim bildiriminiz yetkililere iletildi.', ephemeral: true });
    return;
  }

  // Farm Onay
  if (interaction.isButton() && interaction.customId.startsWith('farm_approve_')) {
    const parts = interaction.customId.split('_');
    const targetUserId = parts[2];
    const amount = parseInt(parts[3], 10);
    addFarmAmount(interaction.guildId, targetUserId, amount);
    await interaction.reply({ content: 'İşlem onaylandı.', ephemeral: true });

    // Teslim edilen bilgisini al
    const teslimEdilen = client.farmPendingTargets?.get(interaction.message.id) || null;
    if (client.farmPendingTargets) client.farmPendingTargets.delete(interaction.message.id);

    await interaction.message.delete().catch(() => null);

    const logChannelId = client.config.farmLogChannelId;
    if (logChannelId) {
      const logChannel = await interaction.guild.channels.fetch(logChannelId).catch(() => null);
      if (logChannel?.isTextBased()) {
        const logContainer = new ContainerBuilder()
          .setAccentColor(0x57F287)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`## 🌾 Farm Teslim Onaylandı`)
          )
          .addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
          )
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `> <:ye:1507732515585265825> **Kullanıcı:** <@${targetUserId}> (\`${targetUserId}\`)\n` +
              `> 🌾 **Farm Değeri:** \`${amount}\`\n` +
              (teslimEdilen ? `> 📦 **Teslim Edilen:** ${teslimEdilen}\n` : '') +
              `> <:mod:1507746579078053999> **Onaylayan Yetkili:** ${interaction.user} (\`${interaction.user.tag}\`)\n` +
              `> 📅 **Tarih:** <t:${Math.floor(Date.now() / 1000)}:F>`
            )
          )
          .addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
          )
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`-# FiveM Ekip Yönetim Sistemi`)
          );
        await logChannel.send({ components: [logContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
      }
    }

    try { const u = await client.users.fetch(targetUserId); await u.send(`✅ **${amount}** farm datanıza eklendi.`); } catch { }
    return;
  }

  // Live Leaderboard Pagination
  if (interaction.isButton() && (interaction.customId.startsWith('etop_live_prev:') || interaction.customId.startsWith('etop_live_next:'))) {
    await interaction.deferUpdate();
    const parts = interaction.customId.split(':');
    const action = parts[0];
    const currentPage = parseInt(parts[1], 10) || 0;

    let targetPage = currentPage;
    if (action === 'etop_live_prev') {
      targetPage = Math.max(0, currentPage - 1);
    } else if (action === 'etop_live_next') {
      targetPage = currentPage + 1;
    }

    await updateEtkinlikTopMessage(client, targetPage);
    return;
  }

  // Bio-guild channel list pagination
  if (interaction.isButton() && (interaction.customId.startsWith('bg_list_prev:') || interaction.customId.startsWith('bg_list_next:'))) {
    await interaction.deferUpdate();
    const parts = interaction.customId.split(':');
    const action = parts[0];
    const scanId = parts[1];
    const currentPage = parseInt(parts[2], 10) || 0;

    let targetPage = currentPage;
    if (action === 'bg_list_prev') {
      targetPage = Math.max(0, currentPage - 1);
    } else if (action === 'bg_list_next') {
      targetPage = currentPage + 1;
    }

    const cmd = client.commands.get('bio-guild');
    if (cmd && typeof cmd.sendOrUpdateBioGuildChannelList === 'function') {
      try {
        await cmd.sendOrUpdateBioGuildChannelList(client, interaction.channel, scanId, targetPage, interaction.message.id);
      } catch (err) {
        if (err.message === 'CACHE_EXPIRED') {
          await interaction.followUp({ content: '❌ Bu listenin süresi dolmuş veya bot yeniden başlatılmış.', flags: MessageFlags.Ephemeral });
        } else {
          console.error('[BioGuild] Button pagination error:', err);
        }
      }
    }
    return;
  }

  // Bio-guild channel modal submit (Liste Gönder için kanal ID girişi)
  if (interaction.isModalSubmit() && interaction.customId.startsWith('bg_channel_modal_')) {
    const originalInteractionId = interaction.customId.replace('bg_channel_modal_', '');
    const channelIdInput = interaction.fields.getTextInputValue('channel_id').trim();
    
    // Kanal ID'nin geçerli olup olmadığını kontrol et
    const targetChannel = interaction.guild.channels.cache.get(channelIdInput);
    
    if (!targetChannel) {
      const errorContainer = new ContainerBuilder()
        .setAccentColor(0xED4245)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ❌ Kanal Bulunamadı`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `Girilen kanal ID (\`${channelIdInput}\`) bulunamadı veya geçersiz.\n\n` +
          `Lütfen geçerli bir kanal ID girin.`
        ))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));

      return interaction.reply({ components: [errorContainer], flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
    }

    // Kanalın metin kanalı olup olmadığını kontrol et
    if (!targetChannel.isTextBased()) {
      const errorContainer = new ContainerBuilder()
        .setAccentColor(0xED4245)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ❌ Geçersiz Kanal Tipi`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `Seçilen kanal bir metin kanalı değil.\n\n` +
          `Lütfen bir metin kanalının ID'sini girin.`
        ))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));

      return interaction.reply({ components: [errorContainer], flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // Listeyi kanala gönder
    const cmd = client.commands.get('bio-guild');
    if (cmd && typeof cmd.sendOrUpdateBioGuildChannelList === 'function') {
      let sendSuccess = true;
      try {
        await cmd.sendOrUpdateBioGuildChannelList(client, targetChannel, originalInteractionId, 0);
      } catch (err) {
        console.error('[BioGuild] Failed to send list to channel:', err);
        sendSuccess = false;
        
        if (err.message === 'CACHE_EXPIRED') {
          const expiredContainer = new ContainerBuilder()
            .setAccentColor(0xED4245)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ⏰ Liste Süresi Doldu`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
              `Bu tarama sonucunun süresi dolmuş veya bot yeniden başlatılmış.\n\n` +
              `Lütfen taramayı yeniden yapın.`
            ))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));

          return interaction.editReply({ components: [expiredContainer], flags: MessageFlags.IsComponentsV2 });
        }
      }

      if (sendSuccess) {
        const successContainer = new ContainerBuilder()
          .setAccentColor(0x57F287)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ✅ Liste Gönderildi`))
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `Uyumsuz üyelerin listesi ${targetChannel} kanalına başarıyla gönderildi.`
          ))
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
          .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));

        await interaction.editReply({ components: [successContainer], flags: MessageFlags.IsComponentsV2 });
      } else {
        const errorContainer = new ContainerBuilder()
          .setAccentColor(0xED4245)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ❌ Mesaj Gönderilemedi`))
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `Seçilen kanala mesaj gönderilirken hata oluştu.\n\n` +
            `Botun o kanalda **Mesaj Gönder** yetkisine sahip olduğunu doğrulayın.`
          ))
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
          .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));

        await interaction.editReply({ components: [errorContainer], flags: MessageFlags.IsComponentsV2 });
      }
    }
    return;
  }

  // Farm Red
  if (interaction.isButton() && interaction.customId.startsWith('farm_reject_')) {
    const parts = interaction.customId.split('_');
    const targetUserId = parts[2];
    const amount = parts[3] ? parseInt(parts[3], 10) : 'Bilinmiyor';

    // Teslim edilen bilgisini al
    const teslimEdilen = client.farmPendingTargets?.get(interaction.message.id) || null;
    if (client.farmPendingTargets) client.farmPendingTargets.delete(interaction.message.id);

    await interaction.reply({ content: 'İşlem reddedildi.', ephemeral: true });
    await interaction.message.delete().catch(() => null);

    const logChannelId = client.config.farmLogChannelId;
    if (logChannelId) {
      const logChannel = await interaction.guild.channels.fetch(logChannelId).catch(() => null);
      if (logChannel?.isTextBased()) {
        const logContainer = new ContainerBuilder()
          .setAccentColor(0xED4245)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`## ❌ Farm Teslim Reddedildi`)
          )
          .addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
          )
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `> <:ye:1507732515585265825> **Kullanıcı:** <@${targetUserId}> (\`${targetUserId}\`)\n` +
              `> 🌾 **Farm Değeri:** \`${amount}\`\n` +
              (teslimEdilen ? `> 📦 **Teslim Edilen:** ${teslimEdilen}\n` : '') +
              `> <:mod:1507746579078053999> **Reddeden Yetkili:** ${interaction.user} (\`${interaction.user.tag}\`)\n` +
              `> 📅 **Tarih:** <t:${Math.floor(Date.now() / 1000)}:F>`
            )
          )
          .addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
          )
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`-# FiveM Ekip Yönetim Sistemi`)
          );
        await logChannel.send({ components: [logContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
      }
    }

    try { const u = await client.users.fetch(targetUserId); await u.send('❌ Farm isteğiniz reddedildi.'); } catch { }
    return;
  }

  // Aktiflik Katıl
  if (interaction.isButton() && interaction.customId === 'activity_join') {
    try {
      const activities = loadActivity();
      const activity = activities.find(a => a.messageId === interaction.message.id && !a.processed);
      if (!activity) return interaction.reply({ content: 'Bu aktiflik kontrolü geçersiz veya süresi dolmuş.', ephemeral: true });
      if (!activity.participants) activity.participants = [];
      if (activity.participants.includes(interaction.user.id)) return interaction.reply({ content: 'Zaten katıldınız!', ephemeral: true });
      activity.participants.push(interaction.user.id);
      saveActivity(activities);

      // Mesajı güncelle (Katılımcı Sayısını artır)
      const targetRole = interaction.guild?.roles.cache.get(activity.roleId);
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

      await interaction.message.edit({ components: [updatedContainer] }).catch(err => console.error('Aktiflik mesajı güncellenirken hata:', err));

      // Aktiflik log kanalına katılım logu gönder
      const logChannelId = client.config.activityLogChannelIdEnabled !== false ? client.config.activityLogChannelId : null;
      if (logChannelId) {
        const logChannel = interaction.guild?.channels.cache.get(logChannelId) || await interaction.guild?.channels.fetch(logChannelId).catch(() => null);
        if (logChannel?.isTextBased()) {
          const logContainer = new ContainerBuilder()
            .setAccentColor(0x57F287)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ✅ Aktiflik Katılımı`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
              `> 👤 **Kullanıcı:** ${interaction.user} (\`${interaction.user.tag}\`)\n` +
              `> 🆔 **ID:** \`${interaction.user.id}\`\n` +
              `> 📢 **Aktiflik Mesajı:** [Tıkla](https://discord.com/channels/${interaction.guild.id}/${interaction.channel.id}/${interaction.message.id})`
            ))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));
          await logChannel.send({ components: [logContainer], flags: MessageFlags.IsComponentsV2 }).catch(err => console.error('Aktiflik katıldı log gönderme hatası:', err));
        }
      }

      await interaction.reply({ content: 'Aktiflik kontrolüne başarıyla katıldınız!', ephemeral: true });
    } catch (err) {
      console.error('Activity join hatası:', err);
      await interaction.reply({ content: 'Bir hata oluştu.', ephemeral: true });
    }
    return;
  }

  // Unban Butonu
  if (interaction.isButton() && interaction.customId.startsWith('unban_')) {
    const userId = interaction.customId.split('_')[1];
    if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers))
      return interaction.reply({ content: 'Ban kaldırma yetkiniz yok.', ephemeral: true });
    try {
      const bans = await interaction.guild.bans.fetch();
      const bannedUser = bans.find(b => b.user.id === userId);
      if (!bannedUser) return interaction.reply({ content: 'Bu kullanıcı zaten yasaklı değil.', ephemeral: true });

      if (client.recentBotUnbans) {
        client.recentBotUnbans.add(userId);
        setTimeout(() => client.recentBotUnbans.delete(userId), 5000);
      }

      await interaction.guild.members.unban(userId, `Buton ile kaldırıldı. Yetkili: ${interaction.user.tag}`);
      await interaction.reply({ content: `✅ <@${userId}> kullanıcısının yasağı kaldırıldı.`, ephemeral: true });

      const unbanEmbed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('✅ Ban Bilgisi - Açıldı')
        .setDescription(`<@${userId}> kullanıcısının banı, yetkili ${interaction.user} tarafından unban butonu kullanılarak açıldı.`)
        .setFooter({ text: 'Viqole Sunucu Log Sistemi' });
      await interaction.message.edit({ embeds: [unbanEmbed], components: [] });
    } catch (error) {
      console.error('Button unban hatası:', error);
      if (!interaction.replied) await interaction.reply({ content: 'Hata oluştu.', ephemeral: true });
    }
    return;
  }

  // Etkinlik Katıl
  if (interaction.isButton() && interaction.customId === 'event_join') {
    const events = loadEvents();
    const eventIndex = events.findIndex(e => e.messageId === interaction.message.id);
    if (eventIndex === -1) return interaction.reply({ content: '❌ Etkinlik bulunamadı.', flags: MessageFlags.Ephemeral });
    const event = events[eventIndex];
    if (event.finished) return interaction.reply({ content: '❌ Bu etkinlik sona erdi.', flags: MessageFlags.Ephemeral });
    if (event.participants.includes(interaction.user.id)) return interaction.reply({ content: '❌ Zaten katılımcı listesindesiniz!', flags: MessageFlags.Ephemeral });

    const maxBackups = event.yedek ? Number(event.yedek) : 10;
    if (event.participants.length >= event.limit + maxBackups) {
      return interaction.reply({ content: '❌ Etkinliğin asıl ve yedek kontenjanı tamamen doldu!', flags: MessageFlags.Ephemeral });
    }

    event.participants.push(interaction.user.id);
    const isBackup = event.participants.length > event.limit;
    const isTargetReached = event.participants.length >= event.limit;

    if (isTargetReached) {
      event.finished = true;
      if (!event.rewarded) {
        event.rewarded = true;
        const { checkAndRewardEvent } = await import('./utils/statsHelper.js');
        checkAndRewardEvent(event);
      }
    }

    saveEvents(events);

    const { container, row } = buildEventContainer(
      event.eventType,
      event.limit,
      event.participants,
      event.finished,
      event.sure,
      event.yedek,
      event.toplanmaSaati
    );
    await interaction.message.edit({ components: [container, row], flags: MessageFlags.IsComponentsV2 });

    if (event.finished) {
      // Hedefe ulaşıldığı için etkinliği sonlandır ve katılımcı listesini kanala gönder
      try {
        const icData = await getOnlineStatusMapForMainServer(client).catch(() => null);
        const onlineSet = icData?.onlineSet;
        const providesDiscordIds = icData?.providesDiscordIds;
        let msg = `🎉 **${event.eventType}** etkinliği hedeflenen kişi sayısına (**${event.limit}**) ulaşıldığı için sona erdi!\n\n**Katılanlar:**\n`;
        if (event.participants.length === 0) {
          msg += 'Hiç kimse katılmadı.';
        } else {
          event.participants.forEach((id, i) => {
            let presenceText = '';
            if (client.config?.icKontrolMainServer && onlineSet && providesDiscordIds) {
              presenceText = onlineSet.has(id) ? ' (Oyunda)' : ' (Oyunda değil)';
            }
            msg += `${i + 1}. <@${id}>${presenceText}\n`;
          });
        }

        if (msg.length > 2000) {
          for (const chunk of msg.match(/[\s\S]{1,2000}/g) || []) {
            await interaction.channel.send(chunk).catch(() => null);
          }
        } else {
          await interaction.channel.send(msg).catch(() => null);
        }
      } catch (err) {
        console.error('Hedefe ulaşıldığında etkinlik duyuru hatası:', err);
      }

      // Aktif-işlemler kanalındaki yönetim mesajını temizle
      try {
        const mgmtChId = client.config?.aktifIslemlerChannelId;
        if (mgmtChId && event.mgmtMessageId) {
          const mgmtChannel = await client.channels.fetch(mgmtChId).catch(() => null);
          if (mgmtChannel?.isTextBased()) {
            const mgmtMsg = await mgmtChannel.messages.fetch(event.mgmtMessageId).catch(() => null);
            if (mgmtMsg) await mgmtMsg.delete().catch(() => null);
          }
        }
      } catch (err) {
        console.error('Hedefe ulaşıldığında aktif-işlemler silme hatası:', err);
      }

      return interaction.reply({
        content: `✅ Etkinliğe başarıyla katıldınız! Hedeflenen katılımcı sayısına (**${event.limit}**) ulaşıldığı için etkinlik sona erdi.`,
        flags: MessageFlags.Ephemeral
      });
    }

    if (isBackup) {
      return interaction.reply({ content: '✅ Asıl kontenjan dolduğu için **Yedek** olarak listeye eklendiniz!', flags: MessageFlags.Ephemeral });
    } else {
      return interaction.reply({ content: '✅ Etkinliğe başarıyla katıldınız!', flags: MessageFlags.Ephemeral });
    }
  }

  // Etkinlikten Ayrıl
  if (interaction.isButton() && interaction.customId === 'event_leave') {
    const events = loadEvents();
    const idx = events.findIndex(e => e.messageId === interaction.message.id);
    if (idx === -1) return interaction.reply({ content: '❌ Etkinlik bulunamadı.', flags: MessageFlags.Ephemeral });
    const event = events[idx];
    if (event.finished) return interaction.reply({ content: '❌ Bu etkinlik sona erdiği için ayrılamazsınız.', flags: MessageFlags.Ephemeral });
    if (!event.participants.includes(interaction.user.id)) return interaction.reply({ content: '❌ Katılımcı listesinde değilsiniz.', flags: MessageFlags.Ephemeral });

    event.participants = event.participants.filter(id => id !== interaction.user.id);
    saveEvents(events);

    const { container, row } = buildEventContainer(event.eventType, event.limit, event.participants, false, event.sure, event.yedek, event.toplanmaSaati);
    await interaction.message.edit({ components: [container, row], flags: MessageFlags.IsComponentsV2 });
    return interaction.reply({ content: '🚪 Etkinlikten ayrıldınız.', flags: MessageFlags.Ephemeral });
  }

  // Etkinlik Bilgi Butonu
  if (interaction.isButton() && interaction.customId === 'event_info') {
    const events = loadEvents();
    const event = events.find(e => e.messageId === interaction.message.id);
    if (!event) return interaction.reply({ content: '❌ Etkinlik bulunamadı.', flags: MessageFlags.Ephemeral });

    const infoContainer = new ContainerBuilder()
      .setAccentColor(0x5865F2)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${E.duyuru} Etkinlik Bilgileri`))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `> ${E.liste} **Etkinlik:** \`${event.eventType}\`\n` +
        `> ${E.tarih} **Katılım Süresi:** \`${event.sure || 'Belirtilmedi'}\`\n` +
        `> ${E.uye} **Kontenjan:** \`${event.limit}\` kişi\n` +
        (event.toplanmaSaati ? `> ${E.tarih} **Toplanma Saati:** \`${event.toplanmaSaati}\`\n` : '') +
        `\n> ${E.unlem} *Belirtilen saatte seste veya oyunda olmayanların yerine yedeklerden alım yapılacaktır, lütfen erkenden gelmeye özen gösterelim!*`
      ));

    return interaction.reply({ components: [infoContainer], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
  }

  // Etkinliği Sonlandır (İptal Et)
  if (interaction.isButton() && interaction.customId === 'event_finish') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator))
      return interaction.reply({ content: '❌ Bu işlemi gerçekleştirmek için **Yönetici** yetkisine sahip olmalısınız.', flags: MessageFlags.Ephemeral });
    const events = loadEvents();
    const idx = events.findIndex(e => e.messageId === interaction.message.id);
    if (idx === -1) return interaction.reply({ content: '❌ Etkinlik bulunamadı.', flags: MessageFlags.Ephemeral });
    const event = events[idx];
    if (event.finished) return interaction.reply({ content: '❌ Etkinlik zaten sonlandırılmış.', flags: MessageFlags.Ephemeral });

    event.finished = true;
    const { checkAndRewardEvent } = await import('./utils/statsHelper.js');
    checkAndRewardEvent(event);
    saveEvents(events);

    const { container, row } = buildEventContainer(event.eventType, event.limit, event.participants, true, event.sure, event.yedek, event.toplanmaSaati);
    await interaction.message.edit({ components: [container, row], flags: MessageFlags.IsComponentsV2 });


    const icData = await getOnlineStatusMapForMainServer(client).catch(() => null);
    const onlineSet = icData?.onlineSet;
    const providesDiscordIds = icData?.providesDiscordIds;
    let msg = `**${event.eventType}** etkinliği sonlandırıldı.\n\n**Katılanlar:**\n`;
    if (event.participants.length === 0) msg += 'Hiç kimse katılmadı.';
    else {
      event.participants.forEach((id, i) => {
        let presenceText = '';
        if (client.config?.icKontrolMainServer && onlineSet && providesDiscordIds) {
          presenceText = onlineSet.has(id) ? ' (Oyunda)' : ' (Oyunda değil)';
        }
        msg += `${i + 1}. <@${id}>${presenceText}\n`;
      });
    }
    if (msg.length > 2000) for (const chunk of msg.match(/[\s\S]{1,2000}/g) || []) await interaction.channel.send(chunk);
    else await interaction.channel.send(msg);

    await interaction.reply({ content: 'Etkinlik sonlandırıldı.', ephemeral: true });
    return;
  }

  // Etkinliği Düzenle Butonu
  if (interaction.isButton() && interaction.customId === 'event_edit') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator))
      return interaction.reply({ content: '❌ Bu işlemi gerçekleştirmek için **Yönetici** yetkiniz olmalıdır.', flags: MessageFlags.Ephemeral });

    const events = loadEvents();
    const event = events.find(e => e.messageId === interaction.message.id);
    if (!event) return interaction.reply({ content: '❌ Etkinlik bulunamadı.', flags: MessageFlags.Ephemeral });
    if (event.finished) return interaction.reply({ content: '❌ Bu etkinlik sona erdiği için düzenlenemez.', flags: MessageFlags.Ephemeral });

    const modal = new ModalBuilder()
      .setCustomId(`event_edit_modal_${event.messageId}`)
      .setTitle('Etkinliği Düzenle');

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('edit_event_type').setLabel('Etkinlik Türü').setStyle(TextInputStyle.Short).setValue(event.eventType || '').setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('edit_event_duration').setLabel('Katılım Süresi').setStyle(TextInputStyle.Short).setValue(event.sure || '').setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('edit_event_limit').setLabel('Kişi Sayısı').setStyle(TextInputStyle.Short).setValue(String(event.limit || '')).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('edit_event_time').setLabel('Toplanma Saati').setStyle(TextInputStyle.Short).setValue(event.toplanmaSaati || '').setRequired(false)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('edit_event_backup').setLabel('Yedek Oyuncu Sayısı').setStyle(TextInputStyle.Short).setValue(String(event.yedek || '')).setRequired(false)
      )
    );

    await interaction.showModal(modal);
    return;
  }

  // Etkinlik Düzenleme Modal Submit
  if (interaction.isModalSubmit() && interaction.customId.startsWith('event_edit_modal_')) {
    const messageId = interaction.customId.substring('event_edit_modal_'.length);
    const events = loadEvents();
    const eventIndex = events.findIndex(e => e.messageId === messageId);
    if (eventIndex === -1) return interaction.reply({ content: '❌ Etkinlik bulunamadı.', flags: MessageFlags.Ephemeral });
    const event = events[eventIndex];
    if (event.finished) return interaction.reply({ content: '❌ Bu etkinlik sona erdiği için düzenlenemez.', flags: MessageFlags.Ephemeral });

    const newType = interaction.fields.getTextInputValue('edit_event_type');
    const newDuration = interaction.fields.getTextInputValue('edit_event_duration');
    const newLimitRaw = interaction.fields.getTextInputValue('edit_event_limit');
    const newTime = interaction.fields.getTextInputValue('edit_event_time');
    const newBackupRaw = interaction.fields.getTextInputValue('edit_event_backup');

    const newLimit = parseInt(newLimitRaw, 10);
    if (isNaN(newLimit) || newLimit <= 0) {
      return interaction.reply({ content: '❌ Kişi sayısı geçerli pozitif bir tam sayı olmalıdır.', flags: MessageFlags.Ephemeral });
    }

    let newBackup = null;
    if (newBackupRaw) {
      newBackup = parseInt(newBackupRaw, 10);
      if (isNaN(newBackup) || newBackup < 0) {
        return interaction.reply({ content: '❌ Yedek oyuncu sayısı geçerli bir sayı olmalıdır.', flags: MessageFlags.Ephemeral });
      }
    }

    // Parse the new duration to compute new expiresAt
    const newExpiresAt = parseEventDuration(newDuration);

    // Update the event in memory
    event.eventType = newType;
    event.limit = newLimit;
    event.sure = newDuration;
    event.toplanmaSaati = newTime || null;
    event.yedek = newBackup;
    event.expiresAt = newExpiresAt;

    // Check if the current participant count already reached or exceeded the new limit
    if (event.participants.length >= event.limit) {
      event.finished = true;
    }

    // Save to SQLite
    const { checkAndRewardEvent } = await import('./utils/statsHelper.js');
    checkAndRewardEvent(event);
    saveEvents(events);

    // Try to fetch the message and update its panel
    try {
      const channel = await interaction.guild.channels.fetch(event.channelId).catch(() => null);
      if (channel?.isTextBased()) {
        const message = await channel.messages.fetch(event.messageId).catch(() => null);
        if (message) {
          const { container: evtContainer, row: evtRow } = buildEventContainer(
            event.eventType,
            event.limit,
            event.participants,
            event.finished,
            event.sure,
            event.yedek,
            event.toplanmaSaati
          );
          await message.edit({ components: [evtContainer, evtRow], flags: MessageFlags.IsComponentsV2 });
        }
      }
    } catch (err) {
      console.error('Etkinlik mesajı güncellenirken hata oluştu:', err);
    }

    // Try to update management message in aktif-işlemler
    try {
      const mgmtChId = client.config?.aktifIslemlerChannelId;
      if (mgmtChId && event.mgmtMessageId) {
        const mgmtChannel = await interaction.guild.channels.fetch(mgmtChId).catch(() => null);
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
              .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🎛️ Etkinlik Yönetimi`))
              .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
              .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `> 🏆 **Etkinlik:** ${event.eventType}\n` +
                `> 👥 **Kontenjan:** ${event.limit} kişi\n` +
                `> ${E.tarih} **Süre:** ${event.sure}\n` +
                `> 📢 **Kanal:** <#${event.channelId}>\n` +
                `> 🔗 **Mesaj:** [Tıkla](https://discord.com/channels/${event.guildId}/${event.channelId}/${event.messageId})\n` +
                `> 👤 **Katılımcı Sayısı:** ${event.participants.length}`
              ))
              .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
              .addActionRowComponents(mgmtRow)
              .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
              .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));
            await mgmtMsg.edit({ components: [mgmtContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
          }
        }
      }
    } catch (err) {
      console.error('Yönetim mesajı güncellenirken hata oluştu:', err);
    }

    // If limit was reached/exceeded and finished state changed, announce participants
    if (event.finished) {
      try {
        const icData = await getOnlineStatusMapForMainServer(client).catch(() => null);
        const onlineSet = icData?.onlineSet;
        const providesDiscordIds = icData?.providesDiscordIds;
        let msg = `**${event.eventType}** etkinliği güncellendi ve dolduğu için sonlandırıldı!\n\n**Katılanlar:**\n`;
        event.participants.forEach((id, i) => {
          let presenceText = '';
          if (client.config?.icKontrolMainServer && onlineSet && providesDiscordIds) {
            presenceText = onlineSet.has(id) ? ' (Oyunda)' : ' (Oyunda değil)';
          }
          msg += `${i + 1}. <@${id}>${presenceText}\n`;
        });
        if (msg.length > 2000) {
          for (const chunk of msg.match(/[\s\S]{1,2000}/g) || []) {
            await interaction.channel.send(chunk);
          }
        } else {
          await interaction.channel.send(msg);
        }
      } catch (err) {
        console.error('Etkinlik sonlandırma duyurusu gönderilirken hata oluştu:', err);
      }
    }

    await interaction.reply({ content: '✅ Etkinlik başarıyla güncellendi.', flags: MessageFlags.Ephemeral });
    return;
  }

  // ── Çekiliş: Düzenle Modal Submit ──
  if (interaction.isModalSubmit() && interaction.customId.startsWith('aktif_cek_duzenle_modal_')) {
    const msgId = interaction.customId.replace('aktif_cek_duzenle_modal_', '');
    const { loadGiveaways, saveGiveaways, buildGiveawayContainer } = await import('./handlers/giveawayHandler.js');
    const giveaways = loadGiveaways();
    const giveaway = giveaways.find(g => g.messageId === msgId);
    if (!giveaway) return interaction.reply({ content: '❌ Çekiliş bulunamadı.', flags: MessageFlags.Ephemeral });
    if (giveaway.ended) return interaction.reply({ content: '❌ Bu çekiliş sonlandırıldı.', flags: MessageFlags.Ephemeral });

    const newPrize = interaction.fields.getTextInputValue('edit_cek_prize').trim();
    const newWinnerCountRaw = interaction.fields.getTextInputValue('edit_cek_winners').trim();
    const newWinnerCount = parseInt(newWinnerCountRaw, 10);

    if (isNaN(newWinnerCount) || newWinnerCount <= 0) {
      return interaction.reply({ content: '❌ Kazanan sayısı geçerli pozitif bir tam sayı olmalıdır.', flags: MessageFlags.Ephemeral });
    }

    giveaway.prize = newPrize;
    giveaway.winnerCount = newWinnerCount;
    saveGiveaways(giveaways);

    // Public mesajı güncelle
    try {
      const channel = await interaction.guild.channels.fetch(giveaway.channelId).catch(() => null);
      if (channel?.isTextBased()) {
        const msg = await channel.messages.fetch(giveaway.messageId).catch(() => null);
        if (msg) {
          const container = buildGiveawayContainer(giveaway);
          await msg.edit({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
      }
    } catch (err) { console.error('Çekiliş public mesaj güncelleme hatası:', err); }

    // Yönetim mesajını güncelle
    try {
      const mgmtRow1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`aktif_cek_duzenle_${giveaway.messageId}`).setLabel('Düzenle').setStyle(ButtonStyle.Primary).setEmoji('✏️'),
        new ButtonBuilder().setCustomId(`aktif_cek_sure_${giveaway.messageId}`).setLabel('Süre Uzat').setStyle(ButtonStyle.Secondary).setEmoji('⏱️'),
        new ButtonBuilder().setCustomId(`aktif_cek_kazanan_${giveaway.messageId}`).setLabel('Kazanan Belirle').setStyle(ButtonStyle.Success).setEmoji('<:mod:1507746579078053999>')
      );
      const mgmtRow2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`aktif_cek_bitir_${giveaway.messageId}`).setLabel('Çekilişi Bitir').setStyle(ButtonStyle.Danger).setEmoji('⛔')
      );
      const mgmtContainer = new ContainerBuilder()
        .setAccentColor(0x5865F2)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🎛️ Çekiliş Yönetimi`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `> 🎁 **Ödül:** ${giveaway.prize}\n` +
          `> 🏆 **Kazanan Sayısı:** ${giveaway.winnerCount}\n` +
          `> ⏰ **Bitiş:** <t:${Math.floor(giveaway.endsAt / 1000)}:F>\n` +
          `> 🔗 **Mesaj:** [Tıkla](https://discord.com/channels/${giveaway.guildId}/${giveaway.channelId}/${giveaway.messageId})\n` +
          `> 👤 **Kazanan Belirlenmiş:** ${giveaway.forcedWinnerId ? `<@${giveaway.forcedWinnerId}>` : 'Hayır'}`
        ))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addActionRowComponents(mgmtRow1)
        .addActionRowComponents(mgmtRow2)
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));
      await interaction.message.edit({ components: [mgmtContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
    } catch (err) { console.error('Çekiliş yönetim mesajı güncelleme hatası:', err); }

    await interaction.reply({ content: '✅ Çekiliş başarıyla güncellendi.', flags: MessageFlags.Ephemeral });
    return;
  }

  // ── Çekiliş: Süre Uzat Modal Submit ──
  if (interaction.isModalSubmit() && interaction.customId.startsWith('aktif_cek_sure_modal_')) {
    const msgId = interaction.customId.replace('aktif_cek_sure_modal_', '');
    const { loadGiveaways, saveGiveaways, buildGiveawayContainer } = await import('./handlers/giveawayHandler.js');
    const giveaways = loadGiveaways();
    const giveaway = giveaways.find(g => g.messageId === msgId);
    if (!giveaway) return interaction.reply({ content: '❌ Çekiliş bulunamadı.', flags: MessageFlags.Ephemeral });
    if (giveaway.ended) return interaction.reply({ content: '❌ Bu çekiliş sonlandırıldı.', flags: MessageFlags.Ephemeral });

    const sureStr = interaction.fields.getTextInputValue('sure_uzatma').trim();
    const match = sureStr.match(/^(\d+)([smhd])$/);
    if (!match) return interaction.reply({ content: '❌ Geçersiz süre formatı! Örnekler: `10m`, `2h`, `1d`', flags: MessageFlags.Ephemeral });
    const v = parseInt(match[1], 10);
    const u = match[2];
    const addMs = u === 's' ? v * 1000 : u === 'm' ? v * 60000 : u === 'h' ? v * 3600000 : v * 86400000;

    giveaway.endsAt += addMs;
    saveGiveaways(giveaways);

    // Public mesajı güncelle
    try {
      const channel = await interaction.guild.channels.fetch(giveaway.channelId).catch(() => null);
      if (channel?.isTextBased()) {
        const msg = await channel.messages.fetch(giveaway.messageId).catch(() => null);
        if (msg) {
          const container = buildGiveawayContainer(giveaway);
          await msg.edit({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
      }
    } catch (err) { console.error('Çekiliş public mesaj güncelleme hatası:', err); }

    // Yönetim mesajını güncelle
    try {
      const mgmtRow1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`aktif_cek_duzenle_${giveaway.messageId}`).setLabel('Düzenle').setStyle(ButtonStyle.Primary).setEmoji('✏️'),
        new ButtonBuilder().setCustomId(`aktif_cek_sure_${giveaway.messageId}`).setLabel('Süre Uzat').setStyle(ButtonStyle.Secondary).setEmoji('⏱️'),
        new ButtonBuilder().setCustomId(`aktif_cek_kazanan_${giveaway.messageId}`).setLabel('Kazanan Belirle').setStyle(ButtonStyle.Success).setEmoji('<:mod:1507746579078053999>')
      );
      const mgmtRow2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`aktif_cek_bitir_${giveaway.messageId}`).setLabel('Çekilişi Bitir').setStyle(ButtonStyle.Danger).setEmoji('⛔')
      );
      const mgmtContainer = new ContainerBuilder()
        .setAccentColor(0x5865F2)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🎛️ Çekiliş Yönetimi`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `> 🎁 **Ödül:** ${giveaway.prize}\n` +
          `> 🏆 **Kazanan Sayısı:** ${giveaway.winnerCount}\n` +
          `> ⏰ **Bitiş:** <t:${Math.floor(giveaway.endsAt / 1000)}:F>\n` +
          `> 🔗 **Mesaj:** [Tıkla](https://discord.com/channels/${giveaway.guildId}/${giveaway.channelId}/${giveaway.messageId})\n` +
          `> 👤 **Kazanan Belirlenmiş:** ${giveaway.forcedWinnerId ? `<@${giveaway.forcedWinnerId}>` : 'Hayır'}`
        ))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addActionRowComponents(mgmtRow1)
        .addActionRowComponents(mgmtRow2)
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));
      await interaction.message.edit({ components: [mgmtContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
    } catch (err) { console.error('Çekiliş yönetim mesajı güncelleme hatası:', err); }

    await interaction.reply({ content: `✅ Süre \`${sureStr}\` kadar uzatıldı.`, flags: MessageFlags.Ephemeral });
    return;
  }

  // ── Çekiliş: Kazanan Belirle Modal Submit ──
  if (interaction.isModalSubmit() && interaction.customId.startsWith('aktif_cek_kazanan_modal_')) {
    const msgId = interaction.customId.replace('aktif_cek_kazanan_modal_', '');
    const { loadGiveaways, saveGiveaways } = await import('./handlers/giveawayHandler.js');
    const giveaways = loadGiveaways();
    const giveaway = giveaways.find(g => g.messageId === msgId);
    if (!giveaway) return interaction.reply({ content: '❌ Çekiliş bulunamadı.', flags: MessageFlags.Ephemeral });
    if (giveaway.ended) return interaction.reply({ content: '❌ Bu çekiliş sonlandırıldı.', flags: MessageFlags.Ephemeral });

    const forcedWinnerId = interaction.fields.getTextInputValue('forced_winner_id').trim();
    if (forcedWinnerId !== '' && !/^\d+$/.test(forcedWinnerId)) {
      return interaction.reply({ content: '❌ Geçersiz Discord ID!', flags: MessageFlags.Ephemeral });
    }

    giveaway.forcedWinnerId = forcedWinnerId || null;
    saveGiveaways(giveaways);

    // Yönetim mesajını güncelle
    try {
      const mgmtRow1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`aktif_cek_duzenle_${giveaway.messageId}`).setLabel('Düzenle').setStyle(ButtonStyle.Primary).setEmoji('✏️'),
        new ButtonBuilder().setCustomId(`aktif_cek_sure_${giveaway.messageId}`).setLabel('Süre Uzat').setStyle(ButtonStyle.Secondary).setEmoji('⏱️'),
        new ButtonBuilder().setCustomId(`aktif_cek_kazanan_${giveaway.messageId}`).setLabel('Kazanan Belirle').setStyle(ButtonStyle.Success).setEmoji('<:mod:1507746579078053999>')
      );
      const mgmtRow2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`aktif_cek_bitir_${giveaway.messageId}`).setLabel('Çekilişi Bitir').setStyle(ButtonStyle.Danger).setEmoji('⛔')
      );
      const mgmtContainer = new ContainerBuilder()
        .setAccentColor(0x5865F2)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🎛️ Çekiliş Yönetimi`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `> 🎁 **Ödül:** ${giveaway.prize}\n` +
          `> 🏆 **Kazanan Sayısı:** ${giveaway.winnerCount}\n` +
          `> ⏰ **Bitiş:** <t:${Math.floor(giveaway.endsAt / 1000)}:F>\n` +
          `> 🔗 **Mesaj:** [Tıkla](https://discord.com/channels/${giveaway.guildId}/${giveaway.channelId}/${giveaway.messageId})\n` +
          `> 👤 **Kazanan Belirlenmiş:** ${giveaway.forcedWinnerId ? `<@${giveaway.forcedWinnerId}>` : 'Hayır'}`
        ))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addActionRowComponents(mgmtRow1)
        .addActionRowComponents(mgmtRow2)
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));
      await interaction.message.edit({ components: [mgmtContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
    } catch (err) { console.error('Çekiliş yönetim mesajı güncelleme hatası:', err); }

    await interaction.reply({ content: forcedWinnerId ? `✅ Kazanan başarıyla <@${forcedWinnerId}> olarak belirlendi.` : '✅ Belirlenmiş kazanan kaldırıldı.', flags: MessageFlags.Ephemeral });
    return;
  }

  // Çekiliş Katıl Butonu
  if (interaction.isButton() && interaction.customId.startsWith('giveaway_join_')) {
    try {
      const { handleGiveawayJoin } = await import('./handlers/giveawayHandler.js');
      await handleGiveawayJoin(interaction, client);
    } catch (e) {
      console.error(e);
      if (!interaction.replied) await interaction.reply({ content: 'Hata oluştu.', flags: MessageFlags.Ephemeral });
    }
    return;
  }

  // ═══════════════════════════════════════════
  // AKTİF-İŞLEMLER KANAL BUTON HANDLER'LARI
  // ═══════════════════════════════════════════

  // ── Etkinlik: Düzenle ──
  if (interaction.isButton() && interaction.customId.startsWith('aktif_etkinlik_duzenle_')) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator))
      return interaction.reply({ content: '❌ Yönetici yetkisi gerekiyor.', flags: MessageFlags.Ephemeral });
    const msgId = interaction.customId.replace('aktif_etkinlik_duzenle_', '');
    const evts = loadEvents();
    const evt = evts.find(e => e.messageId === msgId);
    if (!evt) return interaction.reply({ content: '❌ Etkinlik bulunamadı.', flags: MessageFlags.Ephemeral });
    if (evt.finished) return interaction.reply({ content: '❌ Bu etkinlik zaten sonlandırıldı.', flags: MessageFlags.Ephemeral });
    const modal = new ModalBuilder().setCustomId(`event_edit_modal_${msgId}`).setTitle('Etkinliği Düzenle');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('edit_event_type').setLabel('Etkinlik Türü').setStyle(TextInputStyle.Short).setValue(evt.eventType || '').setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('edit_event_duration').setLabel('Katılım Süresi').setStyle(TextInputStyle.Short).setValue(evt.sure || '').setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('edit_event_limit').setLabel('Kişi Sayısı').setStyle(TextInputStyle.Short).setValue(String(evt.limit || '')).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('edit_event_time').setLabel('Toplanma Saati').setStyle(TextInputStyle.Short).setValue(evt.toplanmaSaati || '').setRequired(false)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('edit_event_backup').setLabel('Yedek Oyuncu Sayısı').setStyle(TextInputStyle.Short).setValue(String(evt.yedek || '')).setRequired(false))
    );
    await interaction.showModal(modal);
    return;
  }

  // ── Etkinlik: Sonlandır ──
  if (interaction.isButton() && interaction.customId.startsWith('aktif_etkinlik_sonlandir_')) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator))
      return interaction.reply({ content: '❌ Yönetici yetkisi gerekiyor.', flags: MessageFlags.Ephemeral });
    const msgId = interaction.customId.replace('aktif_etkinlik_sonlandir_', '');
    const evts = loadEvents();
    const idx = evts.findIndex(e => e.messageId === msgId);
    if (idx === -1) return interaction.reply({ content: '❌ Etkinlik bulunamadı.', flags: MessageFlags.Ephemeral });
    const evt = evts[idx];
    if (evt.finished) return interaction.reply({ content: '❌ Etkinlik zaten sonlandırıldı.', flags: MessageFlags.Ephemeral });
    evt.finished = true;
    const { checkAndRewardEvent } = await import('./utils/statsHelper.js');
    checkAndRewardEvent(evt);
    saveEvents(evts);
    try {
      const evtChannel = await client.channels.fetch(evt.channelId).catch(() => null);
      if (evtChannel?.isTextBased()) {
        const evtMsg = await evtChannel.messages.fetch(evt.messageId).catch(() => null);
        if (evtMsg) {
          const { container: ec, row: er } = buildEventContainer(evt.eventType, evt.limit, evt.participants, true, evt.sure, evt.yedek, evt.toplanmaSaati);
          await evtMsg.edit({ components: [ec, er], flags: MessageFlags.IsComponentsV2 });
        }
        const icData = await getOnlineStatusMapForMainServer(client).catch(() => null);
        const onlineSet = icData?.onlineSet;
        const providesDiscordIds = icData?.providesDiscordIds;
        let msg = `**${evt.eventType}** etkinliği sonlandırıldı.\n\n**Katılanlar:**\n`;
        if (evt.participants.length === 0) msg += 'Hiç kimse katılmadı.';
        else {
          evt.participants.forEach((id, i) => {
            let presenceText = '';
            if (client.config?.icKontrolMainServer && onlineSet && providesDiscordIds) {
              presenceText = onlineSet.has(id) ? ' (Oyunda)' : ' (Oyunda değil)';
            }
            msg += `${i + 1}. <@${id}>${presenceText}\n`;
          });
        }
        if (msg.length > 2000) for (const chunk of msg.match(/[\s\S]{1,2000}/g) || []) await evtChannel.send(chunk);
        else await evtChannel.send(msg);
      }
    } catch (err) { console.error('Aktif etkinlik sonlandırma hatası:', err); }
    await interaction.message.delete().catch(() => null);
    await interaction.reply({ content: '✅ Etkinlik başarıyla sonlandırıldı.', flags: MessageFlags.Ephemeral });
    return;
  }

  // ── Etkinlik: Katılan Çıkart ──
  if (interaction.isButton() && interaction.customId.startsWith('aktif_etkinlik_cikar_')) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator))
      return interaction.reply({ content: '❌ Yönetici yetkisi gerekiyor.', flags: MessageFlags.Ephemeral });
    const msgId = interaction.customId.replace('aktif_etkinlik_cikar_', '');
    const evts = loadEvents();
    const evt = evts.find(e => e.messageId === msgId);
    if (!evt) return interaction.reply({ content: '❌ Etkinlik bulunamadı.', flags: MessageFlags.Ephemeral });
    if (evt.finished) return interaction.reply({ content: '❌ Bu etkinlik sonlandırıldı.', flags: MessageFlags.Ephemeral });
    const modal = new ModalBuilder().setCustomId(`aktif_etkinlik_cikar_modal_${msgId}`).setTitle('Katılan Çıkart');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('cikar_user_id').setLabel('Discord ID (Virgülle ayırarak girin)').setStyle(TextInputStyle.Short).setPlaceholder('461096891371880449, 979035754586050663').setRequired(true)
      )
    );
    await interaction.showModal(modal);
    return;
  }

  // ── Etkinlik: Katılan Çıkart Modal ──
  if (interaction.isModalSubmit() && interaction.customId.startsWith('aktif_etkinlik_cikar_modal_')) {
    const msgId = interaction.customId.replace('aktif_etkinlik_cikar_modal_', '');
    const evts = loadEvents();
    const idx = evts.findIndex(e => e.messageId === msgId);
    if (idx === -1) return interaction.reply({ content: '❌ Etkinlik bulunamadı.', flags: MessageFlags.Ephemeral });
    const evt = evts[idx];
    const rawIds = interaction.fields.getTextInputValue('cikar_user_id');
    const ids = rawIds.split(',').map(s => s.trim()).filter(s => /^\d+$/.test(s));
    const removed = [];
    const notFound = [];
    for (const id of ids) {
      if (evt.participants.includes(id)) { evt.participants = evt.participants.filter(p => p !== id); removed.push(id); }
      else notFound.push(id);
    }
    saveEvents(evts);
    try {
      const evtChannel = await client.channels.fetch(evt.channelId).catch(() => null);
      if (evtChannel?.isTextBased()) {
        const evtMsg = await evtChannel.messages.fetch(evt.messageId).catch(() => null);
        if (evtMsg) {
          const { container: ec2, row: er2 } = buildEventContainer(evt.eventType, evt.limit, evt.participants, evt.finished, evt.sure, evt.yedek, evt.toplanmaSaati);
          await evtMsg.edit({ components: [ec2, er2], flags: MessageFlags.IsComponentsV2 });
        }
      }
    } catch (err) { console.error('Etkinlik çıkarma sonrası mesaj güncelleme hatası:', err); }
    let replyMsg = '';
    if (removed.length > 0) replyMsg += `✅ **Çıkarılan:** ${removed.map(id => `<@${id}>`).join(', ')}\n`;
    if (notFound.length > 0) replyMsg += `❌ **Listede Yok:** ${notFound.map(id => `\`${id}\``).join(', ')}`;
    await interaction.reply({ content: replyMsg || '❌ Geçerli ID bulunamadı.', flags: MessageFlags.Ephemeral });
    return;
  }

  // ── Aktiflik: Hemen Sonlandır ──
  if (interaction.isButton() && interaction.customId.startsWith('aktif_akt_sonlandir_')) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles))
      return interaction.reply({ content: '❌ Rolleri Yönet yetkisi gerekiyor.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const msgId = interaction.customId.replace('aktif_akt_sonlandir_', '');
    const activities = loadActivity();
    const actIdx = activities.findIndex(a => a.messageId === msgId && !a.processed);
    if (actIdx === -1) return interaction.editReply({ content: '❌ Aktif bir aktiflik kontrolü bulunamadı.' });
    const activity = activities[actIdx];

    try {
      const guild = interaction.guild;
      const role = guild.roles.cache.get(activity.roleId);
      const participants = activity.participants || [];
      const reactedUserIds = new Set(participants);
      const removedUserIds = [];

      // Üyeleri cache'den al, rate limit önlemi
      const members = guild.members.cache.size > 0
        ? guild.members.cache
        : await guild.members.fetch({ time: 10000 }).catch(() => guild.members.cache);

      if (role) {
        for (const [, member] of members) {
          const hasRole = activity.roleId === guild.id || member._roles.includes(activity.roleId);
          if (!hasRole) continue;
          if (reactedUserIds.has(member.id)) continue;
          try {
            await member.roles.remove(activity.roleId, 'Aktiflik kontrolünde butona tıklamadı (manuel sonlandırma)');
            removedUserIds.push(member.id);
          } catch { /* rol alma hatası - devam et */ }
        }
      }

      activity.processed = true;
      saveActivity(activities);

      // Aktiflik mesajını "sona erdi" olarak güncelle
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
                `> **Aktiflik kontrolü manuel olarak sonlandırılmıştır.**\n\n` +
                `🎯 **Hedef Rol:** ${role || 'Bilinmeyen'}\n` +
                `✅ **Durum:** Manuel Sonlandırıldı\n` +
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
        const logChannelId = client.config.activityLogChannelIdEnabled !== false ? client.config.activityLogChannelId : null;
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
                `> 👮 **Sonlandıran:** ${interaction.user} (\`${interaction.user.tag}\`)\n` +
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

      // Yönetim mesajını sil
      await interaction.message.delete().catch(() => null);
      await interaction.editReply({ content: `✅ Aktiflik kontrolü sonlandırıldı! **${removedUserIds.length}** kişinin rolü alındı, **${participants.length}** kişi katılmıştı.` });
    } catch (err) {
      console.error('Aktiflik hemen sonlandırma hatası:', err);
      await interaction.editReply({ content: '❌ Sonlandırma sırasında bir hata oluştu: ' + err.message });
    }
    return;
  }

  // ── Aktiflik: Süre Uzat ──
  if (interaction.isButton() && interaction.customId.startsWith('aktif_akt_sure_')) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles))
      return interaction.reply({ content: '❌ Rolleri Yönet yetkisi gerekiyor.', flags: MessageFlags.Ephemeral });
    const msgId = interaction.customId.replace('aktif_akt_sure_', '');
    const modal = new ModalBuilder().setCustomId(`aktif_akt_sure_modal_${msgId}`).setTitle('Süre Uzat');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('sure_uzatma').setLabel('Eklenecek Süre (örn: 10m, 1h, 2d)').setStyle(TextInputStyle.Short).setPlaceholder('10m').setRequired(true)
      )
    );
    await interaction.showModal(modal);
    return;
  }

  // ── Aktiflik: Süre Uzat Modal ──
  if (interaction.isModalSubmit() && interaction.customId.startsWith('aktif_akt_sure_modal_')) {
    const msgId = interaction.customId.replace('aktif_akt_sure_modal_', '');
    const activities = loadActivity();
    const actIdx = activities.findIndex(a => a.messageId === msgId && !a.processed);
    if (actIdx === -1) return interaction.reply({ content: '❌ Aktif bir aktiflik kontrolü bulunamadı.', flags: MessageFlags.Ephemeral });
    const activity = activities[actIdx];
    const sureStr = interaction.fields.getTextInputValue('sure_uzatma').trim();
    const match = sureStr.match(/^(\d+)([smhd])$/);
    if (!match) return interaction.reply({ content: '❌ Geçersiz süre formatı! Örnekler: `10m`, `2h`, `1d`', flags: MessageFlags.Ephemeral });
    const v = parseInt(match[1], 10);
    const u = match[2];
    const addMs = u === 's' ? v * 1000 : u === 'm' ? v * 60000 : u === 'h' ? v * 3600000 : v * 86400000;
    activity.expiresAt += addMs;
    saveActivity(activities);
    // Aktiflik mesajını güncelle
    try {
      const actChannel = await client.channels.fetch(activity.channelId).catch(() => null);
      if (actChannel?.isTextBased()) {
        const actMsg = await actChannel.messages.fetch(activity.messageId).catch(() => null);
        if (actMsg) {
          const roleObj = interaction.guild?.roles.cache.get(activity.roleId);
          const expiresAtSec = Math.floor(activity.expiresAt / 1000);
          const updBtn = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('activity_join').setLabel('✅  Katıl').setStyle(ButtonStyle.Success));
          const updContainer = new ContainerBuilder()
            .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://logo.png')))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('# <a:duyuruvar:1507733857917735022> AKTİFLİK KONTROLÜ'))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
              `> **Belirtilen rol için aktiflik kontrolü başlatılmıştır.**\n> **Katılım için aşağıdaki butona tıklayın!**\n\n` +
              `<:MemberJoined:1509702256289648833> **Katılımcı Sayısı:** ${activity.participants.length}\n` +
              `<a:TimerSand:1509704018199449680> **Kalan Süre:** <t:${expiresAtSec}:R>`
            ))
            .addActionRowComponents(updBtn)
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bots'));
          await actMsg.edit({ components: [updContainer] }).catch(() => null);
        }
      }
    } catch (err) { console.error('Aktiflik süre uzatma mesaj güncelleme hatası:', err); }
    await interaction.reply({ content: `✅ Süre \`${sureStr}\` kadar uzatıldı.`, flags: MessageFlags.Ephemeral });
    return;
  }

  // ── Aktiflik: Katılanlar .txt ──
  if (interaction.isButton() && interaction.customId.startsWith('aktif_akt_katilanlar_')) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles))
      return interaction.reply({ content: '❌ Rolleri Yönet yetkisi gerekiyor.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const msgId = interaction.customId.replace('aktif_akt_katilanlar_', '');
    const activities = loadActivity();
    const activity = activities.find(a => a.messageId === msgId);
    if (!activity) return interaction.editReply({ content: '❌ Aktiflik kaydı bulunamadı.' });
    const text = activity.participants.length > 0 ? activity.participants.join('\n') : 'Henüz kimse katılmadı.';
    const attachment = new AttachmentBuilder(Buffer.from(text, 'utf-8'), { name: 'katilanlar.txt' });
    await interaction.editReply({ content: `📄 **Katılanlar** (${activity.participants.length} kişi):`, files: [attachment] });
    return;
  }

  // ── Aktiflik: Katılmayanlar .txt ──
  if (interaction.isButton() && interaction.customId.startsWith('aktif_akt_katilmayanlar_')) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles))
      return interaction.reply({ content: '❌ Rolleri Yönet yetkisi gerekiyor.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const msgId = interaction.customId.replace('aktif_akt_katilmayanlar_', '');
    const activities = loadActivity();
    const activity = activities.find(a => a.messageId === msgId);
    if (!activity) return interaction.editReply({ content: '❌ Aktiflik kaydı bulunamadı.' });
    const guild = interaction.guild;
    let members;
    try {
      if (guild.members.cache.size > 0) {
        members = guild.members.cache;
      } else {
        members = await guild.members.fetch({ time: 10000 });
      }
    } catch (e) {
      console.error('Members fetch rate limit or error:', e.message);
      members = guild.members.cache;
    }
    const nonParticipants = [];
    for (const [, member] of members) {
      const hasRole = activity.roleId === guild.id || member._roles.includes(activity.roleId);
      if (hasRole && !activity.participants.includes(member.id)) {
        nonParticipants.push(member.id);
      }
    }
    const text = nonParticipants.length > 0 ? nonParticipants.join('\n') : 'Herkes katılmış!';
    const attachment = new AttachmentBuilder(Buffer.from(text, 'utf-8'), { name: 'katilmayanlar.txt' });
    await interaction.editReply({ content: `📄 **Katılmayanlar** (${nonParticipants.length} kişi):`, files: [attachment] });
    return;
  }

  // ── Çekiliş: Düzenle ──
  if (interaction.isButton() && interaction.customId.startsWith('aktif_cek_duzenle_')) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator))
      return interaction.reply({ content: '❌ Yönetici yetkisi gerekiyor.', flags: MessageFlags.Ephemeral });
    const msgId = interaction.customId.replace('aktif_cek_duzenle_', '');
    const { loadGiveaways } = await import('./handlers/giveawayHandler.js');
    const giveaways = loadGiveaways();
    const giveaway = giveaways.find(g => g.messageId === msgId);
    if (!giveaway) return interaction.reply({ content: '❌ Çekiliş bulunamadı.', flags: MessageFlags.Ephemeral });
    if (giveaway.ended) return interaction.reply({ content: '❌ Bu çekiliş sonlandırıldı.', flags: MessageFlags.Ephemeral });

    const modal = new ModalBuilder().setCustomId(`aktif_cek_duzenle_modal_${msgId}`).setTitle('Çekilişi Düzenle');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('edit_cek_prize').setLabel('Çekiliş Ödülü').setStyle(TextInputStyle.Short).setValue(giveaway.prize || '').setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('edit_cek_winners').setLabel('Kazanan Sayısı').setStyle(TextInputStyle.Short).setValue(String(giveaway.winnerCount || '1')).setRequired(true)
      )
    );
    await interaction.showModal(modal);
    return;
  }

  // ── Çekiliş: Süre Uzat ──
  if (interaction.isButton() && interaction.customId.startsWith('aktif_cek_sure_')) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator))
      return interaction.reply({ content: '❌ Yönetici yetkisi gerekiyor.', flags: MessageFlags.Ephemeral });
    const msgId = interaction.customId.replace('aktif_cek_sure_', '');
    const { loadGiveaways } = await import('./handlers/giveawayHandler.js');
    const giveaways = loadGiveaways();
    const giveaway = giveaways.find(g => g.messageId === msgId);
    if (!giveaway) return interaction.reply({ content: '❌ Çekiliş bulunamadı.', flags: MessageFlags.Ephemeral });
    if (giveaway.ended) return interaction.reply({ content: '❌ Bu çekiliş sonlandırıldı.', flags: MessageFlags.Ephemeral });

    const modal = new ModalBuilder().setCustomId(`aktif_cek_sure_modal_${msgId}`).setTitle('Çekiliş Süresini Uzat');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('sure_uzatma').setLabel('Eklenecek Süre (örn: 10m, 1h, 2d)').setStyle(TextInputStyle.Short).setPlaceholder('10m').setRequired(true)
      )
    );
    await interaction.showModal(modal);
    return;
  }

  // ── Çekiliş: Kazanan Belirle ──
  if (interaction.isButton() && interaction.customId.startsWith('aktif_cek_kazanan_')) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator))
      return interaction.reply({ content: '❌ Yönetici yetkisi gerekiyor.', flags: MessageFlags.Ephemeral });
    const msgId = interaction.customId.replace('aktif_cek_kazanan_', '');
    const { loadGiveaways } = await import('./handlers/giveawayHandler.js');
    const giveaways = loadGiveaways();
    const giveaway = giveaways.find(g => g.messageId === msgId);
    if (!giveaway) return interaction.reply({ content: '❌ Çekiliş bulunamadı.', flags: MessageFlags.Ephemeral });
    if (giveaway.ended) return interaction.reply({ content: '❌ Bu çekiliş sonlandırıldı.', flags: MessageFlags.Ephemeral });

    const modal = new ModalBuilder().setCustomId(`aktif_cek_kazanan_modal_${msgId}`).setTitle('Kazanan Kişi Belirle');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('forced_winner_id').setLabel('Kazanacak Üyenin Discord ID\'si').setStyle(TextInputStyle.Short).setPlaceholder('461096891371880449').setValue(giveaway.forcedWinnerId || '').setRequired(false)
      )
    );
    await interaction.showModal(modal);
    return;
  }

  // ── Çekiliş: Bitir ──
  if (interaction.isButton() && interaction.customId.startsWith('aktif_cek_bitir_')) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator))
      return interaction.reply({ content: '❌ Yönetici yetkisi gerekiyor.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const msgId = interaction.customId.replace('aktif_cek_bitir_', '');
    const { loadGiveaways, saveGiveaways, endGiveaway } = await import('./handlers/giveawayHandler.js');
    const giveaways = loadGiveaways();
    const giveaway = giveaways.find(g => g.messageId === msgId);
    if (!giveaway) return interaction.editReply({ content: '❌ Çekiliş bulunamadı.' });
    if (giveaway.ended) return interaction.editReply({ content: '❌ Bu çekiliş zaten sona ermiş.' });
    await endGiveaway(giveaway, interaction.guild, client);
    saveGiveaways(giveaways);
    await interaction.message.delete().catch(() => null);
    await interaction.editReply({ content: '✅ Çekiliş başarıyla bitirildi.' });
    return;
  }


  // Ban Affı
  if (interaction.isButton() && interaction.customId === 'banaf_talep_olustur') { await handleBanAffiTalepOlustur(interaction); return; }
  if (interaction.isModalSubmit() && interaction.customId === 'banaf_modal') { await handleBanAffiModalSubmit(interaction, client); return; }
  if (interaction.isButton() && interaction.customId === 'banaf_banlilar') { await handleBanAffiBanlilar(interaction, client); return; }
  if (interaction.isButton() && (interaction.customId.startsWith('banaf_banlilar_next_') || interaction.customId.startsWith('banaf_banlilar_prev_'))) { await handleBanAffiBanlilarPage(interaction, client); return; }
  if (interaction.isButton() && interaction.customId.startsWith('banaf_opened_')) { await handleBanAffiOpened(interaction, client); return; }
  if (interaction.isButton() && interaction.customId.startsWith('banaf_copy_')) { await handleBanAffiCopy(interaction, client); return; }
  if (interaction.isButton() && interaction.customId.startsWith('banaf_delete_')) { await handleBanAffiDelete(interaction, client); return; }
  if (interaction.isButton() && interaction.customId.startsWith('banaf_acilan_')) { await handleAcilanBanlarPage(interaction, client); return; }
  if (interaction.isButton() && interaction.customId === 'banaf_kendi_talebi') { await handleBanAffiKendiTalebi(interaction, client); return; }
  if (interaction.isButton() && interaction.customId.startsWith('banaf_kendi_sil_')) { await handleBanAffiKendiSil(interaction, client); return; }
  if (interaction.isButton() && interaction.customId.startsWith('banaf_kendi_duzenle_')) { await handleBanAffiKendiDuzenle(interaction, client); return; }
  if (interaction.isModalSubmit() && interaction.customId.startsWith('banaf_kendi_duzenle_modal_')) { await handleBanAffiKendiDuzenleSubmit(interaction, client); return; }

  // ─── BOTSES İNTERAKTİF YÖNETİM BUTONLARI & MENÜSÜ ───
  if (interaction.isButton() && interaction.customId.startsWith('botses_btn_')) {
    const ownerIds = (client.config?.ownerIds || '').split(',').map(id => id.trim()).filter(Boolean);
    const isOwner = ownerIds.includes(interaction.user.id) || interaction.guild.ownerId === interaction.user.id;
    const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
    if (!isAdmin && !isOwner) {
      return interaction.reply({ content: '❌ Bu işlemi sadece **Yöneticiler** veya **Bot Sahipleri** yapabilir.', flags: MessageFlags.Ephemeral });
    }

    const { handleJoinVoice, handleLeaveVoice, buildVoiceControlPanel } = await import('./commands/botses.js');

    if (interaction.customId === 'botses_btn_join_user') {
      const userVoice = interaction.member?.voice?.channel;
      if (!userVoice) {
        return interaction.reply({ content: '❌ Bir ses kanalında bulunmuyorsunuz! Lütfen önce bir ses kanalına geçin.', flags: MessageFlags.Ephemeral });
      }
      handleJoinVoice(userVoice, interaction.guild);
      const container = buildVoiceControlPanel(interaction.guild, client);
      return interaction.update({ content: `✅ Bot ${userVoice} kanalına sokuldu ve korumaya alındı!`, components: [container] });
    }

    if (interaction.customId === 'botses_btn_leave') {
      handleLeaveVoice(interaction.guild);
      const container = buildVoiceControlPanel(interaction.guild, client);
      return interaction.update({ content: '✅ Bot ses kanalından çıkartıldı ve koruma kapatıldı.', components: [container] });
    }

    if (interaction.customId === 'botses_btn_refresh') {
      const container = buildVoiceControlPanel(interaction.guild, client);
      return interaction.update({ content: null, components: [container] });
    }
  }

  if (interaction.isChannelSelectMenu() && interaction.customId === 'botses_select_channel') {
    const ownerIds = (client.config?.ownerIds || '').split(',').map(id => id.trim()).filter(Boolean);
    const isOwner = ownerIds.includes(interaction.user.id) || interaction.guild.ownerId === interaction.user.id;
    const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
    if (!isAdmin && !isOwner) {
      return interaction.reply({ content: '❌ Bu işlemi sadece **Yöneticiler** veya **Bot Sahipleri** yapabilir.', flags: MessageFlags.Ephemeral });
    }

    const channelId = interaction.values[0];
    const targetChannel = interaction.guild.channels.cache.get(channelId);
    if (!targetChannel) {
      return interaction.reply({ content: '❌ Seçilen ses kanalı bulunamadı.', flags: MessageFlags.Ephemeral });
    }

    const { handleJoinVoice, buildVoiceControlPanel } = await import('./commands/botses.js');
    handleJoinVoice(targetChannel, interaction.guild);
    const container = buildVoiceControlPanel(interaction.guild, client);
    return interaction.update({ content: `✅ Bot ${targetChannel} kanalına sokuldu ve korumaya alındı!`, components: [container] });
  }

  // ─── SES-YÖNET İNTERAKTİF YÖNETİM BUTONLARI ───
  if (interaction.isButton() && interaction.customId.startsWith('sesyonet_btn_')) {
    const { hasPermission } = await import('./utils/permissions.js');
    if (!hasPermission(interaction.member, 'banCommand', client)) {
      return interaction.reply({ content: '❌ Bu işlemi kullanabilmek için **Ban Sorumlusu** veya **Yönetici** yetkilerine sahip olmalısınız.', flags: MessageFlags.Ephemeral });
    }

    const { handleSesMuteAction, handleSesToplaAction } = await import('./commands/ses-yönet.js');

    if (interaction.customId === 'sesyonet_btn_mute') {
      return handleSesMuteAction(interaction, client);
    }
    if (interaction.customId === 'sesyonet_btn_topla_herkes') {
      return handleSesToplaAction(interaction, client, 'herkes');
    }
    if (interaction.customId === 'sesyonet_btn_topla_ingame') {
      return handleSesToplaAction(interaction, client, 'ingame');
    }
  }

  // YouTube
  if (interaction.isButton() && interaction.customId.startsWith('ytapprove_')) {
    try { const { handleYoutubeApprove } = await import('./handlers/youtubeHandler.js'); await handleYoutubeApprove(interaction, client); } catch (e) { console.error(e); if (!interaction.replied) await interaction.reply({ content: 'Hata.', flags: MessageFlags.Ephemeral }); }
    return;
  }
  if (interaction.isButton() && interaction.customId.startsWith('ytreject_')) {
    try { const { handleYoutubeReject } = await import('./handlers/youtubeHandler.js'); await handleYoutubeReject(interaction, client); } catch (e) { console.error(e); if (!interaction.replied) await interaction.reply({ content: 'Hata.', flags: MessageFlags.Ephemeral }); }
    return;
  }
  if (interaction.isButton() && interaction.customId === 'youtube_ekle') {
    try { const { handleYoutubeEkle } = await import('./handlers/youtubeHandler.js'); await handleYoutubeEkle(interaction, client); } catch (e) { console.error(e); if (!interaction.replied) await interaction.reply({ content: 'Hata.', ephemeral: true }); }
    return;
  }
  if (interaction.isButton() && interaction.customId === 'youtube_cikart') {
    try { const { handleYoutubeCikart } = await import('./handlers/youtubeHandler.js'); await handleYoutubeCikart(interaction, client); } catch (e) { console.error(e); if (!interaction.replied) await interaction.reply({ content: 'Hata.', ephemeral: true }); }
    return;
  }
  if (interaction.isButton() && interaction.customId === 'youtube_listele') {
    try { const { handleYoutubeListele } = await import('./handlers/youtubeHandler.js'); await handleYoutubeListele(interaction, client); } catch (e) { console.error(e); if (!interaction.replied) await interaction.reply({ content: 'Hata.', ephemeral: true }); }
    return;
  }
  if (interaction.isButton() && interaction.customId === 'youtube_kontrol') {
    try { const { handleYoutubeKontrol } = await import('./handlers/youtubeHandler.js'); await handleYoutubeKontrol(interaction, client); } catch (e) { console.error(e); if (!interaction.replied) await interaction.reply({ content: 'Hata.', ephemeral: true }); }
    return;
  }
  if (interaction.isModalSubmit() && interaction.customId === 'youtube_ekle_modal') {
    try { const { handleYoutubeEkleModal } = await import('./handlers/youtubeHandler.js'); await handleYoutubeEkleModal(interaction, client); } catch (e) { console.error(e); if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: 'Hata.', ephemeral: true }); }
    return;
  }
  if (interaction.isModalSubmit() && interaction.customId === 'youtube_cikart_modal') {
    try { const { handleYoutubeCikartModal } = await import('./handlers/youtubeHandler.js'); await handleYoutubeCikartModal(interaction, client); } catch (e) { console.error(e); if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: 'Hata.', ephemeral: true }); }
    return;
  }

  // ─── PANELSİZ BAN AFFİ BUTONLARI ───

  // Çıkart butonu — all-perm ise modal ile ID girer, diğerleri kendini çıkarır
  if (interaction.isButton() && interaction.customId === 'panelsiz_banaf_cikar') {
    try {
      const guildCfg = getPanelSizBanAfGuild(interaction.guild.id);
      if (!guildCfg || !guildCfg.active) {
        return interaction.reply({ content: '❌ Panelsiz ban affı sistemi aktif değil.', flags: MessageFlags.Ephemeral });
      }

      // All-perm kontrolü (global override'ı atlamak için Map.prototype.has.call kullan)
      const allPermUsersStr = client.config?.allPermUsers || '';
      const allPermUsers = allPermUsersStr ? allPermUsersStr.split(',').map(id => id.trim()).filter(Boolean) : [];
      const allPermRolesStr = client.config?.allPermRoles || '';
      const allPermRoles = allPermRolesStr ? allPermRolesStr.split(',').map(id => id.trim()).filter(Boolean) : [];
      let isAllPerm = allPermUsers.includes(interaction.user.id);
      if (!isAllPerm && allPermRoles.some(rId => Map.prototype.has.call(interaction.member.roles.cache, rId))) isAllPerm = true;

      if (isAllPerm) {
        // All-perm: modal ile Discord ID sor
        const modal = new ModalBuilder()
          .setCustomId('panelsiz_banaf_cikar_modal')
          .setTitle('Listeden Çıkar');
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('cikar_discord_id')
              .setLabel("Kaldırılacak Kişinin Discord ID'si")
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('Örn: 795005317171511307')
              .setRequired(true)
              .setMinLength(17)
              .setMaxLength(20)
          )
        );
        await interaction.showModal(modal);
        return;
      }

      // Normal kullanıcı: kendini çıkar
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const userId = interaction.user.id;
      const exists = guildCfg.entries?.some(e => e.userId === userId);
      if (!exists) {
        return interaction.editReply({ content: '❌ Ban affı listesinde kayıtlı değilsiniz.' });
      }

      // Yönetim kanalındaki embed ID'sini kaydet (silmek için)
      const yonetimMsgId = guildCfg.yonetimMesajlari?.[userId];

      // Kayıtı kaldır
      guildCfg.entries = guildCfg.entries.filter(e => e.userId !== userId);
      if (guildCfg.yonetimMesajlari) delete guildCfg.yonetimMesajlari[userId];
      setPanelSizBanAfGuild(interaction.guild.id, guildCfg);

      // Liste kanalındaki mesajı güncelle
      const banListeKanalId = guildCfg.banListeKanalId;
      const banListeChannel = banListeKanalId
        ? (interaction.guild.channels.cache.get(banListeKanalId) || await interaction.guild.channels.fetch(banListeKanalId).catch(() => null))
        : null;
      const cikarButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('panelsiz_banaf_cikar').setLabel('Çıkart').setStyle(ButtonStyle.Danger).setEmoji('❌')
      );
      if (banListeChannel?.isTextBased() && guildCfg.banAfListeMesajId) {
        const listMsg = await banListeChannel.messages.fetch(guildCfg.banAfListeMesajId).catch(() => null);
        if (listMsg) {
          const listContent = guildCfg.entries.length === 0
            ? '> 📋 Listede şuanda ekli olan birisi yok.'
            : guildCfg.entries.map((e, i) => `${i + 1}. <@${e.userId}> (\`${e.userId}\`) ${e.reason}`).join('\n');
          await listMsg.edit({ content: listContent, components: [cikarButton] }).catch(() => null);
        }
      }

      // Yönetim kanalındaki kişiye ait embed'i sil
      if (yonetimMsgId) {
        const mgmtChannelId = client.config?.banAffiManagementChannelId;
        const mgmtChannel = mgmtChannelId
          ? (interaction.guild.channels.cache.get(mgmtChannelId) || await interaction.guild.channels.fetch(mgmtChannelId).catch(() => null))
          : null;
        if (mgmtChannel?.isTextBased()) {
          const mgmtMsg = await mgmtChannel.messages.fetch(yonetimMsgId).catch(() => null);
          if (mgmtMsg) await mgmtMsg.delete().catch(() => null);
        }
      }

      return interaction.editReply({ content: '✅ Ban affı listesinden başarıyla çıkarıldınız.' });
    } catch (err) {
      console.error('[PANELSIZ BAN AF] Çıkart butonu hatası:', err);
      if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Hata oluştu.', flags: MessageFlags.Ephemeral }).catch(() => null);
    }
    return;
  }

  // Açıldı / Sil butonları — yönetim kanalı butonları
  if (interaction.isButton() && (interaction.customId.startsWith('panelsiz_banaf_acildi_') || interaction.customId.startsWith('panelsiz_banaf_sil_'))) {
    try {
      const banCommandRoleId = client.config.banCommandRoleId;
      const hasStaffRole = banCommandRoleId && interaction.member.roles.cache.has(banCommandRoleId);
      if (!hasStaffRole && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: '❌ Bu işlemi sadece **Ban Sorumlusu** yapabilir.', flags: MessageFlags.Ephemeral });
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const isAcildi = interaction.customId.startsWith('panelsiz_banaf_acildi_');
      const targetUserId = interaction.customId.split('_').pop();

      // Kaydı kaldırmadan önce ban sebebini kaydet
      const guildCfg = getPanelSizBanAfGuild(interaction.guild.id);
      const entryData = guildCfg?.entries?.find(e => e.userId === targetUserId);
      const banReason = entryData?.reason || 'Belirtilmedi';

      if (guildCfg?.entries) {
        guildCfg.entries = guildCfg.entries.filter(e => e.userId !== targetUserId);
        if (guildCfg.yonetimMesajlari) delete guildCfg.yonetimMesajlari[targetUserId];
        setPanelSizBanAfGuild(interaction.guild.id, guildCfg);

        // Ban Listesi Kanalındaki mesajı güncelle (boş ise placeholder göster, silme)
        const banListeKanalId = guildCfg.banListeKanalId;
        const banListeChannel = banListeKanalId
          ? (interaction.guild.channels.cache.get(banListeKanalId) || await interaction.guild.channels.fetch(banListeKanalId).catch(() => null))
          : null;
        const cikarBtn = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('panelsiz_banaf_cikar').setLabel('Çıkart').setStyle(ButtonStyle.Danger).setEmoji('❌')
        );
        if (banListeChannel?.isTextBased() && guildCfg.banAfListeMesajId) {
          const listMsg = await banListeChannel.messages.fetch(guildCfg.banAfListeMesajId).catch(() => null);
          if (listMsg) {
            const listContent = guildCfg.entries.length === 0
              ? '> 📋 Listede şuanda ekli olan birisi yok.'
              : guildCfg.entries.map((e, i) => `${i + 1}. <@${e.userId}> (\`${e.userId}\`) ${e.reason}`).join('\n');
            await listMsg.edit({ content: listContent, components: [cikarBtn] }).catch(() => null);
          }
        }
      }

      // Yönetim kanalındaki bu kişiye ait embed mesajı sil
      await interaction.message.delete().catch(() => null);

      if (isAcildi) {
        const targetUser = await client.users.fetch(targetUserId).catch(() => null);
        if (targetUser) {
          const ekipIsmi = client.config?.ekipIsmi || 'Ekip';
          const mainServer = client.config?.icKontrolMainServer || 'Ana Sunucu';
          const dmMessage = `**${ekipIsmi} | ${mainServer}** sunucusundan **${banReason}** sebebi ile banlıydınız, bu ban <@${interaction.user.id}> tarafından açıldı.`;
          await targetUser.send(dmMessage).catch(() => null);
        }
        await interaction.editReply({ content: `✅ <@${targetUserId}> kullanıcısının banı açıldı, DM gönderildi ve listeden silindi.` });
      } else {
        await interaction.editReply({ content: `🗑️ <@${targetUserId}> kullanıcısının ban affı talebi silindi.` });
      }

      // Log
      const banAfLogChannelId = client.config?.banAfLogChannelIdEnabled !== false ? client.config?.banAfLogChannelId : null;
      if (banAfLogChannelId) {
        const logChannel = interaction.guild.channels.cache.get(banAfLogChannelId) || await interaction.guild.channels.fetch(banAfLogChannelId).catch(() => null);
        if (logChannel?.isTextBased()) {
          const logContainer = new ContainerBuilder()
            .setAccentColor(isAcildi ? 0x2ecc71 : 0xED4245)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(isAcildi ? `## ✅ Panelsiz Ban Affı Onaylandı` : `## 🗑️ Panelsiz Ban Affı Silindi`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
              `> <:mod:1507746579078053999> **Yetkili:** ${interaction.user} (\`${interaction.user.tag}\`)\n` +
              `> 👤 **Talep Sahibi:** <@${targetUserId}> (\`${targetUserId}\`)\n` +
              `> 📅 **Tarih:** <t:${Math.floor(Date.now() / 1000)}:F>`
            ))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));
          await logChannel.send({ components: [logContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
        }
      }

    } catch (err) {
      console.error('[PANELSIZ BAN AF] Yetkili buton hatası:', err);
    }
    return;
  }

  // Panelsiz Ban Affı — All-Perm Modal Submit (Discord ID ile çıkar)
  if (interaction.isModalSubmit() && interaction.customId === 'panelsiz_banaf_cikar_modal') {
    try {
      // All-perm doğrulama
      const allPermUsersStr = client.config?.allPermUsers || '';
      const allPermUsers = allPermUsersStr ? allPermUsersStr.split(',').map(id => id.trim()).filter(Boolean) : [];
      const allPermRolesStr = client.config?.allPermRoles || '';
      const allPermRoles = allPermRolesStr ? allPermRolesStr.split(',').map(id => id.trim()).filter(Boolean) : [];
      let isAllPerm = allPermUsers.includes(interaction.user.id);
      if (!isAllPerm && allPermRoles.some(rId => Map.prototype.has.call(interaction.member.roles.cache, rId))) isAllPerm = true;
      if (!isAllPerm) {
        return interaction.reply({ content: '❌ Bu işlemi sadece **All-Perm** yetkilisi yapabilir.', flags: MessageFlags.Ephemeral });
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const targetUserId = interaction.fields.getTextInputValue('cikar_discord_id').trim();
      if (!/^\d{17,20}$/.test(targetUserId)) {
        return interaction.editReply({ content: '❌ Geçersiz Discord ID formatı. 17-20 haneli sayısal bir ID giriniz.' });
      }

      const guildCfg = getPanelSizBanAfGuild(interaction.guild.id);
      if (!guildCfg || !guildCfg.active) {
        return interaction.editReply({ content: '❌ Panelsiz ban affı sistemi aktif değil.' });
      }

      const exists = guildCfg.entries?.some(e => e.userId === targetUserId);
      if (!exists) {
        return interaction.editReply({ content: `❌ <@${targetUserId}> (\`${targetUserId}\`) ban affı listesinde kayıtlı değil.` });
      }

      // Yönetim mesaj ID'sini kayıt silmeden önce al
      const yonetimMsgId = guildCfg.yonetimMesajlari?.[targetUserId];

      // Kayıtı kaldır
      guildCfg.entries = guildCfg.entries.filter(e => e.userId !== targetUserId);
      if (guildCfg.yonetimMesajlari) delete guildCfg.yonetimMesajlari[targetUserId];
      setPanelSizBanAfGuild(interaction.guild.id, guildCfg);

      // Liste mesajını güncelle
      const banListeKanalId = guildCfg.banListeKanalId;
      const banListeChannel = banListeKanalId
        ? (interaction.guild.channels.cache.get(banListeKanalId) || await interaction.guild.channels.fetch(banListeKanalId).catch(() => null))
        : null;
      const cikarButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('panelsiz_banaf_cikar').setLabel('Çıkart').setStyle(ButtonStyle.Danger).setEmoji('❌')
      );
      if (banListeChannel?.isTextBased() && guildCfg.banAfListeMesajId) {
        const listMsg = await banListeChannel.messages.fetch(guildCfg.banAfListeMesajId).catch(() => null);
        if (listMsg) {
          const listContent = guildCfg.entries.length === 0
            ? '> 📋 Listede şuanda ekli olan birisi yok.'
            : guildCfg.entries.map((e, i) => `${i + 1}. <@${e.userId}> (\`${e.userId}\`) ${e.reason}`).join('\n');
          await listMsg.edit({ content: listContent, components: [cikarButton] }).catch(() => null);
        }
      }

      // Yönetim kanalındaki embed'i sil
      if (yonetimMsgId) {
        const mgmtChannelId = client.config?.banAffiManagementChannelId;
        const mgmtChannel = mgmtChannelId
          ? (interaction.guild.channels.cache.get(mgmtChannelId) || await interaction.guild.channels.fetch(mgmtChannelId).catch(() => null))
          : null;
        if (mgmtChannel?.isTextBased()) {
          const mgmtMsg = await mgmtChannel.messages.fetch(yonetimMsgId).catch(() => null);
          if (mgmtMsg) await mgmtMsg.delete().catch(() => null);
        }
      }

      return interaction.editReply({ content: `✅ <@${targetUserId}> (\`${targetUserId}\`) ban affı listesinden çıkarıldı.` });
    } catch (err) {
      console.error('[PANELSIZ BAN AF] Modal çıkart hatası:', err);
      if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Hata oluştu.', flags: MessageFlags.Ephemeral }).catch(() => null);
    }
    return;
  }

  // IC Kontrol Ekle Start Button
  if (interaction.isButton() && interaction.customId === 'ickontrol_ekle_start') {
    const mainServer = client.config.icKontrolMainServer;
    if (!mainServer) {
      return interaction.reply({ content: '❌ Ana sunucu ayarlanmamış!', flags: MessageFlags.Ephemeral });
    }

    const allServers = ['MDRP', 'WELL', 'MDPVP', 'GUİD'];
    const remainingServers = allServers.filter(s => s !== mainServer);

    const row = new ActionRowBuilder();
    remainingServers.forEach(srv => {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`ickontrol_add_${srv}`)
          .setLabel(srv)
          .setStyle(ButtonStyle.Secondary)
      );
    });

    return interaction.reply({
      content: '➕ **Eklemek istediğiniz sunucuyu seçin:**',
      components: [row],
      flags: MessageFlags.Ephemeral
    });
  }

  // IC Kontrol Add Server Button
  if (interaction.isButton() && interaction.customId.startsWith('ickontrol_add_')) {
    const srvToAdd = interaction.customId.replace('ickontrol_add_', '');
    const cp = client.configPath;

    try {
      let currentConfig = {};
      if (fs.existsSync(cp)) {
        currentConfig = JSON.parse(fs.readFileSync(cp, 'utf8'));
      }

      if (!currentConfig.icKontrolActiveServers) {
        currentConfig.icKontrolActiveServers = [currentConfig.icKontrolMainServer || 'MDRP'];
      }

      if (!currentConfig.icKontrolActiveServers.includes(srvToAdd)) {
        currentConfig.icKontrolActiveServers.push(srvToAdd);
      }

      fs.writeFileSync(cp, JSON.stringify(currentConfig, null, 2), 'utf8');
      client.config = currentConfig;

      return interaction.reply({
        content: `✅ \`${srvToAdd}\` sunucusu başarıyla IC Kontrol tarama listesine eklendi!`,
        flags: MessageFlags.Ephemeral
      });
    } catch (err) {
      console.error('Error adding server to IC Kontrol active list:', err);
      return interaction.reply({ content: '❌ Sunucu eklenirken hata oluştu.', flags: MessageFlags.Ephemeral });
    }
  }

  // Ticket Handler
  try { await handleTicketInteraction(interaction, client); } catch (e) { console.error('Ticket handler hatası:', e); }
});

// Unhandled rejection'ların botu çöktürmesini engelle
process.on('unhandledRejection', (err) => {
  console.error('[UNHANDLED REJECTION]', err);
});

// ─── OTO-ROL & GİRİŞ LOGU (giris-log) ───
client.on(Events.GuildMemberAdd, async (member) => {
  // 1) Oto-Rol
  try {
    const autoRoleId = client.config?.autoRoleId;
    if (autoRoleId) {
      const role = member.guild.roles.cache.get(autoRoleId);
      if (role) await member.roles.add(role, 'Oto-Rol sistemi tarafından verildi.');
    }
  } catch (err) {
    console.error('[OTO-ROL] Rol verme hatası:', err);
  }

  // 2) Giriş Logu
  if (client.config?.loggingSystemEnabled === false) return;
  try {
    const girisLogChannelId = client.config?.girisLogChannelIdEnabled !== false ? client.config?.girisLogChannelId : null;
    if (girisLogChannelId) {
      const logChannel = member.guild.channels.cache.get(girisLogChannelId) || await member.guild.channels.fetch(girisLogChannelId).catch(() => null);
      if (logChannel?.isTextBased()) {
        const createdTime = Math.floor(member.user.createdTimestamp / 1000);
        const logEmbed = new EmbedBuilder()
          .setColor(0x57F287)
          .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL({ size: 64 }) })
          .setTitle('<:MemberJoined:1509702256289648833> Sunucuya Katıldı')
          .setDescription(
            `<:ye:1507732515585265825> **Kullanıcı:** ${member} (\`${member.id}\`)\n` +
            `<:info:1507746625508868157> **Hesap Oluşturulma Tarihi:** <t:${createdTime}:F> (<t:${createdTime}:R>)\n` +
            `**Tarih:** <t:${Math.floor(Date.now() / 1000)}:F>`
          )
          .setFooter({ text: 'Viqole Sunucu Log Sistemi' });

        const joinCardBuffer = await generateJoinCard({
          username: member.user.tag,
          avatarUrl: member.user.displayAvatarURL({ extension: 'png', size: 256 }),
          createdTimestamp: member.user.createdTimestamp,
          joinRank: member.guild.memberCount
        }).catch(err => {
          console.error('[GIRIS LOG] Canvas generation failed:', err);
          return null;
        });

        const files = [];
        if (joinCardBuffer) {
          const attachment = new AttachmentBuilder(joinCardBuffer, { name: 'join-card.png' });
          files.push(attachment);
          logEmbed.setImage('attachment://join-card.png');
        }

        await logChannel.send({ embeds: [logEmbed], files }).catch(() => null);
      }
    }
  } catch (err) {
    console.error('[GIRIS LOG] GuildMemberAdd logu hatası:', err);
  }
});

// ─── ÇIKIŞ & KICK LOGU ───
client.on(Events.GuildMemberRemove, async (member) => {
  if (client.config?.loggingSystemEnabled === false) return;
  try {
    let isKick = false;
    let executorText = '';
    let reason = 'Belirtilmedi';

    const logEntry = await resolveAuditLogEntry(member.guild, AuditLogEvent.MemberKick, member.id);
    if (logEntry) {
      isKick = true;
      if (logEntry.executor) executorText = `${logEntry.executor} (\`${logEntry.executor.tag}\`)`;
      if (logEntry.reason) reason = logEntry.reason;
    }

    if (isKick) {
      const banLogChannelId = client.config?.banLogChannelIdEnabled !== false ? client.config?.banLogChannelId : null;
      if (!banLogChannelId) return;
      const logChannel = member.guild.channels.cache.get(banLogChannelId) || await member.guild.channels.fetch(banLogChannelId).catch(() => null);
      if (!logChannel?.isTextBased()) return;

      const logContainer = new ContainerBuilder()
        .setAccentColor(0xED4245)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## <:Cezaa:1507734141498818581> Sunucudan Atıldı (Kick)`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `> <:ye:1507732515585265825> **ᴀᴛıʟᴀɴ:** ${member} (\`${member.id}\`)\n` +
          `> <:mod:1507746579078053999> **ᴀᴛᴀɴ ʏᴇᴛᴋɪʟɪ:** ${executorText || 'Bilinmeyen Yetkili'}\n` +
          `> <:yldz:1506291961349537873> **ꜱᴇʙᴇᴘ:** ${reason}\n` +
          `> <a:TimerSand:1509704018199449680> **ᴛᴀʀɪʜ:** <t:${Math.floor(Date.now() / 1000)}:F>`
        ));

      const cleanExecutor = executorText.includes(' (') ? executorText.split(' (')[0] : executorText;
      const kickCardBuffer = await generateKickCard({
        username: member.user.tag,
        avatarUrl: member.user.displayAvatarURL({ extension: 'png', size: 256 }),
        executorTag: cleanExecutor,
        reason: reason,
        timestamp: Date.now()
      }).catch(err => {
        console.error('[KICK LOG] Canvas generation failed:', err);
        return null;
      });

      const files = [];
      if (kickCardBuffer) {
        logContainer
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
          .addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
              new MediaGalleryItemBuilder().setURL('attachment://kick-card.png')
            )
          );
        const attachment = new AttachmentBuilder(kickCardBuffer, { name: 'kick-card.png' });
        files.push(attachment);
      }

      logContainer
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Viqole Sunucu Log Sistemi`));

      await logChannel.send({ components: [logContainer], files, flags: MessageFlags.IsComponentsV2 }).catch(() => null);
    } else {
      const girisLogChannelId = client.config?.girisLogChannelIdEnabled !== false ? client.config?.girisLogChannelId : null;
      if (!girisLogChannelId) return;
      const logChannel = member.guild.channels.cache.get(girisLogChannelId) || await member.guild.channels.fetch(girisLogChannelId).catch(() => null);
      if (!logChannel?.isTextBased()) return;

      const logEmbed = new EmbedBuilder()
        .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL({ size: 64 }) })
        .setColor(0x99AAB5)
        .setTitle('📤 Sunucudan Ayrıldı')
        .setDescription(
          `**Kullanıcı:** ${member.user.tag} (\`${member.id}\`)\n` +
          `**Tarih:** <t:${Math.floor(Date.now() / 1000)}:F>`
        )
        .setFooter({ text: 'Viqole Sunucu Log Sistemi' });

      const leaveCardBuffer = await generateLeaveCanvas({
        username: member.user.tag,
        avatarUrl: member.user.displayAvatarURL({ extension: 'png', size: 256 }),
        userId: member.id,
        timestamp: Date.now()
      }).catch(err => {
        console.error('[CIKIS LOG] Canvas generation failed:', err);
        return null;
      });

      const files = [];
      if (leaveCardBuffer) {
        const attachment = new AttachmentBuilder(leaveCardBuffer, { name: 'leave-card.png' });
        files.push(attachment);
        logEmbed.setImage('attachment://leave-card.png');
      }

      await logChannel.send({ embeds: [logEmbed], files }).catch(() => null);
    }
  } catch (err) {
    console.error('[GIRIS LOG] GuildMemberRemove logu hatası:', err);
  }
});

// ─── MESAJ SİLME LOGU & KORUNAN LOG KURTARMA (mesaj-log) ───
client.on(Events.MessageDelete, async (message) => {
  if (client.config?.loggingSystemEnabled === false) return;
  try {
    if (!message.guild) return;

    // 1) Sadece veritabanında (protected_logs) kayıtlı olan gerçek loglar kurtarılır
    const protectedLog = getProtectedLog(message.id);
    if (protectedLog) {
      const channel = message.channel || await message.guild.channels.fetch(protectedLog.channelId).catch(() => null);
      if (!channel?.isTextBased()) {
        deleteProtectedLog(message.id);
        return;
      }

      // Denetim kaydından (Audit Log) mesajı kimin sildiğini tespit et
      let executorText = 'bir yetkili';
      let executorId = null;
      try {
        for (let attempt = 0; attempt < 5; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 300));
          const fetchedLogs = await message.guild.fetchAuditLogs({
            limit: 10,
            type: AuditLogEvent.MessageDelete
          }).catch(() => null);

          if (fetchedLogs) {
            const logEntry = fetchedLogs.entries.find(entry =>
              (entry.target?.id === client.user.id || !entry.target) &&
              entry.extra?.channel?.id === message.channelId &&
              entry.createdTimestamp > Date.now() - 15000
            );

            if (logEntry?.executor) {
              executorId = logEntry.executor.id;
              executorText = `<@${logEntry.executor.id}>`;
              break;
            }
          }
        }
      } catch (err) {
        console.error('[LOG RECOVERY] Audit log fetch error:', err);
      }

      // Eğer bot kendisi sildiyse (temizleme vb.) tekrar gönderme
      if (executorId === client.user.id) {
        deleteProtectedLog(message.id);
        return;
      }

      const warningText = `⚠️ **Bu log ${executorText} tarafından silinmişti ancak kurtarıldı!**`;
      const savedData = protectedLog.data || {};
      const sendPayload = {
        allowedMentions: { parse: [] }
      };

      // Embeds yapılandırması
      if (savedData.embeds && Array.isArray(savedData.embeds) && savedData.embeds.length > 0) {
        sendPayload.embeds = savedData.embeds.map((emb, idx) => {
          const embedBuilder = EmbedBuilder.from(emb);
          if (idx === 0) {
            let desc = embedBuilder.data.description || '';
            desc = desc
              .replace(/\n\n⚠️ \*\*Bu log .*? tarafından silinmişti ancak kurtarıldı!\*\*/gi, '')
              .replace(/\n\n⚠️ \*\*Bu log .*? tarafından silinmişti, sistem tarafından kurtarıldı\.\*\*/gi, '')
              .replace(/\n\n⚠️ Bu log .*? tarafından silinmişti, sistem tarafından kurtarıldı\./gi, '')
              .trim();
            embedBuilder.setDescription((desc ? desc + '\n\n' : '') + warningText);
          }
          return embedBuilder;
        });
      }

      // Components V2 / ContainerBuilder yapılandırması
      if (savedData.components && Array.isArray(savedData.components) && savedData.components.length > 0) {
        try {
          const containerJson = JSON.parse(JSON.stringify(savedData.components[0]));
          if (containerJson.components && Array.isArray(containerJson.components)) {
            // Önceki kurtarma uyarılarını temizle
            containerJson.components = containerJson.components.filter(c =>
              !(c.type === 10 && typeof c.content === 'string' && c.content.includes('tarafından silinmişti'))
            );
            // En başa kurtarma uyarısı bileşenini ekle
            containerJson.components.unshift({
              type: 10, // TextDisplay
              content: warningText
            }, {
              type: 14, // Separator
              divider: true,
              spacing: 1
            });
          }
          sendPayload.components = [containerJson];
          if (savedData.flags) sendPayload.flags = savedData.flags;
        } catch (compErr) {
          sendPayload.components = savedData.components;
          if (savedData.flags) sendPayload.flags = savedData.flags;
        }
      }

      // Metin içeriği
      if (savedData.content) {
        let content = savedData.content;
        content = content
          .replace(/\n\n⚠️ \*\*Bu log .*? tarafından silinmişti ancak kurtarıldı!\*\*/gi, '')
          .replace(/\n\n⚠️ \*\*Bu log .*? tarafından silinmişti, sistem tarafından kurtarıldı\.\*\*/gi, '')
          .replace(/\n\n⚠️ Bu log .*? tarafından silinmişti, sistem tarafından kurtarıldı\./gi, '')
          .trim();
        sendPayload.content = (!sendPayload.embeds && !sendPayload.components)
          ? (content ? content + '\n\n' + warningText : warningText)
          : content;
      } else if (!sendPayload.embeds && !sendPayload.components) {
        sendPayload.content = warningText;
      }

      // Dosya ekleri
      if (savedData.attachments && Array.isArray(savedData.attachments) && savedData.attachments.length > 0) {
        sendPayload.files = savedData.attachments.map(a => a.url);
      }

      const recoveredMsg = await channel.send(sendPayload).catch(err => {
        console.error('[LOG RECOVERY] Log mesajı tekrar gönderilemedi:', err);
        return null;
      });

      if (recoveredMsg) {
        deleteProtectedLog(message.id);
        registerMessageAsLog(recoveredMsg, protectedLog.logType || 'log');
      }
      return;
    }

    // 2) Korunan log DEĞİLSE: Normal kullanıcı mesajı silinme logu (mesaj-log)
    if (message.author?.bot) return;
    if (!message.content && message.attachments.size === 0) return;

    const logChannelId = client.config?.messageLogChannelIdEnabled !== false ? client.config?.messageLogChannelId : null;
    if (!logChannelId) return;
    const logChannel = message.guild.channels.cache.get(logChannelId) || await message.guild.channels.fetch(logChannelId).catch(() => null);
    if (!logChannel?.isTextBased()) return;

    const author = message.author;
    const unix = Math.floor(Date.now() / 1000);
    const content = message.content || '*[Metin yok]*';

    const logEmbed = new EmbedBuilder()
      .setColor(0xED4245)
      .setDescription(
        `${author ? `<@${author.id}>` : 'Bilinmeyen Kullanıcı'}\n` +
        `-# ${author?.id || 'Bilinmeyen'}\n` +
        `> <#${message.channelId}> kanalında bir mesaj silindi`
      )
      .addFields(
        { name: 'Mesaj İçeriği', value: content.length > 1024 ? content.slice(0, 1021) + '...' : content },
        { name: 'Mesaj Kanalı', value: `<#${message.channelId}>`, inline: true },
        { name: 'Silinme Zamanı', value: `<t:${unix}:F>`, inline: true }
      )
      .setAuthor(author ? { name: author.tag, iconURL: author.displayAvatarURL({ size: 64 }) } : { name: 'Bilinmeyen Kullanıcı' })
      .setFooter({ text: 'Viqole Bot`s' });

    await logChannel.send({ embeds: [logEmbed] }).catch(err => console.error('Mesaj silme log hatası:', err));
  } catch (err) {
    console.error('[MESAJ LOG] Silme logu hatası:', err);
  }
});

// ─── MESAJ DÜZENLEME LOGU (mesaj-log) ───
client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
  if (client.config?.loggingSystemEnabled === false) return;
  try {
    if (!newMessage.guild) return;
    if (newMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return;

    const logChannelId = client.config?.messageLogChannelIdEnabled !== false ? client.config?.messageLogChannelId : null;
    if (!logChannelId) return;
    const logChannel = newMessage.guild.channels.cache.get(logChannelId) || await newMessage.guild.channels.fetch(logChannelId).catch(() => null);
    if (!logChannel?.isTextBased()) return;

    const author = newMessage.author;
    const unix = Math.floor(Date.now() / 1000);
    const oldContent = oldMessage.content || '*[Yok]*';
    const newContent = newMessage.content || '*[Yok]*';

    const formatDiffLines = (text, prefix) => {
      const content = text || '*[Yok]*';
      const maxLength = 950;
      const truncated = content.length > maxLength ? content.slice(0, maxLength) + '...' : content;
      return `\`\`\`diff\n${truncated.split('\n').map(line => `${prefix} ${line}`).join('\n')}\n\`\`\``;
    };

    const oldFormatted = formatDiffLines(oldContent, '-');
    const newFormatted = formatDiffLines(newContent, '+');

    const embed = new EmbedBuilder()
      .setColor(0xF1C40F)
      .setDescription(
        `${author ? `<@${author.id}>` : 'Bilinmeyen Kullanıcı'}\n` +
        `-# ${author?.id || 'Bilinmeyen'}\n` +
        `> <#${newMessage.channelId}> kanalında bir mesaj düzenlendi`
      )
      .addFields(
        { name: 'Eski Mesaj İçeriği', value: oldFormatted },
        { name: 'Yeni Mesaj İçeriği', value: newFormatted },
        { name: 'Mesaj Kanalı', value: `<#${newMessage.channelId}>`, inline: true },
        { name: 'Düzenlenme Zamanı', value: `<t:${unix}:F>`, inline: true }
      )
      .setAuthor(author ? { name: author.tag, iconURL: author.displayAvatarURL({ size: 64 }) } : { name: 'Bilinmeyen Kullanıcı' })
      .setURL(newMessage.url)
      .setFooter({ text: 'Viqole Bot`s' });

    await logChannel.send({ embeds: [embed] }).catch(err => console.error('Mesaj düzenleme log hatası:', err));
  } catch (err) {
    console.error('[MESAJ LOG] Düzenleme logu hatası:', err);
  }
});

// ─── SAĞ TIKLAMA BAN LOGU (ban-log) ───
const recentBotBans = new Set();
client.recentBotBans = recentBotBans;
const recentBansData = new Map();
client.recentBansData = recentBansData;
const recentBotUnbans = new Set();
client.recentBotUnbans = recentBotUnbans;

client.on(Events.GuildBanAdd, async (ban) => {
  if (client.config?.loggingSystemEnabled === false) return;
  try {
    if (recentBotBans.has(ban.user.id)) return;

    const logChannelId = client.config?.banLogChannelIdEnabled !== false ? client.config?.banLogChannelId : null;
    if (!logChannelId) return;
    const logChannel = ban.guild.channels.cache.get(logChannelId) || await ban.guild.channels.fetch(logChannelId).catch(() => null);
    if (!logChannel?.isTextBased()) return;

    const unix = Math.floor(Date.now() / 1000);
    let executorText = 'Bilinmeyen Yetkili';
    let reason = ban.reason || 'Belirtilmedi';
    let isBotBan = false;

    // Önce hafıza önbelleğindeki ban verilerine bak (Race condition önlemek için)
    const recentBan = client.recentBansData?.get(ban.user.id);
    if (recentBan) {
      isBotBan = true;
      executorText = `<@${recentBan.moderatorId}> (\`${recentBan.moderatorTag}\`)`;
      reason = recentBan.reason;
      client.recentBansData.delete(ban.user.id);
    } else {
      const logEntry = await resolveAuditLogEntry(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
      if (logEntry) {
        if (logEntry.executor) {
          if (logEntry.executor.id === client.user.id) {
            isBotBan = true;
          } else {
            executorText = `${logEntry.executor} (\`${logEntry.executor.tag}\`)`;
          }
        }
        if (logEntry.reason) reason = logEntry.reason;
      }
    }

    if (isBotBan && !recentBan) {
      const { loadBans } = await import('./db.js');
      const dbBans = loadBans();
      const dbBan = dbBans.find(b => b.userId === ban.user.id);
      if (dbBan) {
        executorText = `<@${dbBan.moderatorId}> (\`${dbBan.moderatorTag}\`)`;
        reason = dbBan.reason || reason;
      } else {
        if (reason.includes(' | Yetkili: ')) {
          const parts = reason.split(' | Yetkili: ');
          executorText = `${parts[1]}`;
          reason = parts[0];
        } else if (reason.includes(' | Forceban Yetkili: ')) {
          const parts = reason.split(' | Forceban Yetkili: ');
          executorText = `${parts[1]}`;
          reason = parts[0];
        } else {
          executorText = `Bilinmeyen Yetkili`;
        }
      }
    }

    const logContainer = new ContainerBuilder()
      .setAccentColor(0xED4245)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## <:Cezaa:1507734141498818581> Kullanıcı Yasaklandı`))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `> <:yasak:1506291988880953374> **ʏᴀꜱᴀᴋʟᴀɴᴀɴ:** ${ban.user} (\`${ban.user.id}\`)\n` +
        `> <:mod:1507746579078053999> **ʏᴀꜱᴀᴋʟᴀʏᴀɴ:** ${executorText}\n` +
        `> <:yldz:1506291961349537873> **ꜱᴇʙᴇᴘ:** ${reason}\n` +
        `> <a:TimerSand:1509704018199449680> **ᴛᴀʀɪʜ:** <t:${unix}:F>`
      ));

    const cleanExecutor = executorText.includes(' (') ? executorText.split(' (')[0] : executorText;
    const banCardBuffer = await generateBanCard({
      username: ban.user.tag,
      avatarUrl: ban.user.displayAvatarURL({ extension: 'png', size: 256 }),
      executorTag: cleanExecutor,
      reason: reason,
      timestamp: Date.now()
    }).catch(err => {
      console.error('[BAN LOG] Canvas generation failed:', err);
      return null;
    });

    const files = [];
    if (banCardBuffer) {
      logContainer
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addMediaGalleryComponents(
          new MediaGalleryBuilder().addItems(
            new MediaGalleryItemBuilder().setURL('attachment://ban-card.png')
          )
        );
      const attachment = new AttachmentBuilder(banCardBuffer, { name: 'ban-card.png' });
      files.push(attachment);
    }

    logContainer
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Viqole Sunucu Log Sistemi`));

    await logChannel.send({ components: [logContainer], files, flags: MessageFlags.IsComponentsV2 }).catch(() => null);
  } catch (err) {
    console.error('[BAN LOG] GuildBanAdd logu hatası:', err);
  }
});

// ─── SAĞ TIKLAMA UNBAN LOGU (ban-log) ───
client.on(Events.GuildBanRemove, async (ban) => {
  if (client.config?.loggingSystemEnabled === false) return;
  try {
    if (recentBotUnbans.has(ban.user.id)) return;

    const logChannelId = client.config?.banLogChannelIdEnabled !== false ? (client.config?.banLogChannelId || client.config?.unbanLogChannelId) : null;
    if (!logChannelId) return;
    const logChannel = ban.guild.channels.cache.get(logChannelId) || await ban.guild.channels.fetch(logChannelId).catch(() => null);
    if (!logChannel?.isTextBased()) return;

    const unix = Math.floor(Date.now() / 1000);
    let executorText = 'Bilinmeyen Yetkili';
    let reason = 'Belirtilmedi';

    const logEntry = await resolveAuditLogEntry(ban.guild, AuditLogEvent.MemberBanRemove, ban.user.id);
    if (logEntry) {
      if (logEntry.executor) executorText = `${logEntry.executor} (\`${logEntry.executor.tag}\`)`;
      if (logEntry.reason) reason = logEntry.reason;
    }

    const logContainer = new ContainerBuilder()
      .setAccentColor(0x57F287)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## <:animemutlu:1507997747180077137> Kullanıcı Yasağı Kaldırıldı`))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `> <:ye:1507732515585265825> **ʏᴀꜱᴀɢı ᴋᴀʟᴅıʀıʟᴀɴ:** ${ban.user} (\`${ban.user.id}\`)\n` +
        `> <:mod:1507746579078053999> **ᴋᴀʟᴅıʀᴀɴ ʏᴇᴛᴋɪʟɪ:** ${executorText}\n` +
        `> <:yldz:1506291961349537873> **ꜱᴇʙᴇᴘ:** ${reason}\n` +
        `> <a:TimerSand:1509704018199449680> **ᴛᴀʀɪʜ:** <t:${unix}:F>`
      ));

    const cleanExecutor = executorText.includes(' (') ? executorText.split(' (')[0] : executorText;
    const unbanCardBuffer = await generateUnbanCard({
      username: ban.user.tag,
      avatarUrl: ban.user.displayAvatarURL({ extension: 'png', size: 256 }),
      executorTag: cleanExecutor,
      reason: reason,
      timestamp: Date.now()
    }).catch(err => {
      console.error('[UNBAN LOG] Canvas generation failed:', err);
      return null;
    });

    const files = [];
    if (unbanCardBuffer) {
      logContainer
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addMediaGalleryComponents(
          new MediaGalleryBuilder().addItems(
            new MediaGalleryItemBuilder().setURL('attachment://unban-card.png')
          )
        );
      const attachment = new AttachmentBuilder(unbanCardBuffer, { name: 'unban-card.png' });
      files.push(attachment);
    }

    logContainer
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Viqole Sunucu Log Sistemi`));

    await logChannel.send({ components: [logContainer], files, flags: MessageFlags.IsComponentsV2 }).catch(() => null);
  } catch (err) {
    console.error('[BAN LOG] GuildBanRemove logu hatası:', err);
  }
});

// ─── ROL OLUŞTURULMA LOGU (rol-log) ───
client.on(Events.RoleCreate, async (role) => {
  if (client.config?.loggingSystemEnabled === false) return;
  try {
    const roleLogChannelId = client.config?.roleLogChannelIdEnabled !== false ? client.config?.roleLogChannelId : null;
    if (!roleLogChannelId) return;
    const logChannel = role.guild.channels.cache.get(roleLogChannelId) || await role.guild.channels.fetch(roleLogChannelId).catch(() => null);
    if (!logChannel?.isTextBased()) return;

    let executorText = 'Bilinmeyen Yetkili';
    const logEntry = await resolveAuditLogEntry(role.guild, AuditLogEvent.RoleCreate, role.id);
    if (logEntry && logEntry.executor) {
      executorText = `${logEntry.executor} (\`${logEntry.executor.tag}\`)`;
    }

    const logEmbed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('➕ Rol Oluşturuldu')
      .setDescription(
        `**Rol:** ${role} (\`${role.name}\` - \`${role.id}\`)\n` +
        `**Oluşturan:** ${executorText}\n` +
        `**Renk:** \`${role.hexColor}\`\n` +
        `**Tarih:** <t:${Math.floor(Date.now() / 1000)}:F>`
      )
      .setFooter({ text: 'Viqole Sunucu Log Sistemi' });

    await logChannel.send({ embeds: [logEmbed] }).catch(() => null);
  } catch (err) {
    console.error('[ROLE LOG] RoleCreate logu hatası:', err);
  }
});

// ─── ROL SİLİNME LOGU (rol-log) ───
client.on(Events.RoleDelete, async (role) => {
  if (client.config?.loggingSystemEnabled === false) return;
  try {
    const roleLogChannelId = client.config?.roleLogChannelIdEnabled !== false ? client.config?.roleLogChannelId : null;
    if (!roleLogChannelId) return;
    const logChannel = role.guild.channels.cache.get(roleLogChannelId) || await role.guild.channels.fetch(roleLogChannelId).catch(() => null);
    if (!logChannel?.isTextBased()) return;

    let executorText = 'Bilinmeyen Yetkili';
    const logEntry = await resolveAuditLogEntry(role.guild, AuditLogEvent.RoleDelete, role.id);
    if (logEntry && logEntry.executor) {
      executorText = `${logEntry.executor} (\`${logEntry.executor.tag}\`)`;
    }

    const logEmbed = new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle('❌ Rol Silindi')
      .setDescription(
        `**Silinen Rol:** \`${role.name}\` (\`${role.id}\`)\n` +
        `**Silen:** ${executorText}\n` +
        `**Tarih:** <t:${Math.floor(Date.now() / 1000)}:F>`
      )
      .setFooter({ text: 'Viqole Sunucu Log Sistemi' });

    await logChannel.send({ embeds: [logEmbed] }).catch(() => null);
  } catch (err) {
    console.error('[ROLE LOG] RoleDelete logu hatası:', err);
  }
});

// ─── ROL GÜNCELLEME LOGU (rol-log) ───
client.on(Events.RoleUpdate, async (oldRole, newRole) => {
  if (client.config?.loggingSystemEnabled === false) return;
  try {
    const roleLogChannelId = client.config?.roleLogChannelIdEnabled !== false ? client.config?.roleLogChannelId : null;
    if (!roleLogChannelId) return;
    const logChannel = newRole.guild.channels.cache.get(roleLogChannelId) || await newRole.guild.channels.fetch(roleLogChannelId).catch(() => null);
    if (!logChannel?.isTextBased()) return;

    const diffBlocks = [];
    if (oldRole.name !== newRole.name) {
      diffBlocks.push(`Eski İsim:\n- ${oldRole.name}\n\nYeni İsim:\n+ ${newRole.name}`);
    }
    if (oldRole.hexColor !== newRole.hexColor) {
      diffBlocks.push(`Eski Renk:\n- ${oldRole.hexColor}\n\nYeni Renk:\n+ ${newRole.hexColor}`);
    }
    if (oldRole.hoist !== newRole.hoist) {
      diffBlocks.push(`Eski Ayrı Göster:\n- ${oldRole.hoist ? 'Evet' : 'Hayır'}\n\nYeni Ayrı Göster:\n+ ${newRole.hoist ? 'Evet' : 'Hayır'}`);
    }
    if (oldRole.mentionable !== newRole.mentionable) {
      diffBlocks.push(`Eski Bahsedilebilir:\n- ${oldRole.mentionable ? 'Evet' : 'Hayır'}\n\nYeni Bahsedilebilir:\n+ ${newRole.mentionable ? 'Evet' : 'Hayır'}`);
    }
    if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) {
      const oldPerms = oldRole.permissions.toArray();
      const newPerms = newRole.permissions.toArray();

      const addedPerms = newPerms.filter(p => !oldPerms.includes(p));
      const removedPerms = oldPerms.filter(p => !newPerms.includes(p));

      const permDiffs = [];
      for (const p of addedPerms) {
        permDiffs.push(`+ Eklendi: ${p}`);
      }
      for (const p of removedPerms) {
        permDiffs.push(`- Kaldırıldı: ${p}`);
      }

      if (permDiffs.length > 0) {
        diffBlocks.push(`Rol İzin Değişikliği:\n${permDiffs.join('\n')}`);
      }
    }

    if (diffBlocks.length === 0) return;

    let executorText = 'Bilinmeyen Yetkili';
    const logEntry = await resolveAuditLogEntry(newRole.guild, AuditLogEvent.RoleUpdate, newRole.id);
    if (logEntry && logEntry.executor) {
      executorText = `${logEntry.executor} (\`${logEntry.executor.tag}\`)`;
    }

    const diffContent = `\`\`\`diff\n${diffBlocks.join('\n\n')}\n\`\`\``;

    const logEmbed = new EmbedBuilder()
      .setColor(0xF1C40F)
      .setTitle('📝 Rol Güncellendi')
      .setDescription(
        `**Rol:** ${newRole} (\`${newRole.name}\` - \`${newRole.id}\`)\n` +
        `**Güncelleyen:** ${executorText}\n\n` +
        `**Değişiklikler:**\n${diffContent}\n\n` +
        `**Tarih:** <t:${Math.floor(Date.now() / 1000)}:F>`
      )
      .setFooter({ text: 'Viqole Sunucu Log Sistemi' });

    await logChannel.send({ embeds: [logEmbed] }).catch(() => null);
  } catch (err) {
    console.error('[ROLE LOG] RoleUpdate logu hatası:', err);
  }
});

// ─── DAVET OLUŞTURULMA LOGU (davet-log) ───
client.on(Events.InviteCreate, async (invite) => {
  if (client.config?.loggingSystemEnabled === false) return;
  try {
    const davetLogChannelId = client.config?.davetLogChannelIdEnabled !== false ? client.config?.davetLogChannelId : null;
    const logChannel = (davetLogChannelId ? (invite.guild.channels.cache.get(davetLogChannelId) || await invite.guild.channels.fetch(davetLogChannelId).catch(() => null)) : null)
      || invite.guild.channels.cache.find(c => c.name === 'davet-log');
    if (!logChannel?.isTextBased()) return;

    const creator = invite.inviter;
    const unix = Math.floor(Date.now() / 1000);

    const logEmbed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('✉️ Davet Oluşturuldu')
      .setDescription(
        `**Davet Kodu:** \`${invite.code}\`\n` +
        `**Oluşturan:** ${creator ? `${creator} (\`${creator.tag}\` - \`${creator.id}\`)` : 'Bilinmiyor'}\n` +
        `**Kanal:** <#${invite.channelId}> (\`${invite.channelId}\`)\n` +
        `**Maksimum Kullanım:** \`${invite.maxUses === 0 ? 'Sınırsız' : invite.maxUses}\`\n` +
        `**Geçerlilik Süresi:** \`${invite.maxAge === 0 ? 'Sınırsız' : `${Math.floor(invite.maxAge / 60)} dakika`}\`\n` +
        `**Tarih:** <t:${unix}:F>`
      )
      .setFooter({ text: 'Viqole Sunucu Log Sistemi' });

    await logChannel.send({ embeds: [logEmbed] }).catch(() => null);
  } catch (err) {
    console.error('[DAVET LOG] InviteCreate logu hatası:', err);
  }
});

// ─── DAVET SİLİNME LOGU (davet-log) ───
client.on(Events.InviteDelete, async (invite) => {
  if (client.config?.loggingSystemEnabled === false) return;
  try {
    const davetLogChannelId = client.config?.davetLogChannelIdEnabled !== false ? client.config?.davetLogChannelId : null;
    const logChannel = (davetLogChannelId ? (invite.guild.channels.cache.get(davetLogChannelId) || await invite.guild.channels.fetch(davetLogChannelId).catch(() => null)) : null)
      || invite.guild.channels.cache.find(c => c.name === 'davet-log');
    if (!logChannel?.isTextBased()) return;

    const unix = Math.floor(Date.now() / 1000);

    const logEmbed = new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle('❌ Davet Silindi')
      .setDescription(
        `**Davet Kodu:** \`${invite.code}\`\n` +
        `**Kanal:** <#${invite.channelId}> (\`${invite.channelId}\`)\n` +
        `**Tarih:** <t:${unix}:F>`
      )
      .setFooter({ text: 'Viqole Sunucu Log Sistemi' });

    await logChannel.send({ embeds: [logEmbed] }).catch(() => null);
  } catch (err) {
    console.error('[DAVET LOG] InviteDelete logu hatası:', err);
  }
});

// ─── KANAL OLUŞTURULMA LOGU (kanal-log) ───
client.on(Events.ChannelCreate, async (channel) => {
  if (client.config?.loggingSystemEnabled === false) return;
  try {
    if (!channel.guild) return;
    const kanalLogChannelId = client.config?.kanalLogChannelIdEnabled !== false ? client.config?.kanalLogChannelId : null;
    if (!kanalLogChannelId) return;
    const logChannel = channel.guild.channels.cache.get(kanalLogChannelId) || await channel.guild.channels.fetch(kanalLogChannelId).catch(() => null);
    if (!logChannel?.isTextBased()) return;

    let executorText = 'Bilinmeyen Yetkili';
    let executorUser = null;
    const logEntry = await resolveAuditLogEntry(channel.guild, AuditLogEvent.ChannelCreate, channel.id);
    if (logEntry && logEntry.executor) {
      executorText = `${logEntry.executor}`;
      executorUser = logEntry.executor;
    }

    const typeMap = {
      0: 'Metin Kanalı',
      2: 'Ses Kanalı',
      4: 'Kategori',
      5: 'Duyuru Kanalı',
      13: 'Sahne Kanalı',
      15: 'Forum Kanalı'
    };
    const channelTypeStr = typeMap[channel.type] || 'Bilinmeyen Tür';
    const unix = Math.floor(Date.now() / 1000);

    const authorOptions = executorUser
      ? { name: executorUser.username, iconURL: executorUser.displayAvatarURL({ size: 64 }) }
      : { name: 'Bilinmeyen Yetkili' };

    const logEmbed = new EmbedBuilder()
      .setColor(0x57F287)
      .setAuthor(authorOptions)
      .setDescription(
        `<a:unlem:1517808455099088916> ・ *Bir yetkili tarafından | ${channel.name} | ${channel.id} | isimli kanal oluşturuldu.*\n\n` +
        `<:mod:1507746579078053999> ・ **ʏᴇᴛᴋɪʟɪ:** ${executorText}\n` +
        `<a:coffe:1517808496748527726> ・ **ᴋᴀɴᴀʟ:** ${channel}\n\n` +
        `🔹 ・ **ᴋᴀɴᴀʟ ᴛᴜʀᴜ:** ${channelTypeStr}\n\n` +
        `<t:${unix}:f>`
      )
      .setFooter({ text: 'Viqole Sunucu Log Sistemi' });

    await logChannel.send({ embeds: [logEmbed] }).catch(() => null);
  } catch (err) {
    console.error('[KANAL LOG] ChannelCreate logu hatası:', err);
  }
});

// ─── KANAL SİLİNME LOGU (kanal-log) ───
client.on(Events.ChannelDelete, async (channel) => {
  if (client.config?.loggingSystemEnabled === false) return;
  try {
    if (!channel.guild) return;
    const kanalLogChannelId = client.config?.kanalLogChannelIdEnabled !== false ? client.config?.kanalLogChannelId : null;
    if (!kanalLogChannelId) return;
    const logChannel = channel.guild.channels.cache.get(kanalLogChannelId) || await channel.guild.channels.fetch(kanalLogChannelId).catch(() => null);
    if (!logChannel?.isTextBased()) return;

    let executorText = 'Bilinmeyen Yetkili';
    let executorUser = null;
    const logEntry = await resolveAuditLogEntry(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
    if (logEntry && logEntry.executor) {
      executorText = `${logEntry.executor}`;
      executorUser = logEntry.executor;
    }

    const typeMap = {
      0: 'Metin Kanalı',
      2: 'Ses Kanalı',
      4: 'Kategori',
      5: 'Duyuru Kanalı',
      13: 'Sahne Kanalı',
      15: 'Forum Kanalı'
    };
    const channelTypeStr = typeMap[channel.type] || 'Bilinmeyen Tür';
    const unix = Math.floor(Date.now() / 1000);

    const authorOptions = executorUser
      ? { name: executorUser.username, iconURL: executorUser.displayAvatarURL({ size: 64 }) }
      : { name: 'Bilinmeyen Yetkili' };

    const logEmbed = new EmbedBuilder()
      .setColor(0xED4245)
      .setAuthor(authorOptions)
      .setDescription(
        `<a:unlem:1517808455099088916> ・ *Bir yetkili tarafından | ${channel.name} | ${channel.id} | isimli kanal silindi.*\n\n` +
        `<:mod:1507746579078053999> ・ **ʏᴇᴛᴋɪʟɪ:** ${executorText}\n\n` +
        `<a:coffe:1517808496748527726> ・ **ᴋᴀɴᴀʟ ᴛᴜʀᴜ:** ${channelTypeStr}\n\n` +
        `<t:${unix}:f>`
      )
      .setFooter({ text: 'Viqole Sunucu Log Sistemi' });

    await logChannel.send({ embeds: [logEmbed] }).catch(() => null);
  } catch (err) {
    console.error('[KANAL LOG] ChannelDelete logu hatası:', err);
  }
});

// ─── KANAL GÜNCELLEME LOGU (kanal-log) ───
const permissionNamesTr = {
  CreateInstantInvite: 'Davet Oluştur',
  KickMembers: 'Üyeleri At',
  BanMembers: 'Üyeleri Yasakla',
  Administrator: 'Yönetici',
  ManageChannels: 'Kanalları Yönet',
  ManageGuild: 'Sunucuyu Yönet',
  AddReactions: 'Tepki Ekle',
  ViewAuditLog: 'Denetim Kaydını Görüntüle',
  PrioritySpeaker: 'Öncelikli Konuşmacı',
  Stream: 'Yayın Aç',
  ViewChannel: 'Kanalı Görüntüle',
  SendMessages: 'Mesaj Gönder',
  SendTTSMessages: 'Metin Okuma Mesajı Gönder',
  ManageMessages: 'Mesajları Yönet',
  EmbedLinks: 'Bağlantı Yerleştir',
  AttachFiles: 'Dosya Ekle',
  ReadMessageHistory: 'Mesaj Geçmişini Oku',
  MentionEveryone: 'Herkesi Etiketle',
  UseExternalEmojis: 'Harici Emojiler Kullan',
  ViewGuildInsights: 'Sunucu İpuçlarını Görüntüle',
  Connect: 'Bağlan',
  Speak: 'Konuş',
  MuteMembers: 'Üyeleri Sustur',
  DeafenMembers: 'Üyelerin Sesini Kapat',
  MoveMembers: 'Üyeleri Taşı',
  UseVAD: 'Ses Eylemini Kullan',
  ChangeNickname: 'Kullanıcı Adı Değiştir',
  ManageNicknames: 'Kullanıcı Adlarını Yönet',
  ManageRoles: 'Rolleri Yönet',
  ManageWebhooks: 'Web-kancalarını Yönet',
  ManageGuildExpressions: 'Sunucu İfadelerini Yönet',
  UseApplicationCommands: 'Uygulama Komutlarını Kullan',
  RequestToSpeak: 'Konuşma Talebi Et',
  ManageEvents: 'Etkinlikleri Yönet',
  ManageThreads: 'Başlıkları Yönet',
  CreatePublicThreads: 'Genel Başlıklar Oluştur',
  CreatePrivateThreads: 'Özel Başlıklar Oluştur',
  UseExternalStickers: 'Harici Çıkartmalar Kullan',
  SendMessagesInThreads: 'Başlıklarda Mesaj Gönder',
  UseEmbeddedActivities: 'Etkinlikleri Kullan',
  ModerateMembers: 'Üyeleri Zamanaşımına Uğrat',
  ViewCreatorMonetizationAnalytics: 'İçerik Oluşturucu Analizlerini Görüntüle',
  UseSoundboard: 'Ses Tahtasını Kullan',
  UseExternalSounds: 'Harici Sesler Kullan',
  SendVoiceMessages: 'Sesli Mesaj Gönder'
};

client.on(Events.ChannelUpdate, async (oldChannel, newChannel) => {
  if (client.config?.loggingSystemEnabled === false) return;
  try {
    if (!newChannel.guild) return;
    const kanalLogChannelId = client.config?.kanalLogChannelIdEnabled !== false ? client.config?.kanalLogChannelId : null;
    if (!kanalLogChannelId) return;
    const logChannel = newChannel.guild.channels.cache.get(kanalLogChannelId) || await newChannel.guild.channels.fetch(kanalLogChannelId).catch(() => null);
    if (!logChannel?.isTextBased()) return;

    const diffBlocks = [];
    let isNameChanged = false;
    if (oldChannel.name !== newChannel.name) {
      diffBlocks.push(`Eski İsim:\n- ${oldChannel.name}\n\nYeni İsim:\n+ ${newChannel.name}`);
      isNameChanged = true;
    }
    if (oldChannel.topic !== newChannel.topic) {
      diffBlocks.push(`Eski Konu:\n- ${oldChannel.topic || '[Yok]'}\n\nYeni Konu:\n+ ${newChannel.topic || '[Yok]'}`);
    }
    if (oldChannel.nsfw !== newChannel.nsfw) {
      diffBlocks.push(`Eski NSFW:\n- ${oldChannel.nsfw ? 'Evet' : 'Hayır'}\n\nYeni NSFW:\n+ ${newChannel.nsfw ? 'Evet' : 'Hayır'}`);
    }
    if (!oldChannel.permissionOverwrites.cache.equals(newChannel.permissionOverwrites.cache)) {
      const pDiffs = [];
      const oldCache = oldChannel.permissionOverwrites.cache;
      const newCache = newChannel.permissionOverwrites.cache;

      for (const [id, newOverwrite] of newCache) {
        const oldOverwrite = oldCache.get(id);
        const name = newChannel.guild.roles.cache.get(id)?.name || newChannel.guild.members.cache.get(id)?.user?.username || id;

        const localDiffs = [];
        for (const permKey of Object.keys(PermissionFlagsBits)) {
          let oldState = 'neutral';
          if (oldOverwrite) {
            if (oldOverwrite.allow.has(PermissionFlagsBits[permKey])) oldState = 'allow';
            else if (oldOverwrite.deny.has(PermissionFlagsBits[permKey])) oldState = 'deny';
          }

          let newState = 'neutral';
          if (newOverwrite.allow.has(PermissionFlagsBits[permKey])) newState = 'allow';
          else if (newOverwrite.deny.has(PermissionFlagsBits[permKey])) newState = 'deny';

          if (oldState !== newState) {
            const friendlyName = permissionNamesTr[permKey] || permKey;
            if (newState === 'allow') {
              localDiffs.push(`+ ${name} | ${friendlyName} (Açıldı)`);
            } else if (newState === 'deny') {
              localDiffs.push(`- ${name} | ${friendlyName} (Kapatıldı)`);
            } else if (newState === 'neutral') {
              if (oldState === 'allow') {
                localDiffs.push(`- ${name} | ${friendlyName} (Kapatıldı / Sıfırlandı)`);
              } else if (oldState === 'deny') {
                localDiffs.push(`+ ${name} | ${friendlyName} (Açıldı / Sıfırlandı)`);
              }
            }
          }
        }

        if (localDiffs.length > 0) {
          pDiffs.push(...localDiffs);
        }
      }

      for (const [id, oldOverwrite] of oldCache) {
        if (!newCache.has(id)) {
          const name = oldChannel.guild.roles.cache.get(id)?.name || oldChannel.guild.members.cache.get(id)?.user?.username || id;
          const localDiffs = [];
          for (const permKey of Object.keys(PermissionFlagsBits)) {
            let oldState = 'neutral';
            if (oldOverwrite.allow.has(PermissionFlagsBits[permKey])) oldState = 'allow';
            else if (oldOverwrite.deny.has(PermissionFlagsBits[permKey])) oldState = 'deny';

            if (oldState !== 'neutral') {
              const friendlyName = permissionNamesTr[permKey] || permKey;
              if (oldState === 'allow') {
                localDiffs.push(`- ${name} | ${friendlyName} (Kapatıldı / İzin Silindi)`);
              } else if (oldState === 'deny') {
                localDiffs.push(`+ ${name} | ${friendlyName} (Açıldı / Kısıtlama Silindi)`);
              }
            }
          }
          if (localDiffs.length > 0) {
            pDiffs.push(...localDiffs);
          }
        }
      }

      if (pDiffs.length > 0) {
        diffBlocks.push(`Kanal İzin Değişikliği:\n${pDiffs.join('\n')}`);
      }
    }

    if (diffBlocks.length === 0) return;

    let executorText = 'Bilinmeyen Yetkili';
    const logEntry = await resolveAuditLogEntry(newChannel.guild, AuditLogEvent.ChannelUpdate, newChannel.id);
    if (logEntry && logEntry.executor) {
      executorText = `${logEntry.executor} (\`${logEntry.executor.tag}\`)`;
    }

    const yetkiliEmoji = E.yetkili || '👤';
    const kanalEmoji = E.kanal || '#️⃣';
    const infoEmoji = '<a:unlem:1517808455099088916>';
    const diffContent = `\`\`\`diff\n${diffBlocks.join('\n\n')}\n\`\`\``;

    const description = isNameChanged
      ? `${infoEmoji} ・ Bir yetkili tarafından | ${oldChannel.name} | ${newChannel.id} | isimli kanalın ismi güncellendi.\n\n` +
      `${yetkiliEmoji} ・ ʏᴇᴛᴋɪʟɪ: ${executorText}\n` +
      `${kanalEmoji} ・ ᴋᴀɴᴀʟ: ${newChannel}\n\n` +
      `${diffContent}\n\n` +
      `**Tarih:** <t:${Math.floor(Date.now() / 1000)}:F>`
      : `**Kanal:** ${newChannel} (\`${newChannel.name}\` - \`${newChannel.id}\`)\n` +
      `**Güncelleyen:** ${executorText}\n\n` +
      `**Değişiklikler:**\n${diffContent}\n\n` +
      `**Tarih:** <t:${Math.floor(Date.now() / 1000)}:F>`;

    const logEmbed = new EmbedBuilder()
      .setColor(0xF1C40F)
      .setTitle('📝 Kanal Güncellendi')
      .setDescription(description)
      .setFooter({ text: 'Viqole Sunucu Log Sistemi' });

    await logChannel.send({ embeds: [logEmbed] }).catch(() => null);
  } catch (err) {
    console.error('[KANAL LOG] ChannelUpdate logu hatası:', err);
  }
});

// ─── PANELSİZ BAN AFFİ: MESAJ DİNLEYİCİ ───
client.on(Events.MessageCreate, async (message) => {
  try {
    if (message.author.bot) return;
    if (!message.guild) return;

    const guildCfg = getPanelSizBanAfGuild(message.guild.id);
    if (!guildCfg || !guildCfg.active) return;
    if (message.channel.id !== guildCfg.yazmaKanalId) return;

    // All-perm olan kişiler listeye eklenmez, mesajları silinmez, uyarı verilmez
    const allPermUsersStr = client.config?.allPermUsers || '';
    const allPermUsers = allPermUsersStr ? allPermUsersStr.split(',').map(id => id.trim()).filter(Boolean) : [];
    const allPermRolesStr = client.config?.allPermRoles || '';
    const allPermRoles = allPermRolesStr ? allPermRolesStr.split(',').map(id => id.trim()).filter(Boolean) : [];

    const member = message.guild.members.cache.get(message.author.id)
      || await message.guild.members.fetch(message.author.id).catch(() => null);

    let isAllPerm = false;
    if (allPermUsers.includes(message.author.id)) isAllPerm = true;
    if (!isAllPerm && member && allPermRoles.some(rId => Map.prototype.has.call(member.roles.cache, rId))) isAllPerm = true;

    if (isAllPerm) return; // Mesaj silinmez, uyarı verilmez, listeye eklenmez

    // Mesajı sil (temiz kalması için)
    await message.delete().catch(() => null);

    // Daha önce listede mi?
    const isAlreadyListed = guildCfg.entries?.some(e => e.userId === message.author.id);
    if (isAlreadyListed) {
      const warn = await message.channel.send(`❌ <@${message.author.id}>, ban affı listesinde zaten kayıtlısınız!`).catch(() => null);
      if (warn) setTimeout(() => warn.delete().catch(() => null), 5000);
      return;
    }

    if (!guildCfg.entries) guildCfg.entries = [];
    if (!guildCfg.yonetimMesajlari) guildCfg.yonetimMesajlari = {};

    // Kaydı ekle
    guildCfg.entries.push({ userId: message.author.id, reason: message.content });
    setPanelSizBanAfGuild(message.guild.id, guildCfg);

    // ── 1) Ban Listesi Kanalına tek liste mesajı gönder / güncelle ──
    const banListeKanalId = guildCfg.banListeKanalId;
    const banListeChannel = banListeKanalId
      ? (message.guild.channels.cache.get(banListeKanalId) || await message.guild.channels.fetch(banListeKanalId).catch(() => null))
      : null;

    if (banListeChannel?.isTextBased()) {
      const listLines = guildCfg.entries.map((e, i) =>
        `${i + 1}. <@${e.userId}> (\`${e.userId}\`) ${e.reason}`
      );
      const cikarButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('panelsiz_banaf_cikar')
          .setLabel('Çıkart')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('❌')
      );

      const existingMsgId = guildCfg.banAfListeMesajId;
      let listMsg = existingMsgId
        ? await banListeChannel.messages.fetch(existingMsgId).catch(() => null)
        : null;

      if (listMsg) {
        await listMsg.edit({ content: listLines.join('\n'), components: [cikarButton] }).catch(() => null);
      } else {
        listMsg = await banListeChannel.send({ content: listLines.join('\n'), components: [cikarButton] }).catch(() => null);
        if (listMsg) {
          guildCfg.banAfListeMesajId = listMsg.id;
          setPanelSizBanAfGuild(message.guild.id, guildCfg);
        }
      }
    }

    // ── 2) Ban affı yönetim kanalına kişi başına embed + Sil/Açıldı butonları ──
    const mgmtChannelId = client.config?.banAffiManagementChannelId;
    const mgmtChannel = mgmtChannelId
      ? (message.guild.channels.cache.get(mgmtChannelId) || await message.guild.channels.fetch(mgmtChannelId).catch(() => null))
      : null;

    if (mgmtChannel?.isTextBased()) {
      const buttonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`panelsiz_banaf_acildi_${message.author.id}`)
          .setLabel('Açıldı')
          .setStyle(ButtonStyle.Success)
          .setEmoji('✅'),
        new ButtonBuilder()
          .setCustomId(`panelsiz_banaf_sil_${message.author.id}`)
          .setLabel('Sil')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🗑️')
      );

      const mgmtContainer = new ContainerBuilder()
        .setAccentColor(0x3498db)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 📬 Yeni Ban Affı Talebi (Panelsiz)`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `> 👤 **Kullanıcı:** <@${message.author.id}> (\`${message.author.id}\`)\n` +
          `> 📝 **Sebep:** ${message.content}\n\n` +
          `\`\`\`\n${message.author.id} - ${message.content}\n\`\`\``
        ))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addActionRowComponents(buttonRow)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));

      const mgmtMsg = await mgmtChannel.send({ components: [mgmtContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => null);

      // Yönetim mesaj ID'sini kaydet (Çıkart ile silinebilsin)
      if (mgmtMsg) {
        guildCfg.yonetimMesajlari[message.author.id] = mgmtMsg.id;
        setPanelSizBanAfGuild(message.guild.id, guildCfg);
      }
    }

    // ── 3) Ban affı log kanalına log at ──
    const banAfLogChannelId = client.config?.banAfLogChannelIdEnabled !== false ? client.config?.banAfLogChannelId : null;
    if (banAfLogChannelId) {
      const logChannel = message.guild.channels.cache.get(banAfLogChannelId)
        || await message.guild.channels.fetch(banAfLogChannelId).catch(() => null);
      if (logChannel?.isTextBased()) {
        const logContainer = new ContainerBuilder()
          .setAccentColor(0x5865F2)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## <:Cezaa:1507734141498818581> Panelsiz Ban Affı Kaydı`))
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `> 👤 **Kişi:** <@${message.author.id}> (\`${message.author.tag}\`)\n` +
            `> 📝 **Sebep:** ${message.content}\n` +
            `> 📅 **Tarih:** <t:${Math.floor(Date.now() / 1000)}:F>`
          ))
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
          .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));
        await logChannel.send({ components: [logContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
      }
    }
  } catch (err) {
    console.error('[PANELSIZ BAN AF] Mesaj dinleme hatası:', err);
  }
});

const token = config.token || process.env.TOKEN;
if (!token || token.includes('BURAYA_BOT_TOKEN') || token === 'BURAYA_BOT_TOKEN_YAZIN') {
  console.error('\n❌ [BAŞLATMA HATASI] Bot tokeni bulunamadı veya yapılandırılmadı!');
  console.error('👉 Lütfen .env veya config.json dosyasını açıp bot tokeninizi tanımlayın.');
  console.error('👉 Detaylı kurulum adımları için README.md dosyasına göz atabilirsiniz.\n');
  process.exit(1);
}

client.login(token);


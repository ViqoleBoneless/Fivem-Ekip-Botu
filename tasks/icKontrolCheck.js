import { getOnlineStatusMap } from '../utils/icHelper.js';
import fs from 'fs';

// Run every 5 minutes
const CHECK_INTERVAL = 5 * 60 * 1000;

setInterval(async () => {
  const client = globalThis.client;
  if (!client || !client.isReady()) return;
  if (client.config?.icKontrolSystemEnabled === false) return;

  const mainServer = client.config?.icKontrolMainServer;
  // Support both legacy string and new array format
  const typeRaw = client.config?.icKontrolType;
  const types = Array.isArray(typeRaw) ? typeRaw : (typeRaw ? [typeRaw] : []);
  const activeServers = client.config?.icKontrolActiveServers || [];
  const onayRoleId = client.config?.onayRoleId;

  // Verify settings are configured
  if (!mainServer || types.length === 0 || !onayRoleId || activeServers.length === 0) {
    return;
  }

  const doIsim = types.includes('isim');
  const doKanalList = types.includes('kanal-list');

  try {
    // 1. Fetch online status map from CFX
    const onlineMap = await getOnlineStatusMap(activeServers);

    // 2. Loop over guilds
    for (const guild of client.guilds.cache.values()) {
      const role = guild.roles.cache.get(onayRoleId);
      if (!role) continue;

      // Populate member cache by fetching only the role members to avoid hanging.
      await guild.members.fetch({ role: onayRoleId }).catch(() => null);

      const roleMembers = role.members;

      // ── İSİM PREFIX modu ──────────────────────────────────────────────
      if (doIsim) {
        const prefixRegex = /^\[(MDRP|WELL|MDPVP|GUİD|GUID)\]\s*/i;

        for (const member of roleMembers.values()) {
          if (member.user.bot) continue;

          const isOnline = onlineMap.has(member.id);
          const currentNickname = member.nickname || member.user.username;

          if (isOnline) {
            const playerInfo = onlineMap.get(member.id);
            const serverName = playerInfo.serverName;
            const cleanName = currentNickname.replace(prefixRegex, '');
            const desiredNickname = `[${serverName}] ${cleanName}`.slice(0, 32);

            if (member.nickname !== desiredNickname) {
              await member.setNickname(desiredNickname).catch(err => {
                console.warn(`[IC Kontrol] Nickname error for ${member.user.tag}: ${err.message}`);
              });
            }
          } else {
            // Offline - Remove tag if present
            if (prefixRegex.test(currentNickname)) {
              const cleanName = currentNickname.replace(prefixRegex, '');
              const desiredNickname = cleanName === member.user.username ? null : cleanName;

              await member.setNickname(desiredNickname).catch(err => {
                console.warn(`[IC Kontrol] Nickname reset error for ${member.user.tag}: ${err.message}`);
              });
            }
          }
        }
      }

      // ── KANAL LİST modu ───────────────────────────────────────────────
      if (doKanalList) {
        const grouped = {};
        for (const srv of activeServers) {
          grouped[srv] = [];
        }

        for (const member of roleMembers.values()) {
          if (member.user.bot) continue;

          if (onlineMap.has(member.id)) {
            const playerInfo = onlineMap.get(member.id);
            if (grouped[playerInfo.serverName]) {
              grouped[playerInfo.serverName].push({
                member,
                playerName: playerInfo.playerName
              });
            }
          }
        }

        // Build list message content
        let listContent = `## 🎮 Sunucularda Aktif Olan Üyeler\n\n`;
        for (const [srv, players] of Object.entries(grouped)) {
          listContent += `**${srv}:**\n`;
          if (players.length === 0) {
            listContent += `> _Oyunda üye yok_\n\n`;
          } else {
            players.forEach(p => {
              listContent += `> - ${p.member} (FiveM: \`${p.playerName}\`)\n`;
            });
            listContent += `\n`;
          }
        }
        listContent += `*Son Güncelleme: <t:${Math.floor(Date.now() / 1000)}:R>*`;

        // Get target channel
        const channelId = client.config.icKontrolChannelIdEnabled !== false ? client.config.icKontrolChannelId : null;
        if (channelId) {
          const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
          if (channel?.isTextBased()) {
            let msg = null;
            const messageId = client.config.icKontrolMessageId;
            
            if (messageId) {
              msg = await channel.messages.fetch(messageId).catch(() => null);
            }

            if (msg) {
              await msg.edit({ content: listContent }).catch(err => console.error('[IC Kontrol] List edit error:', err.message));
            } else {
              const newMsg = await channel.send({ content: listContent }).catch(err => console.error('[IC Kontrol] List send error:', err.message));
              if (newMsg) {
                // Update message ID in config
                client.config.icKontrolMessageId = newMsg.id;
                const cp = client.configPath;
                try {
                  let currentConfig = {};
                  if (fs.existsSync(cp)) {
                    currentConfig = JSON.parse(fs.readFileSync(cp, 'utf8'));
                  }
                  currentConfig.icKontrolMessageId = newMsg.id;
                  fs.writeFileSync(cp, JSON.stringify(currentConfig, null, 2), 'utf8');
                } catch (fsErr) {
                  console.error('[IC Kontrol] Config write error:', fsErr.message);
                }
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('[IC Kontrol] Background task error:', err);
  }
}, CHECK_INTERVAL);

console.log('✅ IC Kontrol görevi başlatıldı (5 dakikada bir).');

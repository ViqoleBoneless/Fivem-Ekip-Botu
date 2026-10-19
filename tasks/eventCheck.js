import cron from 'node-cron';
import { loadEvents, saveEvents } from '../db.js';
import { buildEventContainer } from '../utils/eventHelper.js';
import { MessageFlags } from 'discord.js';
import { getOnlineStatusMapForMainServer } from '../utils/icHelper.js';

cron.schedule('*/15 * * * * *', async () => {
  const client = globalThis.client;
  if (!client || !client.isReady()) return;

  const events = loadEvents();
  const now = Date.now();
  let changed = false;

  for (const event of events) {
    if (event.finished || !event.expiresAt || event.expiresAt > now) continue;

    event.finished = true;
    const { checkAndRewardEvent } = await import('../utils/statsHelper.js');
    checkAndRewardEvent(event);
    changed = true;

    try {
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

        // Send participant list to the channel
        const icData = await getOnlineStatusMapForMainServer(client).catch(() => null);
        const onlineSet = icData?.onlineSet;
        const providesDiscordIds = icData?.providesDiscordIds;
        let msg = `**${event.eventType}** etkinliği katılım süresi dolduğu için sona erdi!\n\n**Katılanlar:**\n`;
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
            await channel.send(chunk).catch(() => null);
          }
        } else {
          await channel.send(msg).catch(() => null);
        }
      }
    } catch (err) {
      console.error(`Etkinlik sonlandırma mesaj/kanal hatası (${event.messageId}):`, err);
    }

    // Delete management message from aktif-işlemler
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
      console.error(`Etkinlik aktif-işlemler silme hatası (${event.messageId}):`, err);
    }
  }

  if (changed) saveEvents(events);
});

console.log('✅ Etkinlik kontrol görevi başlatıldı (15 saniyede bir).');

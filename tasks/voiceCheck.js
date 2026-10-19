import cron from 'node-cron';
import { getVoiceConfig } from '../db.js';
import { joinVoiceChannel, getVoiceConnection } from '@discordjs/voice';

cron.schedule('*/15 * * * * *', async () => {
  const client = globalThis.client;
  if (!client || !client.isReady()) return;

  const voiceData = getVoiceConfig();
  const { channelId, guildId } = voiceData;
  if (!channelId || !guildId) return;

  try {
    const connection = getVoiceConnection(guildId);
    if (!connection) {
      const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) return;

      const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
      if (!channel) return;

      joinVoiceChannel({
        channelId: channel.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
        selfMute: false,
        selfDeaf: true
      });

      console.log(`🔊 Ses bağlantısı kurtarıldı: ${guild.name} - #${channel.name}`);
    }
  } catch (error) {
    console.error('Ses kalıcılık kontrolü hatası:', error);
  }
});

console.log('✅ Ses kalıcılık kontrol görevi başlatıldı (15 saniyede bir).');

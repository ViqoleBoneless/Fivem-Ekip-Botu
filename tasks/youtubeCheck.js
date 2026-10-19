import cron from 'node-cron';
import { loadYoutubeChannels as loadChannels, saveYoutubeChannels as saveChannels } from '../db.js';
import { getLatestVideo } from '../services/youtubeService.js';

export async function checkYoutubeVideos(client) {
  console.log('[YouTube Check] Görev tetiklendi.');
  if (client.config?.youtubeSystemEnabled === false) {
    console.log('[YouTube Check] YouTube sistemi devre dışı.');
    return { checked: 0, sent: 0 };
  }
  try {
    const channels = loadChannels();
    if (channels.length === 0) {
      console.log('[YouTube Check] Kayıtlı kanal bulunamadı.');
      return { checked: 0, sent: 0 };
    }
    const videoChannelId = client.config?.videoChannelIdEnabled !== false ? (client.config?.videoChannelId || process.env.VIDEO_CHANNEL_ID) : null;
    if (!videoChannelId) {
      console.warn('[YouTube Check] videoChannelId tanımlı değil veya gönderim devre dışı.');
      return { checked: channels.length, sent: 0, error: 'Log kanalı tanımlı değil veya gönderim devre dışı.' };
    }
    
    console.log(`[YouTube Check] ${channels.length} adet kanal kontrol ediliyor...`);
    let sentCount = 0;
    for (const channel of channels) {
      try {
        const latestVideo = await getLatestVideo(channel.channelId);
        if (!latestVideo) {
          console.warn(`[YouTube Check] Kanal verisi alınamadı veya boş: ${channel.channelName} (${channel.channelId})`);
          continue;
        }
        if (!channel.lastVideoId) {
          channel.lastVideoId = latestVideo.videoId;
          saveChannels(channels);
          console.log(`[YouTube Check] ${channel.channelName} için ilk video ID kaydedildi: ${latestVideo.videoId}`);
          continue;
        }
        if (channel.lastVideoId !== latestVideo.videoId) {
          const videoChannel = await client.channels.fetch(videoChannelId).catch((err) => {
            console.error(`[YouTube Check] Log kanalı fetch edilemedi (${videoChannelId}):`, err);
            return null;
          });
          if (!videoChannel?.isTextBased()) {
            console.warn(`[YouTube Check] Geçersiz veya erişilemez video kanalı: ${videoChannelId}`);
            continue;
          }
          let message = latestVideo.videoUrl;
          if (channel.everyone) message += '\n\n@everyone';
          const sentMessage = await videoChannel.send({
            content: message,
            allowedMentions: channel.everyone ? { parse: ['everyone'] } : { parse: [] }
          });
          
          // Eğer kanal bir duyuru kanalıysa mesajı yayınla (crosspost)
          if (videoChannel.type === 5) { // 5 = GUILD_ANNOUNCEMENT (eski adıyla NEWS)
            try {
              await sentMessage.crosspost();
              console.log(`📺 Yeni video yayınlandı: ${channel.channelName} - ${latestVideo.videoUrl}`);
            } catch (crosspostError) {
              console.warn(`⚠️ Mesaj yayınlanamadı (crosspost başarısız): ${crosspostError.message}`);
            }
          } else {
            console.log(`📺 Yeni video gönderildi: ${channel.channelName} - ${latestVideo.videoUrl}`);
          }
          channel.lastVideoId = latestVideo.videoId;
          saveChannels(channels);
          sentCount++;
        }
      } catch (error) {
        console.error(`[YouTube Check] Kanal kontrolü hatası (${channel.channelName}):`, error);
      }
    }
    console.log('[YouTube Check] Görev tamamlandı.');
    return { checked: channels.length, sent: sentCount };
  } catch (error) {
    console.error('[YouTube Check] YouTube kontrol task hatası:', error);
    throw error;
  }
}

cron.schedule('*/5 * * * *', async () => {
  const client = globalThis.client;
  if (!client?.isReady()) return;
  await checkYoutubeVideos(client).catch(() => {});
});

console.log('✅ YouTube kontrol görevi başlatıldı (5 dakikada bir).');

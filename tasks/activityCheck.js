import cron from 'node-cron';
import { loadActivity, saveActivity } from '../db.js';

cron.schedule('* * * * *', async () => {
  const client = globalThis.client;
  if (!client || !client.isReady()) return;
  if (client.config?.activitySystemEnabled === false) return;

  const activities = loadActivity();
  const now = Date.now();
  let changed = false;

  for (const activity of activities) {
    if (activity.processed || activity.expiresAt > now) continue;

    const guild = client.guilds.cache.get(activity.guildId);
    if (!guild) { activity.processed = true; changed = true; continue; }

    try {
      const channel = await guild.channels.fetch(activity.channelId);
      if (!channel?.isTextBased()) { activity.processed = true; changed = true; continue; }

      const message = await channel.messages.fetch(activity.messageId);
      const participants = activity.participants || [];
      const reactedUserIds = new Set(participants);
      const role = guild.roles.cache.get(activity.roleId);
      if (!role) { activity.processed = true; changed = true; continue; }

      // Cache-first yaklaşımı: büyük sunucularda fetch() rate limit hatası verir
      let members;
      try {
        if (guild.members.cache.size > 0) {
          members = guild.members.cache;
        } else {
          members = await guild.members.fetch({ time: 10000 });
        }
      } catch (fetchErr) {
        console.error('Members fetch hatası (cache kullanılıyor):', fetchErr.message);
        members = guild.members.cache;
      }
      const removedUserIds = [];
      const toRemove = [];

      for (const [, member] of members) {
        const hasRole = activity.roleId === guild.id || member._roles.includes(activity.roleId);
        if (hasRole && !reactedUserIds.has(member.id)) {
          toRemove.push(member);
        }
      }

      const chunkSize = 10;
      for (let i = 0; i < toRemove.length; i += chunkSize) {
        const chunk = toRemove.slice(i, i + chunkSize);
        await Promise.all(chunk.map(async (member) => {
          try {
            await member.roles.remove(activity.roleId, 'Aktiflik kontrolünde butona tıklamadı');
            removedUserIds.push(member.id);
          } catch {}
        }));
      }

      activity.processed = true;
      changed = true;

      const {
        ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize,
        AttachmentBuilder, MessageFlags
      } = await import('discord.js');

      // 1) Aktiflik mesajını "Sona Erdi" olarak güncelle (hata olsa da log'u engelleme)
      try {
        const endedContainer = new ContainerBuilder()
          .setAccentColor(0xED4245)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent('# ⏰ AKTİFLİK KONTROLÜ SONA ERDİ')
          )
          .addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
          )
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `> **Aktiflik kontrolü süresi dolmuştur. İşlem tamamlanmıştır.**\n\n` +
              `🎯 **Hedef Rol:** ${role}\n` +
              `✅ **Durum:** Süre Doldu / Pasif\n` +
              `📊 **Katılımcı Sayısı:** ${participants.length} kişi\n` +
              `🔴 **Rolü Alınan Sayısı:** ${removedUserIds.length} kişi`
            )
          )
          .addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
          )
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent('-# FiveM Ekip Yönetim Sistemi')
          );

        await message.edit({
          components: [endedContainer],
          flags: MessageFlags.IsComponentsV2
        });
      } catch (editErr) {
        console.error('Aktiflik mesajı düzenlenemedi:', editErr.message);
      }

      // 2) Log kanalına rapor + txt dosyaları gönder (message.edit'ten bağımsız)
      try {
        const katilanlarText = participants.length > 0 ? participants.join('\n') : '';
        const katilmayanlarText = removedUserIds.length > 0 ? removedUserIds.join('\n') : '';
        const katilanlarAttachment = new AttachmentBuilder(Buffer.from(katilanlarText, 'utf-8'), { name: 'katilanlar.txt' });
        const katilmayanlarAttachment = new AttachmentBuilder(Buffer.from(katilmayanlarText, 'utf-8'), { name: 'katilmayanlar.txt' });

        const logChannelId = client.config.activityLogChannelIdEnabled !== false ? client.config.activityLogChannelId : null;
        if (logChannelId) {
          const logChannel = guild.channels.cache.get(logChannelId) || await guild.channels.fetch(logChannelId).catch(() => null);
          if (logChannel?.isTextBased()) {
            const logContainer = new ContainerBuilder()
              .setAccentColor(0xED4245)
              .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ⏰ Aktiflik Kontrolü Sona Erdi`))
              .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
              .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `> 🎯 **Rol:** ${role} (\`${role.name}\`)\n` +
                `> ✅ **Katılan Sayısı:** \`${participants.length}\`\n` +
                `> ❌ **Katılmayan/Rolü Alınan Sayısı:** \`${removedUserIds.length}\`\n` +
                `> 📢 **Aktiflik Mesajı:** [Tıkla](https://discord.com/channels/${activity.guildId}/${activity.channelId}/${activity.messageId})`
              ))
              .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
              .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));

            await logChannel.send({
              components: [logContainer],
              files: [katilanlarAttachment, katilmayanlarAttachment],
              flags: MessageFlags.IsComponentsV2
            });
            console.log(`[AktiflikCheck] Log kanalına rapor gönderildi. Katılan: ${participants.length}, Katılmayan: ${removedUserIds.length}`);
          } else {
            console.error('[AktiflikCheck] Log kanalı bulunamadı veya metin tabanlı değil. ID:', logChannelId);
          }
        } else {
          console.error('[AktiflikCheck] activityLogChannelId config\'da tanımlı değil!');
        }
      } catch (logErr) {
        console.error('Log kanalına aktiflik raporu gönderilemedi:', logErr);
      }

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

    } catch { activity.processed = true; changed = true; }
  }

  if (changed) saveActivity(activities);
});

console.log('✅ Aktiflik kontrol görevi başlatıldı (her dakika).');

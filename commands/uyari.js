import { hasPermission } from '../utils/permissions.js';
import {
  SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags,
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize,
  AttachmentBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder
} from 'discord.js';
import { getWarnings, setWarnings } from '../db.js';
import { generateWarningCard } from '../utils/canvasHelper.js';

export const data = new SlashCommandBuilder()
  .setName('uyari')
  .setDescription('Bir üyeyi uyarır, 3. uyarıda banlar.')
  .addUserOption(o => o.setName('uye').setDescription('Uyarılacak üye').setRequired(true))
  .addStringOption(o => o.setName('sebep').setDescription('Uyarı sebebi').setRequired(true));

export async function execute(interaction, client) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const warningLogChannelId = client.config.warningLogChannelId || process.env.WARNING_LOG_CHANNEL_ID;
  const warningPublicChannelId = client.config.warningPublicChannelId || process.env.WARNING_PUBLIC_CHANNEL_ID;

  if (!warningLogChannelId) return interaction.editReply({ content: '❌ warningLogChannelId ayarlanmamış.' });
  if (!hasPermission(interaction.member, 'banCommand', client)) return interaction.editReply({ content: '❌ Yetkin yok.' });

  const targetUser = interaction.options.getUser('uye', true);
  const reason = interaction.options.getString('sebep', true);
  const guild = interaction.guild;
  const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);

  if (!targetMember) return interaction.editReply({ content: '❌ Üye sunucuda bulunamadı.' });

  // Veritabanını yükle ve güncel uyarısını ekle
  const userWarnData = getWarnings(guild.id, targetUser.id) || { count: 0, history: [] };

  const newCount = userWarnData.count + 1;
  const newHistoryRecord = {
    reason: reason,
    warnerId: interaction.user.id,
    warnerTag: interaction.user.tag,
    timestamp: new Date().toISOString()
  };

  userWarnData.count = newCount;
  userWarnData.history.push(newHistoryRecord);

  setWarnings(guild.id, targetUser.id, userWarnData.count, userWarnData.history);

  const warnColor = newCount >= 3 ? 0xED4245 : newCount === 2 ? 0xFEE75C : 0xFEE75C;

  let banFailed = false;
  if (newCount >= 3) {
    if (!guild.members.me.permissions.has(PermissionFlagsBits.BanMembers)) {
      banFailed = true;
    } else {
      try {
        if (client.recentBansData) {
          client.recentBansData.set(targetUser.id, {
            moderatorId: interaction.user.id,
            moderatorTag: interaction.user.tag,
            reason: `3. uyarı. Sebep: ${reason}`
          });
        }
        await targetMember.ban({ reason: `3. uyarı. Sebep: ${reason} | Yetkili: ${interaction.user.tag}` });
      } catch (err) {
        console.error('Ban hata:', err);
        banFailed = true;
      }
    }
  }

  // 1. Herkesin görebileceği "uyarılar" kanalına mesaj gönder (Asenkron)
  if (warningPublicChannelId && client.config?.warningPublicChannelIdEnabled !== false) {
    const publicChannel = guild.channels.cache.get(warningPublicChannelId);
    if (publicChannel?.isTextBased()) {
      let extraWarnText = '';
      if (newCount === 2) {
        extraWarnText = '\n> <a:warn:1460372615846957167> **Uyarı:** Bu kullanıcının 2. uyarısıdır. Bir uyarı daha alırsa banlanacaktır.';
      } else if (newCount >= 3) {
        if (banFailed) {
          extraWarnText = '\n> <:yasak:1506291988880953374> **BAN:** 3. uyarıya ulaştı ancak yetki yetersizliğinden dolayı banlanamadı';
        } else {
          extraWarnText = '\n> <:yasak:1506291988880953374> **BAN:** 3. uyarıya ulaştı, otomatik ban uygulandı!';
        }
      }

      // Generate warning canvas card
      const avatarUrl = targetUser.displayAvatarURL({ forceStatic: true, extension: 'png', size: 256 });
      const canvasBuffer = await generateWarningCard({
        username: targetUser.username,
        avatarUrl,
        executorTag: interaction.user.tag,
        warnCount: newCount,
        reason: reason
      }).catch(err => {
        console.error('[WARNING LOG] Canvas generation failed:', err);
        return null;
      });

      const files = [];
      const publicContainer = new ContainerBuilder()
        .setAccentColor(warnColor);

      if (canvasBuffer) {
        files.push(new AttachmentBuilder(canvasBuffer, { name: 'warn-card.png' }));
        publicContainer.addMediaGalleryComponents(
          new MediaGalleryBuilder().addItems(
            new MediaGalleryItemBuilder().setURL('attachment://warn-card.png')
          )
        );
      }

      publicContainer
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## <a:kateshi_warn:1460372615846957167> Kullanıcı Uyarıldı`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `> <:ye:1507732515585265825> **Kullanıcı:** ${targetUser} (\`${targetUser.tag}\`)\n` +
          `> <:mod:1507746579078053999> **Yetkili:** ${interaction.user} (\`${interaction.user.tag}\`)\n` +
          `> <a:yukleniyor:1507734322298228908> **Toplam Uyarı:** ${newCount}/3\n` +
          `> <:info:1507746625508868157> **Sebep:** ${reason}` +
          extraWarnText
        ))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));

      publicChannel.send({ components: [publicContainer], files, flags: MessageFlags.IsComponentsV2 }).catch(err => console.error('Public kanala mesaj atılırken hata oluştu:', err));
    }
  }

  // 2. Yetkililere özel "uyari-log" kanalına detaylı Container gönder (Asenkron)
  if (client.config?.warningLogChannelIdEnabled !== false) {
    const logChannel = guild.channels.cache.get(warningLogChannelId);
    if (logChannel?.isTextBased()) {
      const previousWarns = userWarnData.history.slice(0, -1);
      let historyText = '';
      if (previousWarns.length === 0) {
        historyText = '*Önceki uyarısı bulunmamaktadır.*';
      } else {
        historyText = previousWarns.map((w, index) => {
          const timestampUnix = Math.floor(new Date(w.timestamp).getTime() / 1000);
          return `**${index + 1}.** <:mod:1507746579078053999> **Yetkili:** <@${w.warnerId}> (\`${w.warnerTag}\`)\n  ⏱️ <t:${timestampUnix}:F> (<t:${timestampUnix}:R>)\n  📝 Sebep: *${w.reason}*`;
        }).join('\n\n');
      }

      const logContainer = new ContainerBuilder()
        .setAccentColor(0x2B2D7A)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 📝 UYARI DETAYLI LOG`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `> <:ye:1507732515585265825> **Uyarılacak Kişi (Hedef):** ${targetUser} (\`${targetUser.tag}\`)\n` +
          `> <:mod:1507746579078053999> **Uyarıyı Atan Yetkili:** ${interaction.user} (\`${interaction.user.tag}\`)\n` +
          `> <a:yukleniyor:1507734322298228908> **Uyarı Sayısı Durumu:** \`${newCount}/3\` (${newCount >= 3 ? (banFailed ? '🔴 BANLANAMADI (YETKİ YETERSİZ)' : '🔴 BANLANDI') : newCount === 2 ? '🟡 SON UYARI' : '🟢 BİRİNCİ UYARI'})\n` +
          `> <:info:1507746625508868157> **Bu Uyarı Sebebi:** ${reason}\n\n` +
          `**⏳ Önceki Uyarıların Geçmişi:**\n${historyText}` +
          (newCount >= 3 ? (banFailed ? '\n\n**🚨 Otomatik Ban Başarısız:** 3. uyarı limiti aşıldı ancak yetki yetersizliğinden dolayı banlanamadı.' : '\n\n**🚨 Otomatik Ban Tetiklendi:** 3. uyarı limiti aşıldığı için kullanıcı bot tarafından otomatik olarak banlandı.') : '')
        ))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));

      logChannel.send({ components: [logContainer], flags: MessageFlags.IsComponentsV2 }).catch(err => console.error('Log kanalına mesaj atılırken hata oluştu:', err));
    }
  }

  if (newCount < 3) {
    const container = new ContainerBuilder()
      .setAccentColor(warnColor)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## ⚠️ Kullanıcı Uyarıldı`)
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `${targetUser} başarıyla uyarılmıştır.\n\n` +
          `> <:ye:1507732515585265825> **Kullanıcı:** ${targetUser} (\`${targetUser.tag}\`)\n` +
          `> <a:yukleniyor:1507734322298228908> **Uyarı Sayısı:** \`${newCount}/3\`\n` +
          `> <:info:1507746625508868157> **Sebep:** ${reason}`
        )
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('-# Viqole Bot`s')
      );

    return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }

  // newCount >= 3 - reply to moderator
  const container = new ContainerBuilder()
    .setAccentColor(0xED4245)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        banFailed 
          ? `## <:Cezaa:1507734141498818581> Kullanıcı Banlanamadı (3. Uyarı)`
          : `## <:Cezaa:1507734141498818581> Kullanıcı Yasaklandı (3. Uyarı)`
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        banFailed
          ? `${targetUser} 3. uyarıya ulaştı ancak yetki yetersizliğinden dolayı banlanamadı.\n\n` +
            `> <:yasak:1506291988880953374> **Hedef:** ${targetUser} (\`${targetUser.tag}\`)\n` +
            `> <:mod:1507746579078053999> **Yetkili:** ${interaction.user} (\`${interaction.user.tag}\`)\n` +
            `> 📝 **Son Uyarı Sebebi:** ${reason}`
          : `${targetUser} 3. uyarıya ulaştığı için otomatik olarak sunucudan yasaklanmıştır.\n\n` +
            `> <:yasak:1506291988880953374> **Banlanan:** ${targetUser} (\`${targetUser.tag}\`)\n` +
            `> <:mod:1507746579078053999> **Yetkili:** ${interaction.user} (\`${interaction.user.tag}\`)\n` +
            `> 📝 **Son Uyarı Sebebi:** ${reason}`
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('-# Viqole Bot`s')
    );

  return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
}


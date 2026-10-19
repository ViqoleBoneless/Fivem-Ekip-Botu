import { hasPermission } from '../utils/permissions.js';
import {
  SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder,
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize,
  MessageFlags, AttachmentBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder
} from 'discord.js';
import { generateUnbanCard } from '../utils/canvasHelper.js';

export const data = new SlashCommandBuilder()
  .setName('unban')
  .setDescription('Sunucudan yasaklı bir kullanıcının banını kaldırır.')
  .addStringOption(o => o.setName('kullanici_id').setDescription('Ban kaldırılacak kullanıcının ID\'si').setRequired(true))
  .addStringOption(o => o.setName('sebep').setDescription('Ban kaldırma sebebi').setRequired(false));

export async function execute(interaction, client) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!hasPermission(interaction.member, 'banCommand', client)) {
    return interaction.editReply({ content: '❌ Bu komutu kullanmak için **Ban Sorumlusu** veya **Yönetici** yetkisine sahip olmalısınız.' });
  }

  const userId = interaction.options.getString('kullanici_id', true);
  const reason = interaction.options.getString('sebep') || 'Sebep belirtilmedi.';
  if (!/^\d+$/.test(userId)) return interaction.editReply({ content: '❌ Geçersiz kullanıcı ID\'si.' });

  const guild = interaction.guild;
  if (!guild.members.me.permissions.has(PermissionFlagsBits.BanMembers)) return interaction.editReply({ content: '❌ Botun ban kaldırma yetkisi yok.' });

  try {
    const bannedUser = await guild.bans.fetch(userId).catch(() => null);
    if (!bannedUser) return interaction.editReply({ content: '❌ Bu kullanıcı yasaklı değil.' });

    // GuildBanRemove event'inde çift log oluşmaması için ID'yi geçici olarak işaretle
    if (client.recentBotUnbans) {
      client.recentBotUnbans.add(userId);
      setTimeout(() => client.recentBotUnbans?.delete(userId), 5000);
    }

    await guild.members.unban(userId, `${reason} | Yetkili: ${interaction.user.tag}`);

    const unbanLogChannelId = client.config.banLogChannelId || client.config.unbanLogChannelId || process.env.BAN_LOG_CHANNEL_ID;
    if (unbanLogChannelId && client.config?.banLogChannelIdEnabled !== false) {
      guild.channels.fetch(unbanLogChannelId).then(async logChannel => {
        if (logChannel?.isTextBased()) {
          const logContainer = new ContainerBuilder()
            .setAccentColor(0x57F287)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## <:animemutlu:1507997747180077137> Kullanıcı Yasağı Kaldırıldı`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
              `> <:ye:1507732515585265825> **ʏᴀꜱᴀɢı ᴋᴀʟᴅıʀıʟᴀɴ:** ${bannedUser.user} (\`${userId}\`)\n` +
              `> <:mod:1507746579078053999> **ᴋᴀʟᴅıʀᴀɴ ʏᴇᴛᴋɪʟɪ:** ${interaction.user} (\`${interaction.user.tag}\`)\n` +
              `> <:yldz:1506291961349537873> **ꜱᴇʙᴇᴘ:** ${reason}\n` +
              `> <a:TimerSand:1509704018199449680> **ᴛᴀʀɪʜ:** <t:${Math.floor(Date.now() / 1000)}:F>`
            ));

          const unbanCardBuffer = await generateUnbanCard({
            username: bannedUser.user.tag,
            avatarUrl: bannedUser.user.displayAvatarURL({ extension: 'png', size: 256 }),
            executorTag: interaction.user.tag,
            reason: reason,
            timestamp: Date.now()
          }).catch(err => {
            console.error('[UNBAN COMMAND LOG] Canvas generation failed:', err);
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

          logChannel.send({ components: [logContainer], files, flags: MessageFlags.IsComponentsV2 }).catch(() => null);
        }
      }).catch(() => null);
    }

    return interaction.editReply({ content: `✅ ${bannedUser.user} kişisinin banı başarıyla kaldırıldı.` });
  } catch (err) {
    console.error('Unban hatası:', err);
    return interaction.editReply({ content: '❌ Ban kaldırılırken hata oluştu.' });
  }
}

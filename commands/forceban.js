import { hasPermission } from '../utils/permissions.js';
import {
  SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder,
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize,
  MessageFlags, AttachmentBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder
} from 'discord.js';
import { generateBanCard } from '../utils/canvasHelper.js';
import { addBan, removeBanByUserId } from '../db.js';

export const data = new SlashCommandBuilder()
  .setName('forceban')
  .setDescription('ID ile sunucuda olmayan bir kullanıcıyı kalıcı olarak yasaklar.')
  .addStringOption(o => o.setName('discordid').setDescription('Yasaklanacak kullanıcının Discord ID\'si').setRequired(true))
  .addStringOption(o => o.setName('sebep').setDescription('Yasaklanma sebebi').setRequired(false));

export async function execute(interaction, client) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!hasPermission(interaction.member, 'banCommand', client)) {
    return interaction.editReply({ content: '❌ Bu komutu kullanmak için **Ban Sorumlusu** veya **Yönetici** yetkisine sahip olmalısınız.' });
  }

  const userId = interaction.options.getString('discordid', true);
  const reason = interaction.options.getString('sebep') || 'Sebep belirtilmedi.';
  const guild = interaction.guild;

  if (!/^\d+$/.test(userId)) {
    return interaction.editReply({ content: '❌ Geçersiz kullanıcı ID\'si. Sadece rakamlardan oluşmalıdır.' });
  }

  if (!guild.members.me.permissions.has(PermissionFlagsBits.BanMembers)) {
    return interaction.editReply({ content: '❌ Botun ban atma yetkisi yok.' });
  }

  try {
    // GuildBanAdd event'inde çift log oluşmaması için ID'yi geçici olarak işaretle
    if (client.recentBotBans) {
      client.recentBotBans.add(userId);
      setTimeout(() => client.recentBotBans?.delete(userId), 5000);
    }
    if (client.recentBansData) {
      client.recentBansData.set(userId, {
        moderatorId: interaction.user.id,
        moderatorTag: interaction.user.tag,
        reason: reason
      });
    }

    // Yasaklamayı gerçekleştir
    await guild.bans.create(userId, { reason: `${reason} | Forceban Yetkili: ${interaction.user.tag}` });

    // Veritabanına ekle
    removeBanByUserId(userId);

    // Kullanıcı bilgisini çekmeye çalış
    const fetchedUser = await client.users.fetch(userId).catch(() => null);
    const userTag = fetchedUser ? fetchedUser.tag : `ID: ${userId}`;
    const userLabel = fetchedUser ? `${fetchedUser} (\`${fetchedUser.tag}\`)` : `\`ID: ${userId}\``;

    addBan({
      userId,
      userTag,
      moderatorId: interaction.user.id,
      moderatorTag: interaction.user.tag,
      reason,
      date: new Date().toISOString()
    });

    // Log kanalına V2 Container gönder
    const banLogChannelId = client.config.banLogChannelId || process.env.BAN_LOG_CHANNEL_ID;
    if (banLogChannelId && client.config?.banLogChannelIdEnabled !== false) {
      guild.channels.fetch(banLogChannelId).then(async logChannel => {
        if (logChannel?.isTextBased()) {
          const logContainer = new ContainerBuilder()
            .setAccentColor(0xED4245)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## <:Cezaa:1507734141498818581> Kullanıcı Yasaklandı (FORCEBAN)`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
              `> <:yasak:1506291988880953374> **ʏᴀꜱᴀᴋʟᴀɴᴀɴ:** ${userLabel}\n` +
              `> <:mod:1507746579078053999> **ʏᴀꜱᴀᴋʟᴀʏᴀɴ:** ${interaction.user} (\`${interaction.user.tag}\`)\n` +
              `> <:yldz:1506291961349537873> **ꜱᴇʙᴇᴘ:** ${reason}\n` +
              `> <a:TimerSand:1509704018199449680> **ᴛᴀʀɪʜ:** <t:${Math.floor(Date.now() / 1000)}:F>\n` +
              `> 🆔 **ID:** \`${userId}\``
            ));

          const banCardBuffer = await generateBanCard({
            username: fetchedUser ? fetchedUser.tag : `ID: ${userId}`,
            avatarUrl: fetchedUser ? fetchedUser.displayAvatarURL({ extension: 'png', size: 256 }) : null,
            executorTag: interaction.user.tag,
            reason: reason,
            timestamp: Date.now()
          }).catch(err => {
            console.error('[FORCEBAN LOG] Canvas generation failed:', err);
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
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));

          logChannel.send({ components: [logContainer], files, flags: MessageFlags.IsComponentsV2 }).catch(() => null);
        }
      }).catch(() => null);
    }

    return interaction.editReply({ content: `👤 \`${userTag}\` başarıyla sunucudan yasaklandı (Forceban).` });
  } catch (err) {
    console.error('Forceban hatası:', err);
    return interaction.editReply({ content: `❌ Kullanıcı yasaklanırken hata oluştu: \`${err.message}\`` });
  }
}

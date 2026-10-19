import { hasPermission } from '../utils/permissions.js';
import {
  SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder,
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize,
  MessageFlags, AttachmentBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder
} from 'discord.js';
import { generateBanCard } from '../utils/canvasHelper.js';
import { addBan, removeBanByUserId } from '../db.js';

export const data = new SlashCommandBuilder()
  .setName('ban')
  .setDescription('Bir üyeyi sunucudan yasaklar.')
  .addUserOption(o => o.setName('uye').setDescription('Banlanacak üye').setRequired(true))
  .addStringOption(o => o.setName('sebep').setDescription('Ban sebebi').setRequired(false));

export async function execute(interaction, client) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!hasPermission(interaction.member, 'banCommand', client)) return interaction.editReply({ content: '❌ Bu komutu kullanmak için yetkin yok.' });

  const targetUser = interaction.options.getUser('uye', true);
  const reason = interaction.options.getString('sebep') || 'Sebep belirtilmedi.';
  const guild = interaction.guild;
  const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
  if (!targetMember) return interaction.editReply({ content: '❌ Belirtilen üye sunucuda bulunamadı.' });
  if (!guild.members.me.permissions.has(PermissionFlagsBits.BanMembers)) return interaction.editReply({ content: '❌ Botun ban atma yetkisi yok.' });

  try {
    // GuildBanAdd event'inde çift log oluşmaması için ID'yi geçici olarak işaretle
    if (client.recentBotBans) {
      client.recentBotBans.add(targetUser.id);
      setTimeout(() => client.recentBotBans?.delete(targetUser.id), 5000);
    }
    if (client.recentBansData) {
      client.recentBansData.set(targetUser.id, {
        moderatorId: interaction.user.id,
        moderatorTag: interaction.user.tag,
        reason: reason
      });
    }
    await targetMember.ban({ reason: `${reason} | Yetkili: ${interaction.user.tag}` });
    removeBanByUserId(targetUser.id);
    addBan({ userId: targetUser.id, userTag: targetUser.tag, moderatorId: interaction.user.id, moderatorTag: interaction.user.tag, reason, date: new Date().toISOString() });
  } catch (err) { return interaction.editReply({ content: '❌ Kullanıcı banlanırken hata oluştu.' }); }

  // Log kanalına V2 Container gönder (Asenkron)
  const banLogChannelId = client.config.banLogChannelId || process.env.BAN_LOG_CHANNEL_ID;
  if (banLogChannelId && client.config?.banLogChannelIdEnabled !== false) {
    guild.channels.fetch(banLogChannelId).then(async logChannel => {
      if (logChannel?.isTextBased()) {
        const logContainer = new ContainerBuilder()
          .setAccentColor(0xED4245)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## <:yasak:1506291988880953374> Kullanıcı Yasaklandı`))
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `> <:ye:1507732515585265825> **ʏᴀꜱᴀᴋʟᴀɴᴀɴ:** ${targetUser} (\`${targetUser.id}\`)\n` +
            `> <:mod:1507746579078053999> **ʏᴀꜱᴀᴋʟᴀʏᴀɴ:** ${interaction.user} (\`${interaction.user.tag}\`)\n` +
            `> <:yldz:1506291961349537873> **ꜱᴇʙᴇᴘ:** ${reason}\n` +
            `> <a:TimerSand:1509704018199449680> **ᴛᴀʀɪʜ:** <t:${Math.floor(Date.now() / 1000)}:F>`
          ));

        const banCardBuffer = await generateBanCard({
          username: targetUser.tag,
          avatarUrl: targetUser.displayAvatarURL({ extension: 'png', size: 256 }),
          executorTag: interaction.user.tag,
          reason: reason,
          timestamp: Date.now()
        }).catch(err => {
          console.error('[BAN COMMAND LOG] Canvas generation failed:', err);
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

        logChannel.send({ components: [logContainer], files, flags: MessageFlags.IsComponentsV2 }).catch(() => null);
      }
    }).catch(() => null);
  }

  return interaction.editReply({ content: `👤 ${targetUser} başarıyla sunucudan yasaklandı.` });
}

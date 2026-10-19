import {
  SlashCommandBuilder, PermissionFlagsBits, MessageFlags
} from 'discord.js';
import { loadGiveaways, saveGiveaways } from '../db.js';
import { buildGiveawayContainer } from '../handlers/giveawayHandler.js';

export const data = new SlashCommandBuilder()
  .setName('çekiliş-başlat')
  .setDescription('Yeni bir çekiliş başlatır.')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption(o => o.setName('ödül').setDescription('Çekiliş ödülü').setRequired(true))
  .addIntegerOption(o => o.setName('kazanan-sayısı').setDescription('Kazanan sayısı').setRequired(true).setMinValue(1))
  .addStringOption(o => o.setName('süre').setDescription('Çekiliş süresi (Örn: 10s, 5m, 2h, 1d)').setRequired(true))
  .addStringOption(o => o.setName('açıklama').setDescription('Çekiliş açıklaması').setRequired(false));

export async function execute(interaction, client) {
  const prize = interaction.options.getString('ödül', true);
  const winnerCount = interaction.options.getInteger('kazanan-sayısı', true);
  const sureStr = interaction.options.getString('süre', true);
  const description = interaction.options.getString('açıklama') || null;

  const ms = parseDuration(sureStr);
  if (!ms) {
    return interaction.reply({ content: '❌ Geçersiz süre formatı! Örnek: `10s` (saniye), `5m` (dakika), `2h` (saat), `1d` (gün)', flags: MessageFlags.Ephemeral });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const endsAt = Date.now() + ms;

  // Placeholder message to get the messageId
  const initialMsg = await interaction.channel.send({ content: '⏳ Çekiliş hazırlanıyor...' });

  let mgmtMessageId = null;

  // aktif-işlemler kanalına yönetim mesajı gönder
  const aktifIslemlerChannelId = client.config?.aktifIslemlerChannelId;
  if (aktifIslemlerChannelId) {
    const mgmtChannel = interaction.guild?.channels.cache.get(aktifIslemlerChannelId)
      || await interaction.guild?.channels.fetch(aktifIslemlerChannelId).catch(() => null);
    if (mgmtChannel?.isTextBased()) {
      const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
      const mgmtRow1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`aktif_cek_duzenle_${initialMsg.id}`).setLabel('Düzenle').setStyle(ButtonStyle.Primary).setEmoji('✏️'),
        new ButtonBuilder().setCustomId(`aktif_cek_sure_${initialMsg.id}`).setLabel('Süre Uzat').setStyle(ButtonStyle.Secondary).setEmoji('⏱️'),
        new ButtonBuilder().setCustomId(`aktif_cek_kazanan_${initialMsg.id}`).setLabel('Kazanan Belirle').setStyle(ButtonStyle.Success).setEmoji('👑')
      );
      const mgmtRow2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`aktif_cek_bitir_${initialMsg.id}`).setLabel('Çekilişi Bitir').setStyle(ButtonStyle.Danger).setEmoji('⛔')
      );
      const mgmtContainer = new ContainerBuilder()
        .setAccentColor(0x5865F2)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🎛️ Çekiliş Yönetimi`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `> 🎁 **Ödül:** ${prize}\n` +
          `> 🏆 **Kazanan Sayısı:** ${winnerCount}\n` +
          `> ⏰ **Bitiş:** <t:${Math.floor(endsAt / 1000)}:F>\n` +
          `> 🔗 **Mesaj:** ${initialMsg.url}\n` +
          `> 👤 **Başlatan:** <@${interaction.user.id}>`
        ))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addActionRowComponents(mgmtRow1)
        .addActionRowComponents(mgmtRow2)
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));
      const mgmtMsg = await mgmtChannel.send({ components: [mgmtContainer], flags: MessageFlags.IsComponentsV2 }).catch(err => console.error('Aktif-işlemler çekiliş mesajı hatası:', err));
      if (mgmtMsg) mgmtMessageId = mgmtMsg.id;
    }
  }

  const giveaway = {
    messageId: initialMsg.id,
    mgmtMessageId,
    channelId: interaction.channel.id,
    guildId: interaction.guild.id,
    prize,
    winnerCount,
    endsAt,
    creatorId: interaction.user.id,
    description,
    participants: [],
    winners: [],
    ended: false,
    forcedWinnerId: null
  };

  const giveaways = loadGiveaways();
  giveaways.push(giveaway);
  saveGiveaways(giveaways);

  const container = buildGiveawayContainer(giveaway);
  await initialMsg.edit({ content: null, components: [container], flags: MessageFlags.IsComponentsV2 });

  await interaction.editReply({ content: `✅ Çekiliş başarıyla başlatıldı: ${initialMsg.url}` });
}

function parseDuration(str) {
  const match = str.match(/^(\d+)([smhd])$/);
  if (!match) return null;
  const val = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case 's': return val * 1000;
    case 'm': return val * 60 * 1000;
    case 'h': return val * 60 * 60 * 1000;
    case 'd': return val * 24 * 60 * 60 * 1000;
  }
  return null;
}

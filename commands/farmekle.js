import {
  SlashCommandBuilder, PermissionFlagsBits,
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize,
  MessageFlags
} from 'discord.js';
import { addFarmAmount, getFarmAmount } from '../db.js';
import { hasPermission } from '../utils/permissions.js';
import { E } from '../utils/emojis.js';

export const data = new SlashCommandBuilder()
  .setName('farmekle')
  .setDescription('Bir üyeye farm değeri ekler.')
  .addUserOption(o => o.setName('uye').setDescription('Farm eklenecek üye').setRequired(true))
  .addIntegerOption(o => o.setName('miktar').setDescription('Eklenecek miktar').setRequired(true));

export async function execute(interaction, client) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!hasPermission(interaction.member, 'farmSorumlusu', client)) {
    return interaction.editReply({ content: '❌ Bu komutu kullanmak için **Farm Sorumlusu** veya **Yönetici** yetkisine sahip olmalısınız.' });
  }
  const targetUser = interaction.options.getUser('uye', true);
  const amount = interaction.options.getInteger('miktar', true);
  if (amount <= 0) return interaction.editReply({ content: '❌ Miktar 0\'dan büyük olmalı.' });
  const farmLogChannelId = client.config.farmLogChannelId || process.env.FARM_LOG_CHANNEL_ID;

  addFarmAmount(interaction.guild.id, targetUser.id, amount);
  const newAmount = getFarmAmount(interaction.guild.id, targetUser.id);

  // Log kanalına mesaj gönder (Asenkron)
  if (farmLogChannelId && client.config?.farmLogChannelIdEnabled !== false) {
    const logChannel = interaction.guild.channels.cache.get(farmLogChannelId);
    if (logChannel?.isTextBased()) {
    const logContainer = new ContainerBuilder()
      .setAccentColor(0x57F287)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## <a:tik:1507733693903540265> Farm Eklendi`))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `> <:ye:1507732515585265825> **Hedef:** ${targetUser} (\`${targetUser.tag}\`)\n` +
        `> <:add:1507997878981890108> **Eklenen:** \`${amount.toLocaleString('tr-TR')}\`\n` +
        `> 📊 **Yeni Toplam:** \`${newAmount.toLocaleString('tr-TR')}\`\n` +
        `> <:5990policekanna:1508011189999763518> **İşlemi Yapan:** ${interaction.user} (\`${interaction.user.tag}\`)\n` +
        `> 🆔 **ID:** \`${targetUser.id}\``
      ))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# FiveM Ekip Yönetim Sistemi`));
      logChannel.send({ components: [logContainer], flags: MessageFlags.IsComponentsV2 }).catch(err => console.error('Farm-ekle log gönderme hatası:', err));
    }
  }

  const container = new ContainerBuilder()
    .setAccentColor(0x57F287)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## <a:tik:1507733693903540265> Farm Eklendi`)
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `> ${E.uye} **Kullanıcı:** ${targetUser}\n` +
        `> <:add:1507997878981890108> **Eklenen Miktar:** \`${amount.toLocaleString('tr-TR')}\` farm\n` +
        `> 📊 **Yeni Toplam:** \`${newAmount.toLocaleString('tr-TR')}\` farm`
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

import {
  SlashCommandBuilder, PermissionFlagsBits,
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize,
  MessageFlags
} from 'discord.js';
import { getFarmAmount, setFarmAmount } from '../db.js';
import { hasPermission } from '../utils/permissions.js';
import { E } from '../utils/emojis.js';

export const data = new SlashCommandBuilder()
  .setName('farmcikar')
  .setDescription('Bir üyeden farm değeri çıkarır.')
  .addUserOption(o => o.setName('uye').setDescription('Farm çıkarılacak üye').setRequired(true))
  .addIntegerOption(o => o.setName('miktar').setDescription('Çıkarılacak miktar').setRequired(true));

export async function execute(interaction, client) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!hasPermission(interaction.member, 'farmSorumlusu', client)) {
    return interaction.editReply({ content: '❌ Bu komutu kullanmak için **Farm Sorumlusu** veya **Yönetici** yetkisine sahip olmalısınız.' });
  }
  const targetUser = interaction.options.getUser('uye', true);
  const amount = interaction.options.getInteger('miktar', true);
  if (amount <= 0) return interaction.editReply({ content: '❌ Miktar 0\'dan büyük olmalı.' });
  const farmLogChannelId = client.config.farmLogChannelId || process.env.FARM_LOG_CHANNEL_ID;

  const current = getFarmAmount(interaction.guild.id, targetUser.id);
  const newAmount = Math.max(0, current - amount);
  setFarmAmount(interaction.guild.id, targetUser.id, newAmount);

  // Log kanalına mesaj gönder (Asenkron)
  if (farmLogChannelId && client.config?.farmLogChannelIdEnabled !== false) {
    const logChannel = interaction.guild.channels.cache.get(farmLogChannelId);
    if (logChannel?.isTextBased()) {
    const logContainer = new ContainerBuilder()
      .setAccentColor(0xED4245)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ❌ Farm Çıkarıldı`))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `> 👤 **Hedef:** ${targetUser} (\`${targetUser.tag}\`)\n` +
        `> ➖ **Çıkarılan:** \`${amount.toLocaleString('tr-TR')}\`\n` +
        `> 📊 **Yeni Toplam:** \`${newAmount.toLocaleString('tr-TR')}\`\n` +
        `> 👮 **İşlemi Yapan:** ${interaction.user} (\`${interaction.user.tag}\`)\n` +
        `> 🆔 **ID:** \`${targetUser.id}\``
      ))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));
      logChannel.send({ components: [logContainer], flags: MessageFlags.IsComponentsV2 }).catch(err => console.error('Farm-cikar log gönderme hatası:', err));
    }
  }

  const container = new ContainerBuilder()
    .setAccentColor(0xED4245)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ❌ Farm Çıkarıldı`)
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `> 👤 **Kullanıcı:** ${targetUser}\n` +
        `> ➖ **Çıkarılan Miktar:** \`${amount.toLocaleString('tr-TR')}\` farm\n` +
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

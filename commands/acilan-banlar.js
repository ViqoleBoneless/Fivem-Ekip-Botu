import {
  SlashCommandBuilder, PermissionFlagsBits,
  ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags,
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize
} from 'discord.js';
import { loadBanAffi } from '../db.js';
import { hasPermission } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('acilan-banlar')
  .setDescription('Açılan ban affı taleplerini listeler.');

export async function execute(interaction, client) {
  const isAuthorized = interaction.member.permissions.has(PermissionFlagsBits.Administrator) ||
    hasPermission(interaction.member, 'banCommand', client);

  if (!isAuthorized) {
    return interaction.reply({ content: '❌ Bu komutu kullanmak için **Ban Sorumlusu** veya **Yönetici** yetkisine sahip olmalısınız.', flags: MessageFlags.Ephemeral });
  }

  const allRequests = loadBanAffi();
  const openedRequests = allRequests.filter(req => req.opened === true);
  if (openedRequests.length === 0) {
    return interaction.reply({ content: '❌ Henüz açılan bir ban kaydı bulunmuyor.', flags: MessageFlags.Ephemeral });
  }

  const pageSize = 5;
  const totalPages = Math.ceil(openedRequests.length / pageSize) + 1;
  const firstPageContent = openedRequests.slice(0, 20).map(req => `#${req.id} - <@${req.userId}> (\`${req.userId}\`)`).join('\n');

  const container = new ContainerBuilder()
    .setAccentColor(0x57F287)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ✅ Açılan Banlar Listesi`)
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(firstPageContent || 'Kayıt bulunmuyor.')
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('banaf_acilan_prev_0').setLabel('⬅️ Önceki').setStyle(ButtonStyle.Secondary).setDisabled(true),
    new ButtonBuilder().setCustomId('banaf_acilan_page').setLabel(`1 / ${totalPages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
    new ButtonBuilder().setCustomId('banaf_acilan_next_0').setLabel('Sonraki ➡️').setStyle(ButtonStyle.Secondary).setDisabled(totalPages <= 1)
  );

  container.addActionRowComponents(row);
  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# Viqole Bot\s • Sayfa 1 / ${totalPages}`)
  );

  await interaction.reply({ components: [container], flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
}


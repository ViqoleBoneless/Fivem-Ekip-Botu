import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize
} from 'discord.js';
import { loadBanAffi } from '../db.js';
import { hasPermission } from '../utils/permissions.js';
import { E } from '../utils/emojis.js';

export const data = new SlashCommandBuilder()
  .setName('dosya')
  .setDescription('Belirtilen dosya numarasına veya Discord ID\'sine ait detaylı bilgileri gösterir.')
  .addStringOption((option) =>
    option
      .setName('arama')
      .setDescription('Görüntülenecek dosya numarası veya Discord ID')
      .setRequired(true)
  );

export async function execute(interaction, client) {
  // Yetki Kontrolü
  const isAuthorized = interaction.member.permissions.has(PermissionFlagsBits.Administrator) ||
    hasPermission(interaction.member, 'banCommand', client);

  if (!isAuthorized) {
    return interaction.reply({
      content: '❌ Bu komutu kullanmak için **Ban Sorumlusu** veya **Yönetici** yetkisine sahip olmalısınız.',
      flags: MessageFlags.Ephemeral
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const aramaVal = interaction.options.getString('arama', true).trim();

  const allRequests = loadBanAffi();
  let request;

  const fileId = parseInt(aramaVal, 10);
  if (!isNaN(fileId)) {
    request = allRequests.find(r => r.id === fileId);
  }

  if (!request) {
    request = allRequests.find(r => r.userId === aramaVal);
  }

  if (!request) {
    return interaction.editReply({
      content: `❌ \`${aramaVal}\` değerine ait dosya bulunamadı.`
    });
  }

  try {
    const user = await client.users.fetch(request.userId);

    // Ban durumu
    const banDurumu = request.opened ? '✅ Açıldı' : '❌ Açılmadı';
    const embedColor = request.opened ? 0x2ecc71 : 0x5865f2;

    // Butonlar
    const buttons = [];

    if (request.opened) {
      const deleteButton = new ButtonBuilder()
        .setCustomId(`banaf_delete_${request.id}`)
        .setLabel('Dosyayı Sil')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🗑️');

      const copyButton = new ButtonBuilder()
        .setCustomId(`banaf_copy_${request.id}`)
        .setLabel('Kopyala')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📋');

      buttons.push(deleteButton, copyButton);
    } else {
      const copyButton = new ButtonBuilder()
        .setCustomId(`banaf_copy_${request.id}`)
        .setLabel('Kopyala')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📋');

      buttons.push(copyButton);
    }

    const container = new ContainerBuilder()
      .setAccentColor(embedColor)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## <:733737files:1508008108310528070> #${request.id} Numaralı Dosya`)
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `Dosya detayları aşağıda listelenmiştir:\n\n` +
          `> ${E.uye} **Gönderen Kişi:** ${user} (\`${user.tag}\`)\n` +
          `> <:733737files:1508008108310528070> **Dosya Numarası:** #${request.id}\n` +
          `> <a:loading:1507734684254343218> **Ban Durumu:** ${banDurumu}\n` +
          `> <:animebanned:1507997821729636413> **Ban Türü:** ${request.banType}\n` +
          `> <:sebe:1507997791652413460> **Ban Sebebi:** ${request.banReason}\n` +
          `> <:5990policekanna:1508011189999763518> **Banlayan Kişi:** ${request.bannedBy}\n` +
          `> 🆔 **ID:** \`${request.userId}\``
        )
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
      );

    if (buttons.length > 0) {
      const row = new ActionRowBuilder().addComponents(buttons);
      container.addActionRowComponents(row);
      container.addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
      );
    }

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent('-# Viqole Bot`s')
    );

    await interaction.editReply({
      components: [container]
    });
  } catch (error) {
    console.error('Dosya komutu hatası:', error);
    await interaction.editReply({
      content: '❌ Dosya bilgileri gösterilirken bir hata oluştu.'
    });
  }
}


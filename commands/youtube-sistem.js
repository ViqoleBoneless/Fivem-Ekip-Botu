import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  AttachmentBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { getLogoPath } from '../utils/logoHelper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOGO = path.join(__dirname, '../logo.png');

export const data = new SlashCommandBuilder()
  .setName('youtube-sistem')
  .setDescription('YouTube kanal takip sistemi paneli oluşturur.');

export async function execute(interaction, client) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator))
    return interaction.reply({ content: '❌ Yönetici yetkisi gerekiyor.', ephemeral: true });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('youtube_ekle').setLabel('Ekle').setStyle(ButtonStyle.Success).setEmoji('➕'),
    new ButtonBuilder().setCustomId('youtube_cikart').setLabel('Çıkart').setStyle(ButtonStyle.Danger).setEmoji('➖'),
    new ButtonBuilder().setCustomId('youtube_listele').setLabel('Linkler').setStyle(ButtonStyle.Primary).setEmoji('📋'),
    new ButtonBuilder().setCustomId('youtube_kontrol').setLabel('Kontrol').setStyle(ButtonStyle.Secondary).setEmoji('🔄')
  );

  const container = new ContainerBuilder()
    .setAccentColor(0xFF0000)
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL('attachment://logo.png')
      )
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('# <a:youtube:1507744406500020345> YOUTUBE KANAL TAKİP SİSTEMİ')
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '<a:emoji:1506242550233829427> **YouTube Kanal Takip Sistemi**\n' +
        '> *YouTube kanallarını takip etmek ve yeni videoları otomatik duyurmak için bu paneli kullanın.*\n\n' +
        '> *<a:duyuruvar:1507733857917735022> Yeni videolar otomatik olarak duyurulacaktır.*'
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small)
    )
    .addActionRowComponents(row)
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('-# Viqole Bot\'s - YouTube Takip Sistemi')
    );

  try {
    await interaction.deferReply();
    const logoPath = getLogoPath(client);
    await interaction.editReply({
      components: [container],
      files: [new AttachmentBuilder(logoPath, { name: 'logo.png' })],
      flags: MessageFlags.IsComponentsV2
    });
  } catch (err) {
    console.error('YouTube sistem panel hatası:', err);
    try {
      if (interaction.deferred) await interaction.editReply({ content: '❌ Panel oluşturulurken hata oluştu.' });
      else await interaction.reply({ content: '❌ Panel oluşturulurken hata oluştu.', flags: MessageFlags.Ephemeral });
    } catch {}
  }
}

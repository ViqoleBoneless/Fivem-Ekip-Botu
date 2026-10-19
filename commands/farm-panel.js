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
  .setName('farm-panel')
  .setDescription('Farm teslim sistemi için butonlu panel oluşturur (kullanılan kanala gönderir).');

export async function execute(interaction, client) {
  // Yetki Kontrolü
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({
      content: '❌ Bu komutu kullanmak için Yönetici yetkisine sahip olmalısınız.',
      ephemeral: true
    });
  }

  const channel = interaction.channel;
  const guild = interaction.guild;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('farm_submit_btn')
      .setLabel('Teslim Ettim')
      .setStyle(ButtonStyle.Success)
      .setEmoji('📦')
  );

  const container = new ContainerBuilder()
    .setAccentColor(0x2ecc71)
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL('attachment://logo.png')
      )
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('# 🌾 FARM TESLİM PANELİ')
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '<a:emoji:1506242550233829427> **Farm Teslimat Sistemi**\n' +
        '> *Farm teslimatlarınızı yetkililere kolayca bildirmek için bu paneli kullanabilirsiniz.*\n\n' +
        '🔹 **Nasıl Bildirim Yapılır?**\n' +
        '> 1️⃣ Aşağıdaki **📦 Teslim Ettim** butonuna tıklayın.\n' +
        '> 2️⃣ Açılan formda teslim ettiğiniz **Farm Miktarını** ve **Kime Teslim Ettiğinizi** girin.\n' +
        '> 3️⃣ Talebiniz yetkililere iletilecek, sonuç **DM** ile bildirilecektir.'
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
      new TextDisplayBuilder().setContent('-# Viqole Bot\'s - Farm Kontrol Sistemi')
    );

  try {
    const logoPath = getLogoPath(client);
    await channel.send({
      components: [container],
      files: [new AttachmentBuilder(logoPath, { name: 'logo.png' })],
      flags: MessageFlags.IsComponentsV2
    });
    await interaction.reply({
      content: `✅ Farm teslim paneli başarıyla bu kanala kuruldu.`,
      ephemeral: true
    });
  } catch (error) {
    console.error('Farm panel kurulum hatası:', error);
    await interaction.reply({
      content: '❌ Panel kurulurken teknik bir hata oluştu.',
      ephemeral: true
    });
  }
}

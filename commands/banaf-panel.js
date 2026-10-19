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
import { E } from '../utils/emojis.js';
import { getLogoPath } from '../utils/logoHelper.js';

export const data = new SlashCommandBuilder()
  .setName('banaf-panel')
  .setDescription('Ban affı sistemi panelini oluşturur.');

export async function execute(interaction, client) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator))
    return interaction.reply({ content: '❌ Yönetici yetkisi gerekiyor.', flags: MessageFlags.Ephemeral });

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const channel = interaction.channel;

  // ── Butonlar ──
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('banaf_talep_olustur')
      .setLabel('Talep Oluştur')
      .setStyle(ButtonStyle.Primary)
      .setEmoji({ id: '1507733693903540265' }),  // <a:tik:1507733693903540265>
    new ButtonBuilder()
      .setCustomId('banaf_kendi_talebi')
      .setLabel('Talebimi Görüntüle')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji({ id: '1507733980131102870' })   // E.liste
  );

  // ── Container V2 ──
  const container = new ContainerBuilder()
    .setAccentColor(0x2B2D31)
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL('attachment://logo.png')
      )
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`# ${E.banAffi} Ban Affı Sistemi`)
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `Banınızın kaldırılması için aşağıdaki butonlardan talepte bulunabilirsiniz.\n\n` +
        `<a:tik:1507733693903540265> **Talep Oluştur** — Yeni bir ban affı talebi açar\n` +
        `${E.liste} **Talebimi Görüntüle** — Mevcut talebinizi kontrol edin`
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
      new TextDisplayBuilder().setContent(`-# <:733737files:1508008108310528070> Her kullanıcının yalnızca bir açık talebi olabilir.`)
    );

  try {
    const logoPath = getLogoPath(client);
    await channel.send({
      components: [container],
      files: [new AttachmentBuilder(logoPath, { name: 'logo.png' })],
      flags: MessageFlags.IsComponentsV2
    });
    await interaction.editReply({ content: `${E.tik} Ban affı sistemi paneli bu kanala gönderildi.` });
  } catch (error) {
    console.error('Ban affı sistemi hatası:', error);
    await interaction.editReply({ content: '❌ Panel gönderilirken hata oluştu.' });
  }
}

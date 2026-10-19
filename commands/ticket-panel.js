import {
  SlashCommandBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  PermissionFlagsBits,
  MessageFlags
} from 'discord.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { getLogoPath } from '../utils/logoHelper.js';
import { E } from '../utils/emojis.js';
import { getTicketConfig } from '../db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const data = new SlashCommandBuilder()
  .setName('ticket-panel')
  .setDescription('Ticket panelini bu kanala gönderir.');

export function getTicketPanelAttachments(client) {
  const logoPath = getLogoPath(client);
  const files = [];
  if (fs.existsSync(logoPath)) {
    files.push(new AttachmentBuilder(logoPath, { name: 'logo.png' }));
  } else {
    const defaultLogo = path.resolve(process.cwd(), 'logo.png');
    if (fs.existsSync(defaultLogo)) {
      files.push(new AttachmentBuilder(defaultLogo, { name: 'logo.png' }));
    }
  }
  return files;
}

// ─── 1. GÖRÜNÜM: Klasik (Varsayılan - Üst Banner & Standart Bloklar) ───
function buildStyle1(client, componentsList, isClosed, embedColorInt) {
  const headerContent = isClosed
    ? `# ${client.config.ekipIsmi || 'Destek Paneli'}\n\`\`\`ansi\n\u001b[1;31mKAPALI\u001b[0m\n\`\`\``
    : `# ${client.config.ekipIsmi || 'Destek Paneli'}`;

  const container = new ContainerBuilder()
    .setAccentColor(embedColorInt)
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL('attachment://logo.png')
      )
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(headerContent)
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `<a:emoji:1506242550233829427> **Viqole Ticket Sistemi:**\n` +
        `> *Başvuru Ve Destek Almak İçin Kategorilerden Ticket Açabilirsiniz!*`
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `🔹 **Ek Bilgi:**\n` +
        `> *Ticket Açmak İçin Aşağıdaki Seçenekleri Kullanabilirsiniz. Sorumlular En Kısa Sürede Yanıtlayacaktır.*`
      )
    );

  componentsList.forEach(comp => container.addActionRowComponents(comp));

  container
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('-# Viqole Bots')
    );

  return container;
}

// ─── 2. GÖRÜNÜM: Modern V2 (Özgün, Sade & Alt Menülü) ───
function buildStyle2(client, componentsList, isClosed, embedColorInt) {
  const statusBadge = isClosed ? `\n\n${E.unlem || '⚠️'} \`BAŞVURULAR ŞU ANDA KAPALIDIR\`` : '';
  const ownerId = (client.config.ownerIds || '461096891371880449').split(',')[0].trim() || '461096891371880449';

  const container = new ContainerBuilder();

  // Başlık & Açıklama (Büyük Başlık ve Link formatında)
  container
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `# [Ticket Paneli](https://discord.com/users/${ownerId})\n` +
        `> ${E.coffe || '<a:coffe:1517808496748527726>'} **Destek & Başvuru:** Aşağıdaki menüden uygun kategoriyi seçerek ticket açabilirsiniz.\n` +
        `> ${E.info || '<:info:1507746625508868157>'} **Bilgilendirme:** Açılan kanalda yetkili ekibimiz en kısa sürede size yardımcı olacaktır.${statusBadge}`
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL('attachment://logo.png')
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    );

  // Etkileşim Alanı (Dropdown / Butonlar) - Resmin ALTINDA
  componentsList.forEach(comp => container.addActionRowComponents(comp));

  // Ayrım çizgisi (çubuklu) & Footer
  container
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('-# Viqole Bots')
    );

  return container;
}

export function buildTicketPanel(client) {
  const configCategories = client.config.ticketCategories || [];
  const activeCategories = configCategories.length > 0
    ? configCategories.filter(c => c.enabled)
    : [
        { id: 'destek', label: 'Destek', emoji: '1507734289255628990', description: 'Destek almak için ticket açın', enabled: true },
        { id: 'basvuru', label: 'Başvuru', emoji: '1507733959432208515', description: 'Ekibe katılmak için başvurun', enabled: true },
        { id: 'referans', label: 'Referans ile Alım', emoji: '1507734363046150204', description: 'Referans ile alım için başvurun', enabled: true }
      ];

  const panelType = client.config.ticketPanelType || 'select';
  
  const guildId = client.config.guildId;
  let dbPanelStyle = null;
  if (guildId) {
    try {
      const dbCfg = getTicketConfig(guildId);
      if (dbCfg && dbCfg.panelStyle) dbPanelStyle = dbCfg.panelStyle;
    } catch (_) {}
  }
  const panelStyle = dbPanelStyle || client.config.ticketPanelStyle || 'style1';
  const componentsList = [];
  const isClosed = client.config.basvuruDurumu === 'kapali';

  if (panelType === 'button') {
    const buttonRows = [];
    let currentRow = new ActionRowBuilder();
    
    activeCategories.forEach((c, index) => {
      if (index > 0 && index % 5 === 0) {
        buttonRows.push(currentRow);
        currentRow = new ActionRowBuilder();
      }
      
      const styleName = c.buttonStyle || 'Primary';
      const btn = new ButtonBuilder()
        .setCustomId(`ticket_category_btn_${c.id}`)
        .setLabel(c.label)
        .setStyle(ButtonStyle[styleName] || ButtonStyle.Primary)
        .setDisabled(isClosed);
      
      if (c.emoji) {
        btn.setEmoji(c.emoji);
      }
      currentRow.addComponents(btn);
    });

    if (currentRow.components.length > 0) {
      buttonRows.push(currentRow);
    }
    
    buttonRows.forEach(row => componentsList.push(row));
  } else {
    const selectOptions = activeCategories.map(c => {
      const builder = new StringSelectMenuOptionBuilder()
        .setLabel(c.label)
        .setValue(c.id)
        .setDescription(c.description || '');
      if (c.emoji) {
        builder.setEmoji(c.emoji);
      }
      return builder;
    });

    selectOptions.push(
      new StringSelectMenuOptionBuilder()
        .setLabel('Seçenekleri Sıfırla')
        .setValue('reset')
        .setEmoji('🧹')
        .setDescription('Seçimi sıfırla')
    );

    const selectMenu = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('ticket_category')
        .setPlaceholder('Ticket Açmak İçin Kategori Seçiniz..')
        .addOptions(selectOptions)
        .setDisabled(isClosed)
    );

    componentsList.push(selectMenu);
  }

  const embedColorHex = client.config.ticketEmbedColor || '#2B2D7A';
  const embedColorInt = parseInt(embedColorHex.replace('#', ''), 16) || 0x2B2D7A;

  if (panelStyle === 'style2' || panelStyle === 'modern') {
    return buildStyle2(client, componentsList, isClosed, embedColorInt);
  } else {
    return buildStyle1(client, componentsList, isClosed, embedColorInt);
  }
}

export async function execute(interaction, client) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator))
    return interaction.reply({ content: '❌ Yönetici yetkisi gerekiyor.', ephemeral: true });

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const files = getTicketPanelAttachments(client);
  const container = buildTicketPanel(client);

  const sentMessage = await interaction.channel.send({
    components: [container],
    files: files,
    flags: MessageFlags.IsComponentsV2
  });

  const cp = client.configPath;
  if (cp && fs.existsSync(cp)) {
    const currentConfig = JSON.parse(fs.readFileSync(cp, 'utf8'));
    currentConfig.ticketPanelMessageId = sentMessage.id;
    fs.writeFileSync(cp, JSON.stringify(currentConfig, null, 2), 'utf8');
    client.config = currentConfig;
  }
  await interaction.editReply({ content: '✅ Ticket paneli gönderildi.' });
}

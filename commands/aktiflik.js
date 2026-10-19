import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags
} from 'discord.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadActivity, saveActivity } from '../db.js';
import { getLogoPath } from '../utils/logoHelper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOGO = path.join(__dirname, '../logo.png');

function parseDuration(str) {
  const m = str.match(/^(\d+)([smhd])$/);
  if (!m) return null;
  const v = parseInt(m[1], 10);
  const u = m[2];
  return u === 's' ? v * 1000 : u === 'm' ? v * 60000 : u === 'h' ? v * 3600000 : v * 86400000;
}

export const data = new SlashCommandBuilder()
  .setName('aktiflik')
  .setDescription('Belirtilen rol için aktiflik kontrolü başlatır.')
  .addRoleOption(o => o.setName('rol').setDescription('Aktifliği kontrol edilecek rol').setRequired(true))
  .addStringOption(o => o.setName('sure').setDescription('Süre (örn: 10m, 2h, 5d)').setRequired(true))
  .addChannelOption(o => o.setName('kanal').setDescription('Mesajın gönderileceği kanal (boş bırakılırsa mevcut kanal)').setRequired(false));

export async function execute(interaction, client) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles))
    return interaction.reply({ content: '❌ "Rolleri Yönet" yetkisi gerekiyor.', flags: MessageFlags.Ephemeral });

  const role = interaction.options.getRole('rol');
  const durationStr = interaction.options.getString('sure');
  const channel = interaction.options.getChannel('kanal') || interaction.channel;

  if (!channel?.isTextBased()) return interaction.reply({ content: '❌ Lütfen bir metin kanalı seçin veya komutu bir metin kanalında kullanın.', flags: MessageFlags.Ephemeral });

  const durationMs = parseDuration(durationStr);
  if (!durationMs) return interaction.reply({ content: '❌ Geçersiz süre formatı! Örnekler: `10m`, `2h`, `5d`', flags: MessageFlags.Ephemeral });

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const now = Date.now();
  const expiresAt = now + durationMs;

  const logoPath = getLogoPath(client);
  const attachment = new AttachmentBuilder(logoPath, { name: 'logo.png' });

  const button = new ButtonBuilder()
    .setCustomId('activity_join')
    .setLabel('✅  Katıl')
    .setStyle(ButtonStyle.Success);

  const row = new ActionRowBuilder().addComponents(button);

  const container = new ContainerBuilder()
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL('attachment://logo.png')
      )
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('# <a:duyuruvar:1507733857917735022> AKTİFLİK KONTROLÜ')
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '> **Belirtilen rol için aktiflik kontrolü başlatılmıştır.**\n' +
        '> **Katılım için aşağıdaki butona tıklayın!**\n\n' +
        `<:MemberJoined:1509702256289648833> **Katılımcı Sayısı:** 0\n` +
        `<a:TimerSand:1509704018199449680> **Kalan Süre:** <t:${Math.floor(expiresAt / 1000)}:R>`
      )
    )
    .addActionRowComponents(row)
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('-# Viqole Bots')
    );

  let message;
  try {
    message = await channel.send({
      components: [container],
      files: [attachment],
      flags: MessageFlags.IsComponentsV2
    });
  } catch (error) {
    return interaction.editReply({ content: `❌ Mesaj gönderilemedi: ${error.message}` });
  }

  // aktif-işlemler kanalına yönetim mesajı gönder
  let mgmtMessageId = null;
  const aktifIslemlerChannelId = client.config?.aktifIslemlerChannelId;
  if (aktifIslemlerChannelId) {
    const mgmtChannel = interaction.guild.channels.cache.get(aktifIslemlerChannelId)
      || await interaction.guild.channels.fetch(aktifIslemlerChannelId).catch(() => null);
    if (mgmtChannel?.isTextBased()) {
      const mgmtRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`aktif_akt_sonlandir_${message.id}`).setLabel('Hemen Sonlandır').setStyle(ButtonStyle.Danger).setEmoji('⛔'),
        new ButtonBuilder().setCustomId(`aktif_akt_sure_${message.id}`).setLabel('Süre Uzat').setStyle(ButtonStyle.Primary).setEmoji('⏱️'),
        new ButtonBuilder().setCustomId(`aktif_akt_katilanlar_${message.id}`).setLabel('Katılanlar (.txt)').setStyle(ButtonStyle.Secondary).setEmoji('📄'),
        new ButtonBuilder().setCustomId(`aktif_akt_katilmayanlar_${message.id}`).setLabel('Katılmayanlar (.txt)').setStyle(ButtonStyle.Secondary).setEmoji('📄')
      );
      const mgmtContainer = new ContainerBuilder()
        .setAccentColor(0x57F287)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🎛️ Aktiflik Yönetimi`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `> 🎯 **Hedef Rol:** ${role}\n` +
          `> ⏰ **Bitiş Tarihi:** <t:${Math.floor(expiresAt / 1000)}:F>\n` +
          `> <:hash:1507734074805063731> **Kanal:** ${channel}\n` +
          `> 🔗 **Mesaj:** [Tıkla](https://discord.com/channels/${interaction.guild.id}/${channel.id}/${message.id})\n` +
          `> 👤 **Başlatan:** ${interaction.user}`
        ))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addActionRowComponents(mgmtRow)
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bots'));
      const mgmtMsg = await mgmtChannel.send({ components: [mgmtContainer], flags: MessageFlags.IsComponentsV2 }).catch(err => console.error('Aktif-işlemler aktiflik mesajı hatası:', err));
      if (mgmtMsg) mgmtMessageId = mgmtMsg.id;
    }
  }

  const activities = loadActivity();
  activities.push({
    guildId: interaction.guild.id, channelId: channel.id, messageId: message.id,
    mgmtMessageId,
    roleId: role.id, createdAt: now, expiresAt, processed: false, participants: []
  });
  saveActivity(activities);

  // Aktiflik Başlatıldı Logu
  const logChannelId = client.config.activityLogChannelIdEnabled !== false ? client.config.activityLogChannelId : null;
  if (logChannelId) {
    const logChannel = interaction.guild.channels.cache.get(logChannelId) || await interaction.guild.channels.fetch(logChannelId).catch(() => null);
    if (logChannel?.isTextBased()) {
      const logContainer = new ContainerBuilder()
        .setAccentColor(0x3498db)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 📢 Aktiflik Kontrolü Başlatıldı`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `> <:5990policekanna:1508011189999763518> **Başlatan:** ${interaction.user} (\`${interaction.user.tag}\`)\n` +
          `> 🎯 **Hedef Rol:** ${role} (\`${role.name}\`)\n` +
          `> <a:TimerSand:1509704018199449680> **Süre:** \`${durationStr}\`\n` +
          `> <:hash:1507734074805063731> **Kanal:** ${channel} (\`#${channel.name}\`)\n` +
          `> <:balant:1506291932752515254> **Mesaj:** [Tıkla](https://discord.com/channels/${interaction.guild.id}/${channel.id}/${message.id})`
        ))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bots'));
      logChannel.send({ components: [logContainer], flags: MessageFlags.IsComponentsV2 }).catch(err => console.error('Aktiflik log gönderme hatası:', err));
    }
  }

  await interaction.editReply({ content: `✅ Aktiflik kontrolü başlatıldı! Mesaj: ${channel}` });
}


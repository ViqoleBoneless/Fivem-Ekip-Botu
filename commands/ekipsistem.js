import {
  SlashCommandBuilder,
  ChannelType,
  AttachmentBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  PermissionFlagsBits,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonStyle,
  ButtonBuilder,
  OverwriteType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder
} from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);

import { getTicketConfig, setTicketConfig, setPanelSizBanAfGuild } from '../db.js';
import { getLogoPath } from '../utils/logoHelper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOGO = path.join(__dirname, '../logo.png');
const configPathDefault = path.join(__dirname, '../config.json');

// --- Sistem Sabitleri ---
const SYSTEM_ROLES = [
  { key: 'banCommandRoleId', name: 'Ban Command', color: '#e74c3c' },
  { key: 'ticketStaffRoleId', name: 'Alım Sorumlusu', color: '#3498db' },
  { key: 'onayRoleId', name: 'Ekip Üyesi', color: '#2ecc71', manual: true },
  { key: 'ytSorumlusuRoleId', name: 'YT Sorumlusu', color: '#FF0000' },
  { key: 'farmSorumlusuRoleId', name: 'Farm Sorumlusu', color: '#f1c40f' }
];

const SYSTEM_CATEGORIES = [
  { key: 'yonetimCategoryId', name: 'YÖNETİM' },
  { key: 'killCategoryId', name: 'KİLL' }
];

const SYSTEM_CHANNELS = [
  { key: 'videoChannelId', name: 'video-paylasim', type: ChannelType.GuildText },
  { key: 'warningPublicChannelId', name: 'uyarılar', type: ChannelType.GuildText },
  // Under YÖNETİM
  { key: 'farmManagementChannelId', name: 'farm-yönetim', type: ChannelType.GuildText, parentName: 'YÖNETİM', parentCategoryKey: 'yonetimCategoryId', privateFor: 'farmSorumlusuRoleId' },
  { key: 'youtubeManagementChannelId', name: 'youtube-yönetim', type: ChannelType.GuildText, parentName: 'YÖNETİM', parentCategoryKey: 'yonetimCategoryId', privateFor: 'ytSorumlusuRoleId' },
  { key: 'banAffiManagementChannelId', name: 'ban-affı-yönetim', type: ChannelType.GuildText, parentName: 'YÖNETİM', parentCategoryKey: 'yonetimCategoryId', privateFor: 'banCommandRoleId' },
  { key: 'aktifIslemlerChannelId', name: 'aktif-işlemler', type: ChannelType.GuildText, parentName: 'YÖNETİM', parentCategoryKey: 'yonetimCategoryId' },
  // Under Viqole Komut Log
  { key: 'warningLogChannelId', name: 'uyari-log', type: ChannelType.GuildText, parentName: 'Viqole Komut Log', parentCategoryKey: 'komutLogCategoryId', parentFallbackKey: 'logCategoryId' },
  { key: 'farmLogChannelId', name: 'farm-log', type: ChannelType.GuildText, parentName: 'Viqole Komut Log', parentCategoryKey: 'komutLogCategoryId', parentFallbackKey: 'logCategoryId' },
  { key: 'ticketLogChannelId', name: 'ticket-log', type: ChannelType.GuildText, parentName: 'Viqole Komut Log', parentCategoryKey: 'komutLogCategoryId', parentFallbackKey: 'logCategoryId' },
  { key: 'youtubeLogChannelId', name: 'youtube-log', type: ChannelType.GuildText, parentName: 'Viqole Komut Log', parentCategoryKey: 'komutLogCategoryId', parentFallbackKey: 'logCategoryId' },
  { key: 'dmDuyuruLogChannelId', name: 'dm-duyuru-log', type: ChannelType.GuildText, parentName: 'Viqole Komut Log', parentCategoryKey: 'komutLogCategoryId', parentFallbackKey: 'logCategoryId' },
  { key: 'botLogChannelId', name: 'bot-log', type: ChannelType.GuildText, parentName: 'Viqole Komut Log', parentCategoryKey: 'komutLogCategoryId', parentFallbackKey: 'logCategoryId' },
  { key: 'banAfLogChannelId', name: 'ban-affı-log', type: ChannelType.GuildText, parentName: 'Viqole Komut Log', parentCategoryKey: 'komutLogCategoryId', parentFallbackKey: 'logCategoryId' },
  { key: 'activityLogChannelId', name: 'aktiflik-log', type: ChannelType.GuildText, parentName: 'Viqole Komut Log', parentCategoryKey: 'komutLogCategoryId', parentFallbackKey: 'logCategoryId' },
  // Under Viqole Sunucu Log
  { key: 'messageLogChannelId', name: 'mesaj-log', type: ChannelType.GuildText, parentName: 'Viqole Sunucu Log', parentCategoryKey: 'sunucuLogCategoryId', parentFallbackKey: 'logCategoryId' },
  { key: 'banLogChannelId', name: 'ban-unban-log', type: ChannelType.GuildText, parentName: 'Viqole Sunucu Log', parentCategoryKey: 'sunucuLogCategoryId', parentFallbackKey: 'logCategoryId' },
  { key: 'sesLogChannelId', name: 'ses-log', type: ChannelType.GuildText, parentName: 'Viqole Sunucu Log', parentCategoryKey: 'sunucuLogCategoryId', parentFallbackKey: 'logCategoryId' },
  { key: 'davetLogChannelId', name: 'davet-log', type: ChannelType.GuildText, parentName: 'Viqole Sunucu Log', parentCategoryKey: 'sunucuLogCategoryId', parentFallbackKey: 'logCategoryId' },
  { key: 'girisLogChannelId', name: 'giris-cikis-log', type: ChannelType.GuildText, parentName: 'Viqole Sunucu Log', parentCategoryKey: 'sunucuLogCategoryId', parentFallbackKey: 'logCategoryId' },
  { key: 'roleLogChannelId', name: 'rol-log', type: ChannelType.GuildText, parentName: 'Viqole Sunucu Log', parentCategoryKey: 'sunucuLogCategoryId', parentFallbackKey: 'logCategoryId' },
  { key: 'kanalLogChannelId', name: 'kanal-log', type: ChannelType.GuildText, parentName: 'Viqole Sunucu Log', parentCategoryKey: 'sunucuLogCategoryId', parentFallbackKey: 'logCategoryId' },
  { key: 'isimLogChannelId', name: 'isim-log', type: ChannelType.GuildText, parentName: 'Viqole Sunucu Log', parentCategoryKey: 'sunucuLogCategoryId', parentFallbackKey: 'logCategoryId' }
];

export const data = new SlashCommandBuilder()
  .setName('ekipsistem')
  .setDescription('Ekip yönetim sistemi kurulum ve güncelleme kontrol paneli.');

export async function execute(interaction, client) {
  const activeConfigPath = client.configPath || configPathDefault;

  let currentConfig = {};
  if (fs.existsSync(activeConfigPath)) {
    try {
      currentConfig = JSON.parse(fs.readFileSync(activeConfigPath, 'utf8'));
    } catch { }
  }

  // Yetki Kontrolü: Sunucu Sahibi, Bot Sahibi veya Yönetici
  const ownerIdsStr = currentConfig.ownerIds || '';
  const ownerIds = ownerIdsStr.split(',').map(id => id.trim()).filter(Boolean);
  const isGuildOwner = interaction.guild.ownerId === interaction.user.id;
  const isBotOwner = ownerIds.includes(interaction.user.id);
  const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

  if (!isGuildOwner && !isBotOwner && !isAdmin) {
    return interaction.reply({
      content: '❌ Bu komutu kullanmak için **Sunucu Sahibi**, **Bot Sahibi** veya **Yönetici** yetkisine sahip olmalısınız.',
      flags: MessageFlags.Ephemeral
    });
  }

  const embed = new ContainerBuilder()
    .setAccentColor(0x2B2D7A)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ⚙️ Ekip Yönetim Sistemi Kontrol Paneli`))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `Lütfen yapmak istediğiniz işlemi seçin:\n\n` +
      `🚀 **Ekip Sistemini Kur:** Sunucuda yönetim rolleri, log kanalları ve yönetim panellerini kurar.\n\n` +
      `🔄 **Sistemi Güncelle:** Mevcut sunucu yapısını tarayıp eksik olan rol/kanalları tamamlar.`
    ))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ekipsistem_kur_btn').setLabel('Ekip Sistemini Kur').setStyle(ButtonStyle.Primary).setEmoji('🚀'),
        new ButtonBuilder().setCustomId('ekipsistem_guncelle_btn').setLabel('Sistemi Güncelle').setStyle(ButtonStyle.Secondary).setEmoji('🔄')
      )
    )
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));

  const response = await interaction.reply({
    components: [embed],
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
  });

  const collector = response.createMessageComponentCollector({
    filter: i => i.user.id === interaction.user.id,
    time: 600000
  });

  collector.on('collect', async (i) => {
    if (i.customId === 'ekipsistem_kur_btn') {
      const banafSelectMenu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('ekipsistem_banaf_select')
          .setPlaceholder('Ban Affı Sistemi Seçiniz')
          .addOptions(
            new StringSelectMenuOptionBuilder().setLabel('Panelli Sistem').setValue('panelli').setDescription('Ban affı başvuru kanalı panelli olur.'),
            new StringSelectMenuOptionBuilder().setLabel('Panelsiz Sistem').setValue('panelsiz').setDescription('Ban affı başvuru kanalına panel gönderilmez.')
          )
      );

      const container = new ContainerBuilder()
        .setAccentColor(0x2B2D7A)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('Lütfen kurulacak Ban Affı sistemi türünü seçiniz:'))
        .addActionRowComponents(banafSelectMenu);

      await i.update({
        components: [container]
      });
      // collector continues for the select menu
    }

    if (i.customId === 'ekipsistem_banaf_select') {
      const banafTipi = i.values[0];
      
      const modal = new ModalBuilder()
        .setCustomId(`ekipsistem_kur_modal_${banafTipi}`)
        .setTitle('Ekip Sistemini Kur');

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('owner_ids_input')
            .setLabel('Ekip Sahibi Discord ID (ownerIds)')
            .setPlaceholder('Birden fazla ise virgül ile ayırın (Örn: ID1,ID2)')
            .setStyle(TextInputStyle.Short)
            .setValue(currentConfig.ownerIds || interaction.user.id)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('onay_role_id_input')
            .setLabel('Ekip Üyesi (Member) Rol ID (Zorunlu)')
            .setPlaceholder('Sunucudaki üye rolünün ID\'sini girin (Örn: 123456...)')
            .setStyle(TextInputStyle.Short)
            .setValue(currentConfig.onayRoleId || '')
            .setRequired(true)
        )
      );

      await i.showModal(modal);
      collector.stop('modal_shown');
    }

    if (i.customId === 'ekipsistem_guncelle_btn') {
      if (!currentConfig.banAffiTipi) {
        const banafSelectMenu = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('ekipsistem_guncelle_banaf_select')
            .setPlaceholder('Ban Affı Sistemi Seçiniz')
            .addOptions(
              new StringSelectMenuOptionBuilder().setLabel('Panelli Sistem').setValue('panelli').setDescription('Ban affı başvuru kanalı panelli olur.'),
              new StringSelectMenuOptionBuilder().setLabel('Panelsiz Sistem').setValue('panelsiz').setDescription('Ban affı başvuru kanalına panel gönderilmez.')
            )
        );

        const container = new ContainerBuilder()
          .setAccentColor(0x2B2D7A)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent('Sistemde Ban Affı yapılandırması eksik. Lütfen kurulacak Ban Affı sistemi türünü seçiniz:'))
          .addActionRowComponents(banafSelectMenu);

        await i.update({
          components: [container]
        });
        return; // collector continues
      }

      collector.stop('guncelle_selected');
      await handleGuncelleFlow(i, client, activeConfigPath);
    }

    if (i.customId === 'ekipsistem_guncelle_banaf_select') {
      const banafTipi = i.values[0];
      currentConfig.banAffiTipi = banafTipi;
      fs.writeFileSync(activeConfigPath, JSON.stringify(currentConfig, null, 2), 'utf8');
      
      if (banafTipi === 'panelsiz') {
         setPanelSizBanAfGuild(interaction.guild.id, {
            active: true,
            yazmaKanalId: currentConfig.banAfChannelId,
            banListeKanalId: currentConfig.banAffiManagementChannelId,
            banListeMesajId: null,
            entries: []
         });
      }

      collector.stop('guncelle_selected');
      await handleGuncelleFlow(i, client, activeConfigPath);
    }
  });
}

// --- MODAL SUBMIT: EKİP SİSTEMİNİ KUR ---
export async function handleKurModalSubmit(interaction, client, banafTipi = 'panelli') {
  const logoPath = getLogoPath(client);
  const activeConfigPath = client.configPath || configPathDefault;
  const ownerIdsInput = interaction.fields.getTextInputValue('owner_ids_input')?.trim() || '';
  const onayRoleIdInput = interaction.fields.getTextInputValue('onay_role_id_input')?.trim() || '';

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // 1. Ekip Üyesi (onayRoleId) Doğrulaması
  if (!/^\d{17,20}$/.test(onayRoleIdInput)) {
    return interaction.editReply({
      content: '❌ **Geçersiz Rol ID Formatı!**\nEkip Üyesi Rol ID\'si 17-20 haneli rakamlardan oluşmalıdır. Lütfen Discord üzerinden doğru rol ID\'sini kopyalayıp tekrar deneyiniz.'
    });
  }

  const guild = interaction.guild;
  await guild.channels.fetch().catch(() => null);
  await guild.roles.fetch().catch(() => null);

  const targetOnayRole = guild.roles.cache.get(onayRoleIdInput) || await guild.roles.fetch(onayRoleIdInput).catch(() => null);
  if (!targetOnayRole) {
    return interaction.editReply({
      content: `❌ **Rol Bulunamadı!**\n\`${onayRoleIdInput}\` ID'sine sahip bir rol bu sunucuda bulunamadı. Lütfen sunucunuzda var olan geçerli bir rolün ID'sini giriniz.`
    });
  }

  let currentConfig = {};
  if (fs.existsSync(activeConfigPath)) {
    try {
      currentConfig = JSON.parse(fs.readFileSync(activeConfigPath, 'utf8'));
    } catch { }
  }

  currentConfig.ownerIds = ownerIdsInput.split(',').map(id => id.trim()).filter(Boolean).join(',');
  currentConfig.banAffiTipi = banafTipi;
  currentConfig.onayRoleId = targetOnayRole.id;

  const reports = [];

  // Helper functions
  async function getOrCreateRole(optionName, configKey, defaultName, color) {
    const roleOptions = {
      name: defaultName,
      reason: 'Ekip yönetim sistemi kurulumu.'
    };
    const isNoColorRole = (defaultName === 'Ban Command' || defaultName === 'Alım Sorumlusu');
    if (!isNoColorRole && color) {
      roleOptions.color = color;
    }

    const role = await guild.roles.create(roleOptions);
    currentConfig[configKey] = role.id;
    reports.push(`  ➕ **${defaultName} Rolü:** Otomatik Oluşturuldu (${role})`);
    return role.id;
  }

  async function getOrCreateChannel(optionName, configKey, defaultName, type, parentId = null) {
    const options = {
      name: defaultName,
      type: type,
      reason: 'Ekip yönetim sistemi kurulumu.'
    };
    if (parentId) options.parent = parentId;

    const channel = await guild.channels.create(options);
    currentConfig[configKey] = channel.id;
    reports.push(`  ➕ **${defaultName}:** Otomatik Oluşturuldu (${channel})`);
    return channel.id;
  }

  try {
    reports.push('### 🛡️ **Roller ve Genel Kanallar**');
    reports.push(`  🔹 **Ekip Üyesi Rolü:** Belirttiğiniz rol tanımlandı (${targetOnayRole})`);

    // Alım Sorumlusu / Başvuru Sorumlusu rolünü kontrol et
    let ticketStaffRole = guild.roles.cache.find(r => 
      ['alım sorumlusu', 'alim sorumlusu', 'başvuru sorumlusu', 'basvuru sorumlusu'].includes(r.name.toLowerCase())
    );
    let ticketStaffRoleId;
    if (ticketStaffRole) {
      ticketStaffRoleId = ticketStaffRole.id;
      currentConfig.ticketStaffRoleId = ticketStaffRoleId;
      reports.push(`  🔹 **Alım Sorumlusu Rolü:** Sunucudaki mevcut rol tespit edildi ve kullanıldı (${ticketStaffRole})`);
    } else {
      ticketStaffRoleId = await getOrCreateRole('ticket_yetkili_rolu', 'ticketStaffRoleId', 'Alım Sorumlusu', '#3498db');
    }

    const banCommandRoleId = await getOrCreateRole('ban_rolu', 'banCommandRoleId', 'Ban Command', '#e74c3c');
    const ytSorumlusuRoleId = await getOrCreateRole('yt_sorumlusu_rolu', 'ytSorumlusuRoleId', 'YT Sorumlusu', '#FF0000');
    const farmSorumlusuRoleId = await getOrCreateRole('farm_sorumlusu_rolu', 'farmSorumlusuRoleId', 'Farm Sorumlusu', '#f1c40f');

    // KİLL kategorisi
    await getOrCreateChannel('kill_kategorisi', 'killCategoryId', 'KİLL', ChannelType.GuildCategory);

    // video-paylasim kanalı (stream veya içerik adında kanal varsa otomatik seç)
    const existingVideoChannel = guild.channels.cache.find(c =>
      c.type === ChannelType.GuildText && (
        c.name.toLowerCase().includes('stream') ||
        c.name.toLowerCase().includes('içerik') ||
        c.name.toLowerCase().includes('icerik') ||
        c.name.toLowerCase() === 'video-paylasim' ||
        c.name.toLowerCase() === 'video-paylaşım'
      )
    );

    if (existingVideoChannel) {
      currentConfig['videoChannelId'] = existingVideoChannel.id;
      reports.push(`  🔹 **Video Paylaşım Kanalı:** Mevcut kanal tespit edildi ve seçildi (${existingVideoChannel})`);
    } else {
      await getOrCreateChannel('video_kanali', 'videoChannelId', 'video-paylasim', ChannelType.GuildText);
    }

    // uyarilar kanalı
    await getOrCreateChannel('uyarilar_kanali', 'warningPublicChannelId', 'uyarılar', ChannelType.GuildText);

    // BAŞVURU kategorisi ve alt kanalları oluşturulmuyor
    reports.push('\n### 🎫 **Başvuru Sistemi**');
    reports.push('  ℹ️ **BAŞVURU kategorisi ve başvuru kanalları otomatik oluşturulmadı.**');
    reports.push('  Sunucunuzdaki mevcut başvuru/ticket kanallarını web panelinden veya sistem komutlarıyla tanımlayabilirsiniz.');

    // YÖNETİM Kategorisi
    reports.push('\n### 🏛️ **Yönetim Kanalları**');
    const yonetimCategory = await guild.channels.create({
      name: 'YÖNETİM',
      type: ChannelType.GuildCategory,
      permissionOverwrites: [
        { id: guild.id, type: OverwriteType.Role, deny: [PermissionFlagsBits.ViewChannel] },
        { id: guild.members.me.id, type: OverwriteType.Member, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] }
      ],
      reason: 'Ekip yönetim sistemi yönetim kategorisi.'
    });
    currentConfig['yonetimCategoryId'] = yonetimCategory.id;
    reports.push(`  🔒📂 **YÖNETİM Kategorisi:** Oluşturuldu (${yonetimCategory})`);

    const farmMgmtChannel = await guild.channels.create({
      name: 'farm-yönetim',
      type: ChannelType.GuildText,
      parent: yonetimCategory.id,
      permissionOverwrites: [
        { id: guild.id, type: OverwriteType.Role, deny: [PermissionFlagsBits.ViewChannel] },
        { id: farmSorumlusuRoleId, type: OverwriteType.Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        { id: guild.members.me.id, type: OverwriteType.Member, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] }
      ],
      reason: 'Ekip yönetim sistemi farm yönetim kanalı.'
    });
    currentConfig['farmManagementChannelId'] = farmMgmtChannel.id;
    reports.push(`  🌾 **farm-yönetim Kanalı:** Oluşturuldu (${farmMgmtChannel})`);

    const youtubeMgmtChannel = await guild.channels.create({
      name: 'youtube-yönetim',
      type: ChannelType.GuildText,
      parent: yonetimCategory.id,
      permissionOverwrites: [
        { id: guild.id, type: OverwriteType.Role, deny: [PermissionFlagsBits.ViewChannel] },
        { id: ytSorumlusuRoleId, type: OverwriteType.Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        { id: guild.members.me.id, type: OverwriteType.Member, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] }
      ],
      reason: 'Ekip yönetim sistemi YouTube yönetim kanalı.'
    });
    currentConfig['youtubeManagementChannelId'] = youtubeMgmtChannel.id;
    reports.push(`  🎬 **youtube-yönetim Kanalı:** Oluşturuldu (${youtubeMgmtChannel})`);

    const banAffiMgmtChannel = await guild.channels.create({
      name: 'ban-affı-yönetim',
      type: ChannelType.GuildText,
      parent: yonetimCategory.id,
      permissionOverwrites: [
        { id: guild.id, type: OverwriteType.Role, deny: [PermissionFlagsBits.ViewChannel] },
        { id: banCommandRoleId, type: OverwriteType.Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        { id: guild.members.me.id, type: OverwriteType.Member, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] }
      ],
      reason: 'Ekip yönetim sistemi ban affı yönetim kanalı.'
    });
    currentConfig['banAffiManagementChannelId'] = banAffiMgmtChannel.id;
    reports.push(`  📋 **ban-affı-yönetim Kanalı:** Oluşturuldu (${banAffiMgmtChannel})`);

    const aktifIslemlerChannel = await guild.channels.create({
      name: 'aktif-işlemler',
      type: ChannelType.GuildText,
      parent: yonetimCategory.id,
      permissionOverwrites: [
        { id: guild.id, type: OverwriteType.Role, deny: [PermissionFlagsBits.ViewChannel] },
        { id: guild.members.me.id, type: OverwriteType.Member, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] }
      ],
      reason: 'Ekip yönetim sistemi aktif işlemler kanalı.'
    });
    currentConfig['aktifIslemlerChannelId'] = aktifIslemlerChannel.id;
    reports.push(`  🎛️ **aktif-işlemler Kanalı:** Oluşturuldu (${aktifIslemlerChannel})`);

    // Log Kanalları
    reports.push('\n### 📝 **Özel Log Kanalları**');
    const komutLogCategory = await guild.channels.create({
      name: 'Viqole Komut Log',
      type: ChannelType.GuildCategory,
      permissionOverwrites: [
        { id: guild.id, type: OverwriteType.Role, deny: [PermissionFlagsBits.ViewChannel] },
        { id: guild.members.me.id, type: OverwriteType.Member, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] }
      ],
      reason: 'Ekip komut log kategorisi.'
    });
    currentConfig['komutLogCategoryId'] = komutLogCategory.id;

    const sunucuLogCategory = await guild.channels.create({
      name: 'Viqole Sunucu Log',
      type: ChannelType.GuildCategory,
      permissionOverwrites: [
        { id: guild.id, type: OverwriteType.Role, deny: [PermissionFlagsBits.ViewChannel] },
        { id: guild.members.me.id, type: OverwriteType.Member, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] }
      ],
      reason: 'Ekip sunucu log kategorisi.'
    });
    currentConfig['sunucuLogCategoryId'] = sunucuLogCategory.id;

    try {
      const categoriesCount = guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).size;
      await sunucuLogCategory.setPosition(categoriesCount - 1);
      await komutLogCategory.setPosition(categoriesCount - 2);
      await yonetimCategory.setPosition(categoriesCount - 3);
    } catch { }

    const komutLogChannels = [
      { key: 'warningLogChannelId', name: 'uyari-log' },
      { key: 'farmLogChannelId', name: 'farm-log' },
      { key: 'ticketLogChannelId', name: 'ticket-log' },
      { key: 'youtubeLogChannelId', name: 'youtube-log' },
      { key: 'dmDuyuruLogChannelId', name: 'dm-duyuru-log' },
      { key: 'activityLogChannelId', name: 'aktiflik-log' },
      { key: 'botLogChannelId', name: 'bot-log' },
      { key: 'banAfLogChannelId', name: 'ban-affı-log' }
    ];

    const sunucuLogChannels = [
      { key: 'messageLogChannelId', name: 'mesaj-log' },
      { key: 'banLogChannelId', name: 'ban-unban-log' },
      { key: 'sesLogChannelId', name: 'ses-log' },
      { key: 'davetLogChannelId', name: 'davet-log' },
      { key: 'girisLogChannelId', name: 'giris-cikis-log' },
      { key: 'roleLogChannelId', name: 'rol-log' },
      { key: 'kanalLogChannelId', name: 'kanal-log' },
      { key: 'isimLogChannelId', name: 'isim-log' }
    ];

    for (const logChan of komutLogChannels) {
      const channel = await guild.channels.create({ name: logChan.name, type: ChannelType.GuildText, parent: komutLogCategory.id });
      currentConfig[logChan.key] = channel.id;
    }
    reports.push('  📝 **Viqole Komut Log Kanalları:** Başarıyla Oluşturuldu');

    for (const logChan of sunucuLogChannels) {
      const channel = await guild.channels.create({ name: logChan.name, type: ChannelType.GuildText, parent: sunucuLogCategory.id });
      currentConfig[logChan.key] = channel.id;
      if (logChan.key === 'banLogChannelId') {
        currentConfig['unbanLogChannelId'] = channel.id;
      }
    }
    reports.push('  📝 **Viqole Sunucu Log Kanalları:** Başarıyla Oluşturuldu');

    if (banafTipi === 'panelsiz') {
      setPanelSizBanAfGuild(guild.id, {
        active: true,
        yazmaKanalId: currentConfig.banAfChannelId || null,
        banListeKanalId: banAffiMgmtChannel.id,
        banListeMesajId: null,
        entries: []
      });
      reports.push('  ✅ **Panelsiz Ban Affı Sistemi:** Aktifleştirildi (Yönetim: ban-affı-yönetim)');
    }

    // Komutları Kaydet (registerCommands.js)
    let registerResult = '';
    try {
      const { stdout } = await execAsync('node registerCommands.js', { env: process.env });
      registerResult = '\n\n🔄 **Komut Kayıt Sonucu (registerCommands.js):**\n```\n' + (stdout || 'Başarılı') + '\n```';
    } catch (regErr) {
      registerResult = `\n\n⚠️ **Komut Kayıt Uyarısı:**\n\`\`\`\n${regErr.message}\n\`\`\``;
    }

    // Kaydet
    fs.writeFileSync(activeConfigPath, JSON.stringify(currentConfig, null, 2), 'utf8');
    client.config = currentConfig;

    const container = new ContainerBuilder()
      .setAccentColor(0x2B2D7A)
      .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://logo.png')))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('# 🚀 EKİP SİSTEMİ KURULUMU TAMAMLANDI'))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Kurulum başarıyla tamamlandı ve ayarlar kaydedildi.**\n\n` + reports.join('\n') + registerResult))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot\'s - Gelişmiş Ekip Kurulum Sistemi'));

    await interaction.editReply({ components: [container], files: [new AttachmentBuilder(logoPath, { name: 'logo.png' })], flags: MessageFlags.IsComponentsV2 });

  } catch (error) {
    console.error('Kurulum hatası:', error);
    await interaction.editReply({ content: `❌ Kurulum sırasında bir hata oluştu: ${error.message}` });
  }
}

// --- TICKET GÜNCELLEME FLOW (handleGuncelleFlow) ---
async function handleGuncelleFlow(interaction, client, activeConfigPath) {
  const loadingContainer = new ContainerBuilder()
    .setAccentColor(0x3498DB)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ⏳ Sistem Güncelleniyor`))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`Lütfen bekleyin, sistem kanalları ve rolleri kontrol ediliyor...`))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));

  await interaction.update({ embeds: [], components: [loadingContainer], files: [] });

  const guild = interaction.guild;
  await guild.channels.fetch().catch(() => null);
  await guild.roles.fetch().catch(() => null);

  let currentConfig = {};
  if (fs.existsSync(activeConfigPath)) {
    try {
      currentConfig = JSON.parse(fs.readFileSync(activeConfigPath, 'utf8'));
    } catch { }
  }

  const finalConfig = { ...currentConfig };
  const createdReports = [];
  const matchedReports = [];

  // Helper to find or create a category
  async function findOrCreateCategory(name, categoryKey) {
    if (categoryKey) {
      const configId = finalConfig[categoryKey];
      if (configId) {
        const cat = guild.channels.cache.get(configId) || await guild.channels.fetch(configId).catch(() => null);
        if (cat) return cat;
      }
    }
    // Search by name under the guild
    let cat = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === name.toLowerCase());
    if (!cat) {
      cat = await guild.channels.create({
        name: name,
        type: ChannelType.GuildCategory,
        reason: 'Sistem güncellemesi ile otomatik oluşturuldu.'
      });
      createdReports.push(`📁 **${name} Kategorisi** oluşturuldu.`);
      if (categoryKey) finalConfig[categoryKey] = cat.id;
    } else {
      if (categoryKey && finalConfig[categoryKey] !== cat.id) {
        finalConfig[categoryKey] = cat.id;
        matchedReports.push(`📁 **${name} Kategorisi** (Mevcut olanla eşleştirildi)`);
      }
    }
    return cat;
  }

  try {
    // 1. Rolleri Tara ve Oluştur
    for (const schema of SYSTEM_ROLES) {
      if (schema.manual) {
        // Manuel roller (örneğin onayRoleId / Ekip Üyesi) otomatik oluşturulmaz
        const configId = finalConfig[schema.key];
        const existingRole = configId ? guild.roles.cache.get(configId) : null;
        if (existingRole) {
          matchedReports.push(`🔹 **${schema.name} Rolü:** Mevcut tanımlı (${existingRole})`);
        } else {
          matchedReports.push(`⚠️ **${schema.name} Rolü:** Tanımlı değil. Lütfen Web Panelinden veya Komutla ayarlayınız.`);
        }
        continue;
      }

      const configId = finalConfig[schema.key];
      let role = configId ? guild.roles.cache.get(configId) : null;

      if (!role && schema.key === 'ticketStaffRoleId') {
        const existingStaff = guild.roles.cache.find(r =>
          ['alım sorumlusu', 'alim sorumlusu', 'başvuru sorumlusu', 'basvuru sorumlusu'].includes(r.name.toLowerCase())
        );
        if (existingStaff) {
          role = existingStaff;
          finalConfig[schema.key] = role.id;
          matchedReports.push(`🔹 **${schema.name}** rolü (Sunucuda mevcut olan tespit edildi: ${role})`);
        }
      }

      if (!role) {
        // Rol oluştur
        const roleOptions = {
          name: schema.name,
          reason: 'Sistem güncellemesi ile otomatik oluşturuldu.'
        };
        const isNoColorRole = (schema.name === 'Ban Command' || schema.name === 'Alım Sorumlusu');
        if (!isNoColorRole && schema.color) {
          roleOptions.color = schema.color;
        }
        role = await guild.roles.create(roleOptions);
        finalConfig[schema.key] = role.id;
        createdReports.push(`➕ **${schema.name}** rolü oluşturuldu (${role}).`);
      }
    }


    // 2. Kategorileri Tara ve Oluştur
    for (const schema of SYSTEM_CATEGORIES) {
      await findOrCreateCategory(schema.name, schema.key);
    }

    // 3. Kanalları Tara, Eşleştir veya Oluştur
    for (const schema of SYSTEM_CHANNELS) {
      let channel = null;

      // Eğer kanalın bir üst kategorisi varsa
      if (schema.parentCategoryKey) {
        // Kategoriyi bul veya oluştur
        const parentCat = await findOrCreateCategory(schema.parentName, schema.parentCategoryKey);
        
        // Config'deki ID'ye bak
        const configId = finalConfig[schema.key];
        let existingChannel = configId ? guild.channels.cache.get(configId) : null;
        
        // Eğer config'deki kanal varsa ve üst kategorisi doğruysa, onu kullan
        if (existingChannel && existingChannel.parentId === parentCat.id) {
          channel = existingChannel;
        } else {
          // Eğer üst kategorisi doğru değilse veya kanal yoksa, kategori altında isimle ara
          const match = guild.channels.cache.find(c => c.parentId === parentCat.id && c.name.toLowerCase() === schema.name.toLowerCase());
          if (match) {
            channel = match;
            finalConfig[schema.key] = match.id;
            if (schema.key === 'banLogChannelId') {
              finalConfig['unbanLogChannelId'] = match.id;
            }
            matchedReports.push(`#️⃣ **#${schema.name}** kanalı (Kategori altında bulundu ve eşleştirildi)`);
          }
        }
      } else {
        // Kategorisi olmayan genel kanallar için (video-paylasim vb.)
        const configId = finalConfig[schema.key];
        let existingChannel = configId ? guild.channels.cache.get(configId) : null;
        if (existingChannel) {
          channel = existingChannel;
        } else {
          // İsimle tüm sunucuda ara (kategorisi olmayanlar için)
          if (schema.key === 'videoChannelId') {
            const match = guild.channels.cache.find(c =>
              c.type === ChannelType.GuildText && (
                c.name.toLowerCase() === schema.name.toLowerCase() ||
                c.name.toLowerCase().includes('stream') ||
                c.name.toLowerCase().includes('içerik') ||
                c.name.toLowerCase().includes('icerik')
              )
            );
            if (match) {
              channel = match;
              finalConfig[schema.key] = match.id;
              matchedReports.push(`#️⃣ **#${match.name}** kanalı (Stream/İçerik/Video olarak eşleştirildi)`);
            }
          } else {
            const match = guild.channels.cache.find(c => !c.parentId && c.name.toLowerCase() === schema.name.toLowerCase());
            if (match) {
              channel = match;
              finalConfig[schema.key] = match.id;
              matchedReports.push(`#️⃣ **#${schema.name}** kanalı (Eşleştirildi)`);
            }
          }
        }
      }

      // Video kanalı için kategorili/kategorisiz stream veya içerik kanalını da tara
      if (!channel && schema.key === 'videoChannelId') {
        const streamOrContent = guild.channels.cache.find(c =>
          (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) && (
            c.name.toLowerCase().includes('stream') ||
            c.name.toLowerCase().includes('içerik') ||
            c.name.toLowerCase().includes('icerik')
          )
        );
        if (streamOrContent) {
          channel = streamOrContent;
          finalConfig[schema.key] = streamOrContent.id;
          matchedReports.push(`🔹 **#${streamOrContent.name}** kanalı (Stream/İçerik tespit edildi ve seçildi)`);
        }
      }

      // Kanal hâlâ bulunamadıysa oluştur
      if (!channel) {
        let parentId = null;
        if (schema.parentName && schema.parentCategoryKey) {
          const cat = await findOrCreateCategory(schema.parentName, schema.parentCategoryKey);
          parentId = cat.id;
        }

        const permissionOverwrites = [];
        const isLogCategory = schema.parentName === 'Viqole Komut Log' || schema.parentName === 'Viqole Sunucu Log' || schema.parentName === 'LOG KANALLARI';
        if (isLogCategory || schema.parentName === 'YÖNETİM' || schema.privateFor) {
          permissionOverwrites.push({
            id: guild.id, // @everyone
            type: OverwriteType.Role,
            deny: [PermissionFlagsBits.ViewChannel]
          });
          permissionOverwrites.push({
            id: guild.members.me.id,
            type: OverwriteType.Member,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels]
          });

          if (schema.privateFor) {
            const roleId = finalConfig[schema.privateFor];
            if (roleId) {
              permissionOverwrites.push({
                id: roleId,
                type: OverwriteType.Role,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
              });
            }
          }
        }

        channel = await guild.channels.create({
          name: schema.name,
          type: schema.type,
          parent: parentId,
          permissionOverwrites,
          reason: 'Sistem güncellemesi ile otomatik oluşturuldu.'
        });

        finalConfig[schema.key] = channel.id;
        if (schema.key === 'banLogChannelId') {
          finalConfig['unbanLogChannelId'] = channel.id;
        }
        createdReports.push(`➕ **#${schema.name}** kanalı oluşturuldu (${channel}).`);
      }
    }

    // 4. ticketCategories ve ticket config ayarlarını yap
    const basvuruCategoryId = finalConfig['basvuruCategoryId'];
    if (basvuruCategoryId) {
      if (!finalConfig.ticketCategories) {
        finalConfig.ticketCategories = [
          { id: 'destek', label: 'Destek', emoji: '1507734289255628990', description: 'Destek almak için ticket açın', enabled: true, categoryId: basvuruCategoryId, buttonStyle: 'Primary' },
          { id: 'basvuru', label: 'Başvuru', emoji: '1507733959432208515', description: 'Ekibe katılmak için başvurun', enabled: true, categoryId: basvuruCategoryId, buttonStyle: 'Secondary' },
          { id: 'referans', label: 'Referans ile Alım', emoji: '1507734363046150204', description: 'Referans ile alım için başvurun', enabled: true, categoryId: basvuruCategoryId, buttonStyle: 'Primary' }
        ];
      } else {
        finalConfig.ticketCategories = finalConfig.ticketCategories.map(cat => {
          const channelExists = cat.categoryId ? guild.channels.cache.has(cat.categoryId) : false;
          return { ...cat, categoryId: channelExists ? cat.categoryId : basvuruCategoryId };
        });
      }

      const ticketChannelId = finalConfig['ticketChannelId'];
      if (ticketChannelId) {
        const currentTktCfg = getTicketConfig(guild.id);
        setTicketConfig(guild.id, {
          ticketChannelId: ticketChannelId,
          categoryId: basvuruCategoryId,
          ticketCount: currentTktCfg.ticketCount || 0
        });
      }
    }

    // Config dosyasını kaydet
    fs.writeFileSync(activeConfigPath, JSON.stringify(finalConfig, null, 2), 'utf8');
    client.config = finalConfig;

    // Komutları Kaydet
    let registerResult = '';
    try {
      const { stdout } = await execAsync('node registerCommands.js', { env: process.env });
      registerResult = '\n\n🔄 **Komut Kayıt Sonucu (registerCommands.js):**\n```\n' + (stdout || 'Başarılı') + '\n```';
    } catch (regErr) {
      registerResult = `\n\n⚠️ **Komut Kayıt Hatası:**\n\`\`\`\n${regErr.message}\n\`\`\``;
    }

    const reportContainer = new ContainerBuilder()
      .setAccentColor(0x3498DB)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ⚙️ SİSTEM GÜNCELLEMESİ TAMAMLANDI`))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

    let reportText = '';
    if (matchedReports.length > 0) {
      reportText += `🔍 **Eşleştirilen Ögeler (Kategori altındaki mevcut kanallar bağlandı):**\n` + matchedReports.join('\n') + '\n\n';
    }
    if (createdReports.length > 0) {
      reportText += `🛠️ **Yeni Oluşturulan Ögeler:**\n` + createdReports.join('\n') + '\n\n';
    }
    if (matchedReports.length === 0 && createdReports.length === 0) {
      reportText += `✅ Tüm sistem zaten tam ve güncel durumda, yeni bir işlem yapılmadı.\n\n`;
    }
    reportText += `Tüm ayarlar kaydedildi.` + registerResult;

    reportContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(reportText))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));

    await interaction.editReply({ embeds: [], components: [reportContainer] });

  } catch (err) {
    console.error('[SISTEM KONTROL] handleGuncelleFlow hatası:', err);
    const errorContainer = new ContainerBuilder()
      .setAccentColor(0xd9534f)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ❌ HATA OLUŞTU`))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`Güncelleme sırasında bir hata oluştu:\n\`\`\`\n${err.message}\n\`\`\``))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));

    await interaction.editReply({ embeds: [], components: [errorContainer] }).catch(() => null);
  }
}

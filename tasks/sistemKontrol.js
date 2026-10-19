import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);

import {
  ChannelType,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  OverwriteType
} from 'discord.js';

import { getTicketConfig, setTicketConfig } from '../db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOGO = path.join(__dirname, '../logo.png');

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

function scanMissing(guild, config) {
  const missingRoles = [];
  const missingCategories = [];
  const missingChannels = [];
  const wrongNameChannels = [];
  let configChanged = false;

  // Check roles — yalnızca config ID'si ile eşleştir, isim araması yapma
  // Check roles
  for (const roleSchema of SYSTEM_ROLES) {
    if (roleSchema.manual) continue; // Manuel roller (onayRoleId) otomatik oluşturulamaz
    const configId = config[roleSchema.key];
    let foundByConfig = configId ? guild.roles.cache.get(configId) : null;
    if (!foundByConfig && roleSchema.key === 'ticketStaffRoleId') {
      const existingStaff = guild.roles.cache.find(r =>
        ['alım sorumlusu', 'alim sorumlusu', 'başvuru sorumlusu', 'basvuru sorumlusu'].includes(r.name.toLowerCase())
      );
      if (existingStaff) {
        config[roleSchema.key] = existingStaff.id;
        configChanged = true;
        foundByConfig = existingStaff;
      }
    }
    if (!foundByConfig) {
      missingRoles.push(roleSchema);
    }
  }


  // Check categories — yalnızca config ID'si ile eşleştir, isim araması yapma
  for (const catSchema of SYSTEM_CATEGORIES) {
    const configId = config[catSchema.key];
    const foundByConfig = configId ? guild.channels.cache.get(configId) : null;
    if (!foundByConfig) {
      missingCategories.push(catSchema);
    }
  }

  // Check channels — yalnızca config ID'si ile eşleştir, bulamazsa kendi kategorisi altında isimle ara
  for (const chanSchema of SYSTEM_CHANNELS) {
    const configId = config[chanSchema.key];
    let foundChannel = configId ? guild.channels.cache.get(configId) : null;

    if (chanSchema.parentCategoryKey) {
      const parentCatId = config[chanSchema.parentCategoryKey] || (chanSchema.parentFallbackKey ? config[chanSchema.parentFallbackKey] : null);
      const parentCategory = parentCatId ? guild.channels.cache.get(parentCatId) : null;

      if (parentCategory) {
        // Eğer kanalı bulduysak ama üst kategorisi doğru değilse, bulunamadı sayıp kategori altından aratacağız
        if (foundChannel && foundChannel.parentId !== parentCategory.id) {
          foundChannel = null;
        }

        if (!foundChannel) {
          // Bu kategorinin altındaki kanallarda ismi eşleşen var mı bak
          const match = guild.channels.cache.find(c => c.parentId === parentCategory.id && c.name.toLowerCase() === chanSchema.name.toLowerCase());
          if (match) {
            foundChannel = match;
            config[chanSchema.key] = match.id;
            if (chanSchema.key === 'banLogChannelId') {
              config['unbanLogChannelId'] = match.id;
            }
            configChanged = true;
          }
        }
      } else {
        // Eğer üst kategori sunucuda yoksa, kanalı da yok sayacağız ki oluşturulabilsin
        foundChannel = null;
      }
    } else {
      // Üst kategorisi olmayan genel kanallar için
      if (!foundChannel) {
        let match = null;
        if (chanSchema.key === 'videoChannelId') {
          match = guild.channels.cache.find(c =>
            (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) && (
              c.name.toLowerCase() === chanSchema.name.toLowerCase() ||
              c.name.toLowerCase().includes('stream') ||
              c.name.toLowerCase().includes('içerik') ||
              c.name.toLowerCase().includes('icerik')
            )
          );
        } else {
          match = guild.channels.cache.find(c => !c.parentId && c.name.toLowerCase() === chanSchema.name.toLowerCase());
        }

        if (match) {
          foundChannel = match;
          config[chanSchema.key] = match.id;
          configChanged = true;
        }
      }
    }

    if (!foundChannel) {
      missingChannels.push(chanSchema);
    }
  }

  return { missingRoles, missingCategories, missingChannels, wrongNameChannels, configChanged };
}

export async function runSystemIntegrityCheck(client, guild) {
  const { missingRoles, missingCategories, missingChannels, wrongNameChannels, configChanged } = scanMissing(guild, client.config);

  if (configChanged) {
    const cp = client.configPath;
    if (cp && fs.existsSync(cp)) {
      try {
        fs.writeFileSync(cp, JSON.stringify(client.config, null, 2), 'utf8');
      } catch (err) {
        console.error('[SISTEM KONTROL] Config save error:', err);
      }
    }
  }

  const totalMissingCount = missingRoles.length + missingCategories.length + missingChannels.length;
  const totalWrongNamesCount = wrongNameChannels.length;

  const activeChannelId = client.config?.aktifIslemlerChannelId;
  if (!activeChannelId) return;

  const activeChannel = guild.channels.cache.get(activeChannelId) || await guild.channels.fetch(activeChannelId).catch(() => null);
  if (!activeChannel || !activeChannel.isTextBased()) return;

  const botAlertMsgId = client.config?.sistemKontrolMessageId;
  let botAlertMsg = null;
  if (botAlertMsgId) {
    botAlertMsg = await activeChannel.messages.fetch(botAlertMsgId).catch(() => null);
  }

  // Fallback to scan last 20 messages if ID is not in config but exists on Discord
  if (!botAlertMsg) {
    try {
      const messages = await activeChannel.messages.fetch({ limit: 20 });
      botAlertMsg = messages.find(m => m.author.id === client.user.id && m.components.some(row => row.components.some(comp => comp.customId === 'sistem_olustur_btn' || comp.customId === 'sistem_duzelt_btn')));
    } catch (err) {
      // Ignore
    }
  }

  if (totalMissingCount === 0 && totalWrongNamesCount === 0) {
    // Eksik kalmadıysa, eski uyarı mesajını temizle
    if (botAlertMsg) {
      await botAlertMsg.delete().catch(() => null);

      // Update config
      const cp = client.configPath;
      if (cp && fs.existsSync(cp)) {
        try {
          const currentConfig = JSON.parse(fs.readFileSync(cp, 'utf8'));
          currentConfig.sistemKontrolMessageId = null;
          fs.writeFileSync(cp, JSON.stringify(currentConfig, null, 2), 'utf8');
          client.config = currentConfig;
        } catch (e) { }
      }
    }
    return;
  }

  // Mesaj içeriğini biçimlendir
  let description = 'Sistemde bazı önemli rol veya kanallar eksik ya da hatalı! Lütfen bunları düzenleyin:\n\n';
  if (missingRoles.length > 0) {
    description += `**Eksik Roller:**\n${missingRoles.map(r => `• ${r.name}`).join('\n')}\n\n`;
  }
  if (missingCategories.length > 0) {
    description += `**Eksik Kategoriler:**\n${missingCategories.map(c => `• ${c.name}`).join('\n')}\n\n`;
  }
  if (missingChannels.length > 0) {
    description += `**Eksik Kanallar:**\n${missingChannels.map(ch => `• #${ch.name}`).join('\n')}\n\n`;
  }
  if (wrongNameChannels.length > 0) {
    description += `**İsmi Hatalı Kanallar:**\n${wrongNameChannels.map(w => `• ${w.type === 'category' ? '📁' : '#'} \`${w.channel.name}\` ➔ Beklenen: \`${w.schema.name}\``).join('\n')}\n\n`;
  }

  const buttons = [];
  if (totalMissingCount > 0) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId('sistem_olustur_btn')
        .setLabel('Oluştur')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🛠️')
    );
  }
  if (totalWrongNamesCount > 0) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId('sistem_duzelt_btn')
        .setLabel('Düzelt')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🔧')
    );
  }

  const embed = new ContainerBuilder()
    .setAccentColor(0xED4245)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ⚠️ Sistem Eksiği Tespit Edildi`))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(description))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

  if (buttons.length > 0) {
    const row = new ActionRowBuilder().addComponents(buttons);
    embed.addActionRowComponents(row);
  }

  embed.addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));

  try {
    let sentMsg = null;
    if (botAlertMsg) {
      sentMsg = await botAlertMsg.edit({
        components: [embed],
        flags: MessageFlags.IsComponentsV2
      });
    } else {
      sentMsg = await activeChannel.send({
        components: [embed],
        flags: MessageFlags.IsComponentsV2
      });
    }

    if (sentMsg && sentMsg.id !== botAlertMsgId) {
      // Save ID to config
      const cp = client.configPath;
      if (cp && fs.existsSync(cp)) {
        try {
          const currentConfig = JSON.parse(fs.readFileSync(cp, 'utf8'));
          currentConfig.sistemKontrolMessageId = sentMsg.id;
          fs.writeFileSync(cp, JSON.stringify(currentConfig, null, 2), 'utf8');
          client.config = currentConfig;
        } catch (e) { }
      }
    }
  } catch (err) {
    console.error('[SISTEM KONTROL] Mesaj gönderme/düzenleme hatası:', err);
  }
}

// 5 Dakikada Bir Kontrol Et
cron.schedule('*/30 * * * * *', async () => {
  const client = globalThis.client;
  if (!client || !client.isReady()) return;

  const guildId = client.config?.guildId;
  if (!guildId) return;

  const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;

  // Cache güncelle
  await guild.channels.fetch().catch(() => null);
  await guild.roles.fetch().catch(() => null);

  await runSystemIntegrityCheck(client, guild);
});

// Etkileşim Dinleyicisi — client hazır olduğunda ekle
export function registerSistemKontrolInteractions(client) {
  client.on('interactionCreate', async (interaction) => {
    if (interaction.isButton() && interaction.customId === 'sistem_olustur_btn') {
      const banCommandRoleId = client.config?.banCommandRoleId;
      const hasRole = banCommandRoleId && interaction.member.roles.cache.has(banCommandRoleId);
      if (!hasRole && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({
          content: '❌ Bu işlemi gerçekleştirmek için yetkiniz bulunmuyor.',
          flags: MessageFlags.Ephemeral
        });
      }

      const { missingRoles, missingCategories, missingChannels } = scanMissing(interaction.guild, client.config);
      const allMissing = [
        ...missingRoles.map(r => ({ key: r.key, name: `${r.name} (Rol)`, type: 'role' })),
        ...missingCategories.map(c => ({ key: c.key, name: `${c.name} (Kategori)`, type: 'category' })),
        ...missingChannels.map(ch => ({ key: ch.key, name: `#${ch.name} (Kanal)`, type: 'channel' }))
      ];

      if (allMissing.length === 0) {
        return interaction.reply({
          content: '✅ Sistemde eksik rol veya kanal bulunmuyor.',
          flags: MessageFlags.Ephemeral
        });
      }

      const options = allMissing.slice(0, 25).map(item => {
        return new StringSelectMenuOptionBuilder()
          .setLabel(item.name)
          .setValue(`${item.type}:${item.key}`)
          .setDescription(`Oluşturmak için seçin`);
      });

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('sistem_olustur_select')
        .setPlaceholder('Oluşturmak istediğiniz ögeleri seçin...')
        .addOptions(options)
        .setMinValues(1)
        .setMaxValues(options.length);

      const row = new ActionRowBuilder().addComponents(selectMenu);

      await interaction.reply({
        content: '🛠️ **Oluşturulmasını istediğiniz eksik rol veya kanalları seçin:**',
        components: [row],
        flags: MessageFlags.Ephemeral
      });
    }

    if (interaction.isButton() && interaction.customId === 'sistem_duzelt_btn') {
      const banCommandRoleId = client.config?.banCommandRoleId;
      const hasRole = banCommandRoleId && interaction.member.roles.cache.has(banCommandRoleId);
      if (!hasRole && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({
          content: '❌ Bu işlemi gerçekleştirmek için yetkiniz bulunmuyor.',
          flags: MessageFlags.Ephemeral
        });
      }

      const { wrongNameChannels } = scanMissing(interaction.guild, client.config);
      if (wrongNameChannels.length === 0) {
        return interaction.reply({
          content: '✅ Sistemde ismi yanlış olan kanal/kategori bulunmuyor.',
          flags: MessageFlags.Ephemeral
        });
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const renamedReports = [];
      for (const item of wrongNameChannels) {
        try {
          const oldName = item.channel.name;
          await item.channel.setName(item.schema.name, 'Sistem kontrolü ile kanal ismi düzeltildi.');
          renamedReports.push(`✏️ **${item.type === 'category' ? '📁' : '#'} ${oldName}** ➔ **${item.schema.name}** olarak düzeltildi.`);
        } catch (err) {
          console.error(`[SISTEM KONTROL] Failed to rename ${item.type} ${item.channel.id}:`, err);
          renamedReports.push(`❌ **${item.type === 'category' ? '📁' : '#'} ${item.channel.name}** düzeltilemedi: ${err.message}`);
        }
      }

      let reportText = '### 🔧 Kanal İsimleri Düzeltildi!\n';
      reportText += renamedReports.join('\n');

      await interaction.editReply({ content: reportText });

      // Run integrity check immediately to refresh the warning message
      await runSystemIntegrityCheck(client, interaction.guild);
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'sistem_olustur_select') {
      const banCommandRoleId = client.config?.banCommandRoleId;
      const hasRole = banCommandRoleId && interaction.member.roles.cache.has(banCommandRoleId);
      if (!hasRole && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({
          content: '❌ Bu işlemi gerçekleştirmek için yetkiniz bulunmuyor.',
          flags: MessageFlags.Ephemeral
        });
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const selectedValues = interaction.values;
      const guild = interaction.guild;
      const configPath = client.configPath;

      let currentConfig = {};
      if (configPath && fs.existsSync(configPath)) {
        try {
          currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        } catch (err) {
          console.error('[SISTEM KONTROL] Config okuma hatası:', err);
        }
      }

      const createdReports = [];
      const finalConfig = { ...client.config, ...currentConfig };

      // Log kanalı kategorisini config'den bul (ID-first veya isim araması)
      async function findLogCategory() {
        const primaryId = finalConfig['sunucuLogCategoryId'];
        if (primaryId) {
          const cat = guild.channels.cache.get(primaryId) || await guild.channels.fetch(primaryId).catch(() => null);
          if (cat) return cat;
        }
        const fallbackId = finalConfig['logCategoryId'];
        if (fallbackId) {
          const cat = guild.channels.cache.get(fallbackId) || await guild.channels.fetch(fallbackId).catch(() => null);
          if (cat) return cat;
        }

        // Sunucuda var olan "Viqole Sunucu Log" veya "LOG KANALLARI" kategorisini ara
        const existingCat = guild.channels.cache.find(
          c => c.type === ChannelType.GuildCategory && 
          (c.name.toLowerCase() === 'viqole sunucu log' || c.name.toLowerCase() === 'log kanallari')
        );
        if (existingCat) {
          finalConfig['sunucuLogCategoryId'] = existingCat.id;
          return existingCat;
        }
        return null;
      }

      async function findOrCreateCategory(name, categoryKey) {
        // Önce config'deki ID'ye bak
        if (categoryKey) {
          const configId = finalConfig[categoryKey];
          if (configId) {
            const cat = guild.channels.cache.get(configId) || await guild.channels.fetch(configId).catch(() => null);
            if (cat) return cat;
          }
        }
        // Sonra isimle ara
        let cat = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === name.toLowerCase());
        if (!cat) {
          cat = await guild.channels.create({
            name: name,
            type: ChannelType.GuildCategory,
            reason: 'Sistem kontrolü ile otomatik oluşturuldu.'
          });
          createdReports.push(`📁 **${name} Kategorisi** oluşturuldu.`);
        }
        return cat;
      }

      try {
        // 1. Rolleri oluştur
        const rolesToCreate = selectedValues.filter(val => val.startsWith('role:'));
        for (const val of rolesToCreate) {
          const key = val.replace('role:', '');
          const schema = SYSTEM_ROLES.find(r => r.key === key);
          if (!schema || schema.manual) continue;

          if (schema.key === 'ticketStaffRoleId') {
            const existingStaff = guild.roles.cache.find(r =>
              ['alım sorumlusu', 'alim sorumlusu', 'başvuru sorumlusu', 'basvuru sorumlusu'].includes(r.name.toLowerCase())
            );
            if (existingStaff) {
              finalConfig[schema.key] = existingStaff.id;
              createdReports.push(`🔹 **${schema.name}** rolü (Sunucudaki mevcut rol eşleştirildi: ${existingStaff}).`);
              continue;
            }
          }

          const roleOptions = {
            name: schema.name,
            reason: 'Sistem kontrolü ile otomatik oluşturuldu.'
          };
          const isNoColorRole = (schema.name === 'Ban Command' || schema.name === 'Alım Sorumlusu');
          if (!isNoColorRole && schema.color) {
            roleOptions.color = schema.color;
          }

          const role = await guild.roles.create(roleOptions);
          finalConfig[schema.key] = role.id;
          createdReports.push(`➕ **${schema.name}** rolü oluşturuldu (${role}).`);
        }


        // 2. Kategorileri oluştur
        const categoriesToCreate = selectedValues.filter(val => val.startsWith('category:'));
        for (const val of categoriesToCreate) {
          const key = val.replace('category:', '');
          const schema = SYSTEM_CATEGORIES.find(c => c.key === key);
          if (!schema) continue;

          const cat = await guild.channels.create({
            name: schema.name,
            type: ChannelType.GuildCategory,
            reason: 'Sistem kontrolü ile otomatik oluşturuldu.'
          });
          finalConfig[schema.key] = cat.id;
          createdReports.push(`📁 **${schema.name}** kategorisi oluşturuldu (${cat}).`);
        }

        // 3. Kanalları oluştur
        const channelsToCreate = selectedValues.filter(val => val.startsWith('channel:'));
        for (const val of channelsToCreate) {
          const key = val.replace('channel:', '');
          const schema = SYSTEM_CHANNELS.find(ch => ch.key === key);
          if (!schema) continue;

          if (schema.key === 'videoChannelId') {
            const streamOrContent = guild.channels.cache.find(c =>
              (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) && (
                c.name.toLowerCase().includes('stream') ||
                c.name.toLowerCase().includes('içerik') ||
                c.name.toLowerCase().includes('icerik')
              )
            );
            if (streamOrContent) {
              finalConfig[schema.key] = streamOrContent.id;
              createdReports.push(`🔹 **#${streamOrContent.name}** kanalı (Stream/İçerik tespit edildi ve seçildi).`);
              continue;
            }
          }

          let parentId = null;
          if (schema.isLogChannel) {
            // Log kanalları için mevcut log kategorisini kullan
            const logCat = await findLogCategory();
            if (logCat) {
              parentId = logCat.id;
            } else {
              // Hiç log kategorisi yoksa yeni oluştur
              const newCat = await guild.channels.create({
                name: 'Viqole Sunucu Log',
                type: ChannelType.GuildCategory,
                reason: 'Sistem kontrolü ile otomatik oluşturuldu.'
              });
              parentId = newCat.id;
              finalConfig['sunucuLogCategoryId'] = newCat.id;
              createdReports.push(`📁 **Viqole Sunucu Log Kategorisi** oluşturuldu.`);
            }
          } else if (schema.parentName) {
            const cat = await findOrCreateCategory(schema.parentName, schema.parentCategoryKey);
            parentId = cat.id;
            if (schema.parentCategoryKey) finalConfig[schema.parentCategoryKey] = cat.id;
          }

          const permissionOverwrites = [];
          if (schema.parentName === 'LOG KANALLARI' || schema.isLogChannel || schema.parentName === 'YÖNETİM' || schema.privateFor) {
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

          const channel = await guild.channels.create({
            name: schema.name,
            type: schema.type,
            parent: parentId,
            permissionOverwrites,
            reason: 'Sistem kontrolü ile otomatik oluşturuldu.'
          });

          finalConfig[schema.key] = channel.id;
          createdReports.push(`➕ **#${schema.name}** kanalı oluşturuldu (${channel}).`);
        }

        // ticketCategories güncelle
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
              return {
                ...cat,
                categoryId: channelExists ? cat.categoryId : basvuruCategoryId
              };
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

        if (configPath) {
          fs.writeFileSync(configPath, JSON.stringify(finalConfig, null, 2), 'utf8');
        }
        client.config = finalConfig;

        let registerResult = '';
        try {
          const { stdout } = await execAsync('node registerCommands.js', { env: process.env });
          registerResult = '\n\n🔄 **Komut Kayıt Sonucu (registerCommands.js):**\n```\n' + (stdout || 'Başarılı') + '\n```';
        } catch (regErr) {
          registerResult = `\n\n⚠️ **Komut Kayıt Hatası:**\n\`\`\`\n${regErr.message}\n\`\`\``;
        }

        let reportText = '### ✅ Seçilen Ögeler Başarıyla Oluşturuldu!\n';
        reportText += createdReports.join('\n') + registerResult;

        await interaction.editReply({ content: reportText });

        // Ana uyarı mesajını hemen güncelle
        await runSystemIntegrityCheck(client, guild);
      } catch (error) {
        console.error('[SISTEM KONTROL] Auto creation error:', error);
        await interaction.editReply({ content: `❌ Ögeler oluşturulurken hata oluştu: ${error.message}` }).catch(() => null);
      }
    }
  });
}

console.log('✅ Sistem bütünlüğü kontrol görevi başlatıldı (5 dakikada bir).');

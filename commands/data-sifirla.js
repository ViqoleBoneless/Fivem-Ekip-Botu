import {
  SlashCommandBuilder, PermissionFlagsBits, MessageFlags,
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize
} from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  clearAllFarm, removeFarmUser, getFarmAmount,
  clearAllWarnings, deleteWarnings, getWarnings,
  saveBans, removeBanByUserId, loadBans,
  saveBanAffi, loadBanAffi,
  saveActivity, loadActivity,
  saveEvents, loadEvents,
  saveYoutubeChannels,
  clearTicketsForGuild,
  deleteTicketsForUser,
  clearAllEventsStats,
  clearUserEventsStats,
  clearAllVoiceMessagesStats,
  clearUserVoiceMessagesStats
} from '../db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { debouncedUpdateEtkinlikTop } from '../utils/statsHelper.js';

export const data = new SlashCommandBuilder()
  .setName('data-sıfırla')
  .setDescription('Seçilen bot verilerini sıfırlar. Seçenek seçilmezse tüm veriler sıfırlanır.')
  .addStringOption(o => o.setName('kisi').setDescription('Sıfırlanacak üye (@kullanıcı/ID) veya tüm bot için @everyone').setRequired(true))
  .addStringOption(o => o.setName('farm').setDescription('Farm verilerini sıfırla').setRequired(false)
    .addChoices({ name: 'Evet', value: 'yes' }, { name: 'Hayır', value: 'no' }))
  .addStringOption(o => o.setName('uyarilar').setDescription('Uyarı verilerini sıfırla').setRequired(false)
    .addChoices({ name: 'Evet', value: 'yes' }, { name: 'Hayır', value: 'no' }))
  .addStringOption(o => o.setName('ticketlar').setDescription('Ticket verilerini sıfırla').setRequired(false)
    .addChoices({ name: 'Evet', value: 'yes' }, { name: 'Hayır', value: 'no' }))
  .addStringOption(o => o.setName('banlar').setDescription('Ban verilerini sıfırla').setRequired(false)
    .addChoices({ name: 'Evet', value: 'yes' }, { name: 'Hayır', value: 'no' }))
  .addStringOption(o => o.setName('ban_affi').setDescription('Ban affı başvurularını sıfırla').setRequired(false)
    .addChoices({ name: 'Evet', value: 'yes' }, { name: 'Hayır', value: 'no' }))
  .addStringOption(o => o.setName('aktiflikler').setDescription('Aktiflik verilerini sıfırla').setRequired(false)
    .addChoices({ name: 'Evet', value: 'yes' }, { name: 'Hayır', value: 'no' }))
  .addStringOption(o => o.setName('etkinlikler').setDescription('Etkinlik verilerini sıfırla').setRequired(false)
    .addChoices({ name: 'Evet', value: 'yes' }, { name: 'Hayır', value: 'no' }))
  .addStringOption(o => o.setName('youtube').setDescription('YouTube listesini sıfırla').setRequired(false)
    .addChoices({ name: 'Evet', value: 'yes' }, { name: 'Hayır', value: 'no' }))
  .addStringOption(o => o.setName('istatistikler').setDescription('İstatistik verilerini sıfırla').setRequired(false)
    .addChoices({ name: 'Evet', value: 'yes' }, { name: 'Hayır', value: 'no' }));

export async function execute(interaction, client) {
  const dataDir = client.dataDir || path.join(__dirname, '../data');
  const ownerIdsStr = client.config?.ownerIds || '';
  const ownerIds = ownerIdsStr ? ownerIdsStr.split(',').map(id => id.trim()).filter(Boolean) : [];
  const isOwner = ownerIds.includes(interaction.user.id);
  const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

  if (!isOwner && (ownerIds.length > 0 || !isAdmin)) {
    return interaction.reply({ content: '❌ Bu komutu sadece **Ekip Sahibi** veya **Yönetici** kullanabilir.', flags: MessageFlags.Ephemeral });
  }

  const kisiInput = interaction.options.getString('kisi', true);
  let targetUserId = null;
  let isEveryone = false;

  if (kisiInput.trim() === '@everyone') {
    isEveryone = true;
  } else {
    const match = kisiInput.match(/\d+/);
    if (match) {
      targetUserId = match[0];
    } else {
      return interaction.reply({ content: '❌ Lütfen geçerli bir üye etiketleyin veya `@everyone` yazın.', flags: MessageFlags.Ephemeral });
    }
  }

  const farmOpt = interaction.options.getString('farm') === 'yes';
  const uyarilarOpt = interaction.options.getString('uyarilar') === 'yes';
  const ticketlarOpt = interaction.options.getString('ticketlar') === 'yes';
  const banlarOpt = interaction.options.getString('banlar') === 'yes';
  const banAffiOpt = interaction.options.getString('ban_affi') === 'yes';
  const aktifliklerOpt = interaction.options.getString('aktiflikler') === 'yes';
  const etkinliklerOpt = interaction.options.getString('etkinlikler') === 'yes';
  const youtubeOpt = interaction.options.getString('youtube') === 'yes';
  const istatistiklerOpt = interaction.options.getString('istatistikler') === 'yes';

  // Hiçbir seçenek 'yes' olarak seçilmediyse, her şeyi sıfırla
  const resetAll = !farmOpt && !uyarilarOpt && !ticketlarOpt && !banlarOpt && !banAffiOpt && !aktifliklerOpt && !etkinliklerOpt && !youtubeOpt && !istatistiklerOpt;

  const resetReports = [];

  function resetFile(fileName, isArray) {
    try {
      const filePath = path.join(dataDir, fileName);
      fs.writeFileSync(filePath, JSON.stringify(isArray ? [] : {}, null, 2), 'utf8');
      return true;
    } catch (err) {
      console.error(`${fileName} sıfırlama hatası:`, err);
      return false;
    }
  }

  // Farm
  if (farmOpt || resetAll) {
    if (isEveryone) {
      clearAllFarm();
      resetReports.push('🌾 **Farm Verileri** (Herkes) sıfırlandı.');
    } else {
      const currentFarm = getFarmAmount(interaction.guild.id, targetUserId);
      if (currentFarm > 0) {
        removeFarmUser(interaction.guild.id, targetUserId);
        resetReports.push(`🌾 <@${targetUserId}> adlı üyenin **Farm Verisi** sıfırlandı.`);
      } else {
        resetReports.push(`🌾 <@${targetUserId}> adlı üyenin sıfırlanacak **Farm Verisi** bulunamadı.`);
      }
    }
  }

  // Uyarılar
  if (uyarilarOpt || resetAll) {
    if (isEveryone) {
      clearAllWarnings(interaction.guild.id);
      try {
        const bioDir = path.join(dataDir, 'bio_kontrol');
        if (fs.existsSync(bioDir)) {
          const files = fs.readdirSync(bioDir);
          for (const file of files) {
            fs.unlinkSync(path.join(bioDir, file));
          }
        }
      } catch { }
      resetReports.push('⚠️ **Uyarı Verileri** (Herkes) sıfırlandı.');
    } else {
      const userWarnRecord = getWarnings(interaction.guild.id, targetUserId);
      if (userWarnRecord) {
        deleteWarnings(interaction.guild.id, targetUserId);
        try {
          const bioDir = path.join(dataDir, 'bio_kontrol');
          if (fs.existsSync(bioDir)) {
            const files = fs.readdirSync(bioDir);
            for (const file of files) {
              if (file.includes(targetUserId)) {
                fs.unlinkSync(path.join(bioDir, file));
              }
            }
          }
        } catch { }
        resetReports.push(`⚠️ <@${targetUserId}> adlı üyenin **Uyarı Verisi** sıfırlandı.`);
      } else {
        resetReports.push(`⚠️ <@${targetUserId}> adlı üyenin sıfırlanacak **Uyarı Verisi** bulunamadı.`);
      }
    }
  }

  // Ticketlar
  if (ticketlarOpt || resetAll) {
    if (isEveryone) {
      clearTicketsForGuild(interaction.guild.id);
      resetReports.push('🎫 **Ticket Verileri** (Herkes) sıfırlandı.');
    } else {
      deleteTicketsForUser(interaction.guild.id, targetUserId);
      resetReports.push(`🎫 <@${targetUserId}> adlı üyenin **Ticket Geçmişi** sıfırlandı.`);
    }
  }

  // Banlar
  if (banlarOpt || resetAll) {
    if (isEveryone) {
      saveBans([]);
      resetReports.push('🔨 **Ban Verileri** (Herkes) sıfırlandı.');
    } else {
      const bansData = loadBans();
      const initialLength = bansData.length;
      const filtered = bansData.filter(b => b.userId !== targetUserId);
      if (filtered.length < initialLength) {
        removeBanByUserId(targetUserId);
        resetReports.push(`🔨 <@${targetUserId}> adlı üyenin **Ban Verisi** sıfırlandı.`);
      } else {
        resetReports.push(`🔨 <@${targetUserId}> adlı üyenin sıfırlanacak **Ban Verisi** bulunamadı.`);
      }
    }
  }

  // Ban Affı
  if (banAffiOpt || resetAll) {
    if (isEveryone) {
      saveBanAffi([]);
      resetReports.push('📋 **Ban Affı Başvuruları** (Herkes) sıfırlandı.');
    } else {
      const banAffiData = loadBanAffi();
      const initialLength = banAffiData.length;
      const filtered = banAffiData.filter(b => b.userId !== targetUserId);
      if (filtered.length < initialLength) {
        saveBanAffi(filtered);
        resetReports.push(`📋 <@${targetUserId}> adlı üyenin **Ban Affı Talepleri** sıfırlandı.`);
      } else {
        resetReports.push(`📋 <@${targetUserId}> adlı üyenin sıfırlanacak **Ban Affı Talebi** bulunamadı.`);
      }
    }
  }

  // Aktiflikler
  if (aktifliklerOpt || resetAll) {
    if (isEveryone) {
      saveActivity([]);
      resetReports.push('📊 **Aktiflik Kontrolleri** (Herkes) sıfırlandı.');
    } else {
      const activityData = loadActivity();
      let updated = false;
      for (const act of activityData) {
        if (act.participants && act.participants.includes(targetUserId)) {
          act.participants = act.participants.filter(id => id !== targetUserId);
          updated = true;
        }
      }
      if (updated) {
        saveActivity(activityData);
        resetReports.push(`📊 <@${targetUserId}> adlı üyenin **Aktiflik Katılım Bilgisi** sıfırlandı.`);
      } else {
        resetReports.push(`📊 <@${targetUserId}> adlı üyenin sıfırlanacak **Aktiflik Katılım Bilgisi** bulunamadı.`);
      }
    }
  }

  // Etkinlikler
  if (etkinliklerOpt || resetAll) {
    if (isEveryone) {
      saveEvents([]);
      clearAllEventsStats();
      debouncedUpdateEtkinlikTop(client);
      resetReports.push('🏆 **Etkinlik Verileri** (Herkes) sıfırlandı.');
    } else {
      const eventsData = loadEvents();
      let updated = false;
      for (const ev of eventsData) {
        if (ev.participants && ev.participants.includes(targetUserId)) {
          ev.participants = ev.participants.filter(id => id !== targetUserId);
          updated = true;
        }
      }
      clearUserEventsStats(targetUserId);
      debouncedUpdateEtkinlikTop(client);
      if (updated) {
        saveEvents(eventsData);
        resetReports.push(`🏆 <@${targetUserId}> adlı üyenin **Etkinlik Katılım Bilgisi** sıfırlandı.`);
      } else {
        resetReports.push(`🏆 <@${targetUserId}> adlı üyenin **Etkinlik Katılım Bilgisi** sıfırlandı.`);
      }
    }
  }

  // YouTube
  if (youtubeOpt || resetAll) {
    if (isEveryone) {
      saveYoutubeChannels([]);
      resetReports.push('🎬 **YouTube Kanal Takip Listesi** (Herkes) sıfırlandı.');
    } else {
      resetReports.push('🎬 **YouTube Listesi** kişiye özel olmadığı için sıfırlanmadı (Tüm liste için `@everyone` kullanın).');
    }
  }

  // İstatistikler
  if (istatistiklerOpt || resetAll) {
    if (isEveryone) {
      clearAllVoiceMessagesStats();
      resetReports.push('📊 **İstatistik Verileri** (Herkes) sıfırlandı.');
    } else {
      clearUserVoiceMessagesStats(targetUserId);
      resetReports.push(`📊 <@${targetUserId}> adlı üyenin **İstatistik Verileri** sıfırlandı.`);
    }
  }

  const container = new ContainerBuilder()
    .setAccentColor(0xED4245)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🔄 Veri Sıfırlama İşlemi`))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `> **Hedef:** ${isEveryone ? '`@everyone` (Herkes)' : `<@${targetUserId}>`}\n\n` +
      resetReports.join('\n')
    ))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));

  await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2, ephemeral: true });
}

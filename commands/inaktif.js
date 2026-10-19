import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize,
  MessageFlags
} from 'discord.js';
import { getAllInactivityRecords, loadEvents } from '../db.js';
import { E } from '../utils/emojis.js';

export const data = new SlashCommandBuilder()
  .setName('inaktif')
  .setDescription('Ekip üyelerinden son 1 haftadır aktiflik göstermeyenleri detaylı listeler.')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption(o =>
    o.setName('tur')
      .setDescription('Kontrol edilecek inaktiflik türü')
      .setRequired(true)
      .addChoices(
        { name: 'Genel (Tüm Kategorilerde İnaktif)', value: 'tumu' },
        { name: 'Ses', value: 'ses' },
        { name: 'Yazı (Mesaj)', value: 'yazi' },
        { name: 'Etkinlik', value: 'etkinlik' }
      )
  );

export async function execute(interaction, client) {
  const tur = interaction.options.getString('tur', true);
  const onayRoleId = client.config?.onayRoleId;

  if (!onayRoleId) {
    return interaction.reply({
      content: '❌ Konfigürasyonda ekip üyesi rolü (`onayRoleId`) tanımlanmamış!',
      flags: MessageFlags.Ephemeral
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const guild = interaction.guild;
  const role = guild.roles.cache.get(onayRoleId) || await guild.roles.fetch(onayRoleId).catch(() => null);

  if (!role) {
    return interaction.editReply({
      content: '❌ Sunucuda ekip üyesi rolü (`onayRoleId`) bulunamadı!'
    });
  }

  // Fetch all guild members reliably to populate cache
  try {
    if (guild.members.cache.size < guild.memberCount) {
      await guild.members.fetch().catch(err => {
        console.warn('[inaktif] guild.members.fetch() uyarısı:', err?.message);
      });
    }
  } catch (e) {
    console.warn('[inaktif] fetch error:', e);
  }

  // Get team members who have the onayRole
  const teamMembers = [];
  guild.members.cache.forEach(member => {
    if (!member.user.bot && member.roles.cache.has(onayRoleId)) {
      teamMembers.push([member.id, member]);
    }
  });

  if (teamMembers.length === 0) {
    return interaction.editReply({
      content: `❌ **${role.name}** rolüne sahip hiçbir ekip üyesi bulunamadı.`
    });
  }

  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const inactivityMap = getAllInactivityRecords();

  // Check if any events occurred in the past 7 days
  const events = loadEvents() || [];
  const recentEvents = events.filter(e => e.createdAt && new Date(e.createdAt).getTime() > oneWeekAgo);

  const inactiveUsers = [];

  for (const [id, member] of teamMembers) {
    // If member joined the server less than 7 days ago, skip or note them
    const isNewMember = member.joinedTimestamp && member.joinedTimestamp > oneWeekAgo;
    const userRec = inactivityMap.get(id) || { lastVoice: null, lastMessage: null, lastEvent: null };

    // Voice check
    const isInVoiceNow = !!member.voice?.channelId;
    const hasRecentVoice = isInVoiceNow || (userRec.lastVoice && userRec.lastVoice >= oneWeekAgo);

    // Message check
    const hasRecentMessage = userRec.lastMessage && userRec.lastMessage >= oneWeekAgo;

    // Event check
    const hasRecentEvent = userRec.lastEvent && userRec.lastEvent >= oneWeekAgo;

    let isInactive = false;
    let lastActiveTime = null;
    let detailNote = '';

    if (tur === 'ses') {
      if (!hasRecentVoice) {
        isInactive = true;
        lastActiveTime = userRec.lastVoice;
      }
    } else if (tur === 'yazi') {
      if (!hasRecentMessage) {
        isInactive = true;
        lastActiveTime = userRec.lastMessage;
      }
    } else if (tur === 'etkinlik') {
      if (!hasRecentEvent) {
        isInactive = true;
        lastActiveTime = userRec.lastEvent;
      }
    } else if (tur === 'tumu') {
      // For "tumu", user must be inactive across all fronts: no voice, no message, no event
      if (!hasRecentVoice && !hasRecentMessage && !hasRecentEvent) {
        isInactive = true;
        const maxTime = Math.max(userRec.lastVoice || 0, userRec.lastMessage || 0, userRec.lastEvent || 0);
        lastActiveTime = maxTime > 0 ? maxTime : null;
      }
    }

    if (isInactive) {
      if (isNewMember) {
        detailNote = ' *(Yeni Üye)*';
      }
      inactiveUsers.push({
        member,
        lastActiveTime,
        detailNote
      });
    }
  }

  // Sort inactive users: oldest last activity first (nulls first)
  inactiveUsers.sort((a, b) => {
    const timeA = a.lastActiveTime || 0;
    const timeB = b.lastActiveTime || 0;
    return timeA - timeB;
  });

  const typeNames = {
    tumu: 'Genel (Tüm Kategoriler)',
    etkinlik: 'Etkinlik',
    yazi: 'Yazı (Mesaj)',
    ses: 'Ses'
  };

  const typeIcons = {
    tumu: '<:733737files:1508008108310528070>',
    etkinlik: E.yildiz || '⭐',
    yazi: E.chat || '💬',
    ses: '<:discord_voice_from_VEGA:1518058473957359706>'
  };

  const typeName = typeNames[tur];
  const typeIcon = typeIcons[tur];

  // Notice about events if none took place
  let eventNotice = '';
  if (tur === 'etkinlik' && recentEvents.length === 0) {
    eventNotice = `> ⚠️ *Bilgi: Son 1 haftada sunucuda tamamlanmış bir etkinlik bulunmadığı için katılımlar eski tarihlere dayanmaktadır.*\n\n`;
  }

  const maxListings = 30;
  let displayStr = '';
  if (inactiveUsers.length === 0) {
    displayStr = `🎉 **Harika haber! Son 1 haftadır bu kategoride inaktif olan hiçbir ekip üyesi bulunmuyor.**`;
  } else {
    const totalCount = inactiveUsers.length;
    const displayed = inactiveUsers.slice(0, maxListings);
    displayStr = displayed.map((item, idx) => {
      const lastActiveStr = item.lastActiveTime
        ? `<t:${Math.floor(item.lastActiveTime / 1000)}:R>`
        : '`Hiç aktiflik yok`';
      return `> **${idx + 1}.** ${item.member} (\`${item.member.id}\`) • ${lastActiveStr}${item.detailNote}`;
    }).join('\n');

    if (totalCount > maxListings) {
      displayStr += `\n\n*...ve ${totalCount - maxListings} üye daha.*`;
    }
  }

  const totalMembersCount = teamMembers.length;
  const activeCount = totalMembersCount - inactiveUsers.length;
  const activePercentage = totalMembersCount > 0 ? Math.round((activeCount / totalMembersCount) * 100) : 100;

  const container = new ContainerBuilder()
    .setAccentColor(inactiveUsers.length === 0 ? 0x57F287 : 0xED4245)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## <:info:1507746625508868157> İnaktif Ekip Üyeleri Raporu`)
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `Aşağıda, son **1 haftadır** **${typeName}** ${typeIcon} kategorisinde aktiflik göstermeyen ekip üyeleri listelenmiştir:\n\n` +
        `> 👥 **Toplam Ekip Üyesi:** \`${totalMembersCount}\` kişi\n` +
        `> 🔴 **İnaktif Üye Sayısı:** \`${inactiveUsers.length}\` kişi\n` +
        `> 🟢 **Aktiflik Oranı:** \`%${activePercentage}\`\n\n` +
        eventNotice +
        displayStr
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('-# Viqole Bot`s')
    );

  await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

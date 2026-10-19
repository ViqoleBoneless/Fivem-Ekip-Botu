import {
  SlashCommandBuilder,
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize,
  MessageFlags, AttachmentBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder,
  AuditLogEvent
} from 'discord.js';
import { getUserStats } from '../utils/statsHelper.js';
import { getUserApprovalStats, getLastActivities } from '../db.js';
import { E } from '../utils/emojis.js';
import { generateUserInfoCard } from '../utils/canvasHelper.js';

export const data = new SlashCommandBuilder()
  .setName('kullanıcıbilgi')
  .setDescription('Bir kullanıcının bilgilerini ve aktiflik istatistiklerini gösterir.')
  .addUserOption(o => o.setName('uye').setDescription('Bilgileri gösterilecek üye').setRequired(true))
  .addStringOption(o => o.setName('sure').setDescription('İstatistik zaman dilimi').setRequired(false)
    .addChoices(
      { name: 'Günlük', value: 'gunluk' },
      { name: 'Haftalık', value: 'haftalik' },
      { name: 'Aylık', value: 'aylik' },
      { name: 'Tüm Zamanlar', value: 'tum_zamanlar' }
    ));

export async function execute(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const sure = interaction.options.getString('sure') || 'tum_zamanlar';
  const targetUser = interaction.options.getUser('uye', true);

  const stats = getUserStats(targetUser.id, sure);
  const approvalStats = getUserApprovalStats(targetUser.id);
  const lastActivities = getLastActivities(targetUser.id);

  let approvedBy = approvalStats.approvedBy;
  if (!approvedBy) {
    const onayRoleId = interaction.client.config?.onayRoleId;
    if (onayRoleId) {
      try {
        const auditLogs = await interaction.guild.fetchAuditLogs({
          type: AuditLogEvent.MemberRoleUpdate,
          limit: 100
        });
        const entry = auditLogs.entries.find(e => {
          if (e.targetId !== targetUser.id) return false;
          const roleChange = e.changes?.find(c => 
            c.key === '$add' && 
            Array.isArray(c.new) && 
            c.new.some(r => r.id === onayRoleId || r === onayRoleId || (typeof r === 'object' && r && r.id === onayRoleId))
          );
          return !!roleChange;
        });
        if (entry && entry.executor) {
          approvedBy = entry.executor.id;
        }
      } catch (err) {
        console.error('[KULLANICIBILGI] Audit log fetch error:', err);
      }
    }
  }

  // Üyenin seste olup olmadığını kontrol et
  const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
  const isInVoice = member?.voice?.channelId;

  // İnaktiflik sürelerini hesapla
  let eventInactivityStr = '`Veri bulunamadı`';
  if (lastActivities.lastEvent) {
    eventInactivityStr = `<t:${Math.floor(lastActivities.lastEvent / 1000)}:R>`;
  }

  let voiceInactivityStr = '`Veri bulunamadı`';
  if (isInVoice) {
    voiceInactivityStr = '`Aktif (Şu an seste)`';
  } else if (lastActivities.lastVoice) {
    voiceInactivityStr = `<t:${Math.floor(lastActivities.lastVoice / 1000)}:R>`;
  }

  let messageInactivityStr = '`Veri bulunamadı`';
  if (lastActivities.lastMessage) {
    messageInactivityStr = `<t:${Math.floor(lastActivities.lastMessage / 1000)}:R>`;
  }

  const totalSeconds = stats.voice;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  let voiceStr = '';
  if (hours > 0) {
    voiceStr = `\`${hours}\` saat \`${minutes}\` dakika`;
  } else if (minutes > 0) {
    voiceStr = `\`${minutes}\` dakika \`${seconds}\` saniye`;
  } else {
    voiceStr = `\`${seconds}\` saniye`;
  }

  const sureMap = {
    gunluk: 'Günlük',
    haftalik: 'Haftalık',
    aylik: 'Aylık',
    tum_zamanlar: 'Tüm Zamanlar'
  };

  const sureName = sureMap[sure] || 'Bilinmeyen Süre';
  const userEmoji = E.uye || '👤';
  const chatEmoji = E.chat || '💬';
  const starEmoji = E.yildiz || '⭐';

  const container = new ContainerBuilder()
    .setAccentColor(0x5865F2);

  const cardBuffer = await generateUserInfoCard({
    username: targetUser.tag,
    avatarUrl: targetUser.displayAvatarURL({ extension: 'png', size: 256 }),
    userId: targetUser.id,
    voiceStr,
    messageCount: stats.messages,
    eventCount: stats.events,
    approvedCount: approvalStats.approvedCount,
    rejectedCount: approvalStats.rejectedCount
  }).catch(err => {
    console.error('[KULLANICIBILGI] Canvas generation failed:', err);
    return null;
  });

  const files = [];
  if (cardBuffer) {
    const attachment = new AttachmentBuilder(cardBuffer, { name: 'user-card.png' });
    files.push(attachment);
  }

  container
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## <:info:1507746625508868157> Kullanıcı Bilgisi & İstatistikleri (${sureName})`)
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${targetUser} kullanıcısının **${sureName}** bilgileri ve aktiflik verileri:\n\n` +
        `> ${userEmoji} **Kullanıcı:** ${targetUser} (\`${targetUser.tag}\`)\n` +
        `> <:discord_voice_from_VEGA:1518058473957359706> **Ses Aktifliği:** ${voiceStr}\n` +
        `> <:message:1518058718019715263> **Yazılan Mesaj:** \`${stats.messages.toLocaleString('tr-TR')}\` adet\n` +
        `> ${starEmoji} **Katıldığı Etkinlik:** \`${stats.events.toLocaleString('tr-TR')}\` adet\n` +
        `> <a:tik:1507733693903540265> **Onayladığı Başvuru:** \`${approvalStats.approvedCount}\` adet\n` +
        `> <:6684removered:1508002952374259742>**Reddettiği Başvuru:** \`${approvalStats.rejectedCount}\` adet\n` +
        `> <:mod:1507746579078053999> **Ekibe Kabul Eden:** ${approvedBy ? `<@${approvedBy}>` : '`Belirtilmemiş / Bulunamadı`'}\n` +
        `> ${starEmoji} **ID:** \`${targetUser.id}\``
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### <a:coffe:1517808496748527726> İnaktiflik Bilgileri\n\n` +
        `> 📅 **Etkinlik İnaktiflik Süresi:** ${eventInactivityStr}\n` +
        `> <:emote_vmute:1507734485058195536> **Ses İnaktiflik Süresi:** ${voiceInactivityStr}\n` +
        `> <:emote_cmute:1507734502817005659> **Mesaj İnaktiflik Süresi:** ${messageInactivityStr}`
      )
    );

  if (cardBuffer) {
    container
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
      )
      .addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
          new MediaGalleryItemBuilder().setURL('attachment://user-card.png')
        )
      );
  }

  container
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('-# Viqole Bots')
    );

  await interaction.editReply({ components: [container], files, flags: MessageFlags.IsComponentsV2 });
}


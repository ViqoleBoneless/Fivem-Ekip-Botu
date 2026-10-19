import {
  SlashCommandBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionFlagsBits
} from 'discord.js';
import { getAllUsersVoiceTimes } from '../utils/statsHelper.js';
import { generateLeaderboardCard } from '../utils/canvasHelper.js';

const PAGE_SIZE = 10;

export const data = new SlashCommandBuilder()
  .setName('ses-top')
  .setDescription('Ses kanallarindaki aktiflik siralamasini gorsel olarak gosterir.');

async function resolveLeaderboardEntries(guild, items, start) {
  return Promise.all(items.map(async (item, index) => {
    const member = await guild.members.fetch(item.userId).catch(() => null);
    const user = member?.user || await guild.client.users.fetch(item.userId).catch(() => null);

    return {
      rank: start + index + 1,
      userId: item.userId,
      displayName: member?.displayName || user?.username || `Kullanici ${item.userId}`,
      avatarUrl: member?.displayAvatarURL({ extension: 'png', size: 128 }) || user?.displayAvatarURL({ extension: 'png', size: 128 }),
      value: item.seconds
    };
  }));
}

function buildButtons(page, totalPages, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('sestop_prev')
      .setLabel('Onceki')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || page === 0),
    new ButtonBuilder()
      .setCustomId('sestop_next')
      .setLabel('Sonraki')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || page >= totalPages - 1)
  );
}

async function buildPage(sorted, page, guild, ekipIsmi) {
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const start = page * PAGE_SIZE;
  const entries = await resolveLeaderboardEntries(guild, sorted.slice(start, start + PAGE_SIZE), start);
  const buffer = await generateLeaderboardCard({
    title: 'Ses Aktiflik Siralamasi',
    subtitle: ekipIsmi || 'Ekip Sıralaması',
    entries,
    page,
    totalPages,
    totalCount: sorted.length,
    type: 'voice'
  });

  return {
    attachment: new AttachmentBuilder(buffer, { name: 'ses-top.png' }),
    row: buildButtons(page, totalPages),
    totalPages
  };
}

export async function execute(interaction, client) {
  const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
  const hasOnayRole = client.config.onayRoleId && interaction.member.roles.cache.has(client.config.onayRoleId);
  if (!isAdmin && !hasOnayRole) {
    return interaction.reply({
      content: 'Bu komutu kullanmak icin Yonetici yetkisine veya Onay rolune sahip olmaniz gerekiyor.',
      flags: MessageFlags.Ephemeral
    });
  }

  await interaction.guild.members.fetch();
  let allVoiceTimes = getAllUsersVoiceTimes().sort((a, b) => b.seconds - a.seconds);
  const onayRoleId = client.config.onayRoleId;
  allVoiceTimes = allVoiceTimes.filter(item => {
    const member = interaction.guild.members.cache.get(item.userId);
    if (!member) return false;
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    if (onayRoleId && member.roles.cache.has(onayRoleId)) return true;
    return false;
  });

  let page = 0;
  const { attachment, row, totalPages } = await buildPage(allVoiceTimes, page, interaction.guild, client.config.ekipIsmi);

  const reply = await interaction.reply({
    files: [attachment],
    components: totalPages > 1 ? [row] : [],
    allowedMentions: { parse: [] },
    fetchReply: true
  });

  if (totalPages <= 1) return;

  const collector = reply.createMessageComponentCollector({
    filter: componentInteraction => componentInteraction.user.id === interaction.user.id && ['sestop_prev', 'sestop_next'].includes(componentInteraction.customId),
    time: 5 * 60 * 1000
  });

  collector.on('collect', async componentInteraction => {
    try {
      await componentInteraction.deferUpdate();
    } catch (err) {
      console.error('sestop deferUpdate error:', err);
      return;
    }

    if (componentInteraction.customId === 'sestop_next') page = Math.min(page + 1, totalPages - 1);
    else page = Math.max(page - 1, 0);

    try {
      const { attachment: newAttachment, row: newRow } = await buildPage(allVoiceTimes, page, interaction.guild, client.config.ekipIsmi);
      await componentInteraction.editReply({
        files: [newAttachment],
        attachments: [],
        components: [newRow],
        allowedMentions: { parse: [] }
      });
    } catch (err) {
      console.error('sestop editReply error:', err);
    }
  });

  collector.on('end', async () => {
    try {
      const { attachment: finalAttachment, totalPages: finalTotalPages } = await buildPage(allVoiceTimes, page, interaction.guild, client.config.ekipIsmi);
      await reply.edit({
        files: [finalAttachment],
        attachments: [],
        components: [buildButtons(page, finalTotalPages, true)],
        allowedMentions: { parse: [] }
      });
    } catch {}
  });
}

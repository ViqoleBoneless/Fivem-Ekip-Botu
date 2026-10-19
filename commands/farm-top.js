import {
  SlashCommandBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionFlagsBits
} from 'discord.js';
import { getFarmLeaderboard } from '../db.js';
import { generateLeaderboardCard } from '../utils/canvasHelper.js';

const PAGE_SIZE = 10;

export const data = new SlashCommandBuilder()
  .setName('farm-top')
  .setDescription('En çok farm yapan üyeleri görsel sıralama olarak gösterir.');

async function resolveLeaderboardEntries(guild, items, start) {
  return Promise.all(items.map(async (item, index) => {
    const member = await guild.members.fetch(item.user_id).catch(() => null);
    const user = member?.user || await guild.client.users.fetch(item.user_id).catch(() => null);

    return {
      rank: start + index + 1,
      userId: item.user_id,
      displayName: member?.displayName || user?.username || `Kullanıcı ${item.user_id}`,
      avatarUrl: member?.displayAvatarURL({ extension: 'png', size: 128 }) || user?.displayAvatarURL({ extension: 'png', size: 128 }),
      value: item.amount
    };
  }));
}

function buildButtons(page, totalPages, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('farmtop_prev')
      .setLabel('Önceki')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || page === 0),
    new ButtonBuilder()
      .setCustomId('farmtop_next')
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
    title: 'Top 10 Farm Sıralaması',
    subtitle: ekipIsmi || 'Viqole Ekip',
    entries,
    page,
    totalPages,
    totalCount: sorted.length,
    type: 'farm'
  });

  return {
    attachment: new AttachmentBuilder(buffer, { name: 'farm-top.png' }),
    row: buildButtons(page, totalPages),
    totalPages
  };
}

export async function execute(interaction, client) {
  const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
  const hasOnayRole = client.config.onayRoleId && interaction.member.roles.cache.has(client.config.onayRoleId);
  if (!isAdmin && !hasOnayRole) {
    return interaction.reply({
      content: 'Bu komutu kullanmak için Yönetici yetkisine veya Onay rolüne sahip olmanız gerekiyor.',
      flags: MessageFlags.Ephemeral
    });
  }

  await interaction.deferReply();

  await interaction.guild.members.fetch().catch(() => null);
  let farmList = getFarmLeaderboard(interaction.guild.id);
  farmList = farmList.sort((a, b) => b.amount - a.amount);

  // Sadece onayRoleId'ye sahip kişileri veya adminleri göster
  const onayRoleId = client.config.onayRoleId;
  farmList = farmList.filter(item => {
    const member = interaction.guild.members.cache.get(item.user_id);
    if (!member) return false;
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    if (onayRoleId && member.roles.cache.has(onayRoleId)) return true;
    return false;
  });

  let page = 0;
  const { attachment, row, totalPages } = await buildPage(farmList, page, interaction.guild, client.config?.ekipIsmi);

  const reply = await interaction.editReply({
    files: [attachment],
    components: totalPages > 1 ? [row] : [],
    allowedMentions: { parse: [] }
  });

  if (totalPages <= 1) return;

  const collector = reply.createMessageComponentCollector({
    filter: componentInteraction => componentInteraction.user.id === interaction.user.id && ['farmtop_prev', 'farmtop_next'].includes(componentInteraction.customId),
    time: 5 * 60 * 1000
  });

  collector.on('collect', async componentInteraction => {
    try {
      await componentInteraction.deferUpdate();
    } catch (err) {
      console.error('farmtop deferUpdate error:', err);
      return;
    }

    if (componentInteraction.customId === 'farmtop_next') page = Math.min(page + 1, totalPages - 1);
    else page = Math.max(page - 1, 0);

    try {
      const { attachment: newAttachment, row: newRow } = await buildPage(farmList, page, interaction.guild, client.config?.ekipIsmi);
      await componentInteraction.editReply({
        files: [newAttachment],
        attachments: [],
        components: [newRow],
        allowedMentions: { parse: [] }
      });
    } catch (err) {
      console.error('farmtop editReply error:', err);
    }
  });

  collector.on('end', async () => {
    try {
      const { attachment: finalAttachment, totalPages: finalTotalPages } = await buildPage(farmList, page, interaction.guild, client.config?.ekipIsmi);
      await reply.edit({
        files: [finalAttachment],
        attachments: [],
        components: [buildButtons(page, finalTotalPages, true)],
        allowedMentions: { parse: [] }
      });
    } catch {}
  });
}

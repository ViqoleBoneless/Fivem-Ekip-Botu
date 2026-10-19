import {
  SlashCommandBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionFlagsBits
} from 'discord.js';
import fs from 'fs';
import { getAllUsersEventCounts, updateEtkinlikTopMessage } from '../utils/statsHelper.js';
import { generateLeaderboardCard } from '../utils/canvasHelper.js';

const PAGE_SIZE = 10;

export const data = new SlashCommandBuilder()
  .setName('etkinlik-top')
  .setDescription('En cok etkinlige katilan uyeleri gorsel siralama olarak gosterir.')
  .addChannelOption(option =>
    option
      .setName('devamli-list')
      .setDescription('Secilen kanalda canli guncellenen bir siralama gorseli olusturur/kaldirir.')
      .setRequired(false)
  );

async function resolveLeaderboardEntries(guild, items, start) {
  return Promise.all(items.map(async (item, index) => {
    const member = await guild.members.fetch(item.userId).catch(() => null);
    const user = member?.user || await guild.client.users.fetch(item.userId).catch(() => null);

    return {
      rank: start + index + 1,
      userId: item.userId,
      displayName: member?.displayName || user?.username || `Kullanici ${item.userId}`,
      avatarUrl: member?.displayAvatarURL({ extension: 'png', size: 128 }) || user?.displayAvatarURL({ extension: 'png', size: 128 }),
      value: item.count
    };
  }));
}

function buildButtons(page, totalPages, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('etop_prev')
      .setLabel('Onceki')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || page === 0),
    new ButtonBuilder()
      .setCustomId('etop_next')
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
    title: 'En Cok Etkinlige Katilanlar',
    subtitle: ekipIsmi || 'Ekip Sıralaması',
    entries,
    page,
    totalPages,
    totalCount: sorted.length,
    type: 'event'
  });

  return {
    attachment: new AttachmentBuilder(buffer, { name: 'etkinlik-top.png' }),
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

  const channelOption = interaction.options.getChannel('devamli-list');

  if (channelOption) {
    const banCommandRoleId = client.config.banCommandRoleId;
    const hasRole = banCommandRoleId && interaction.member.roles.cache.has(banCommandRoleId);
    if (!hasRole && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: 'Canli listeyi yapilandirmak icin Ban Sorumlusu rolune veya Yonetici yetkisine sahip olmalisiniz.',
        flags: MessageFlags.Ephemeral
      });
    }

    const configPath = client.configPath;
    if (!configPath || !fs.existsSync(configPath)) {
      return interaction.reply({ content: 'Yapilandirma dosyasi bulunamadi.', flags: MessageFlags.Ephemeral });
    }

    const currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    if (currentConfig.etkinlikTopChannelId === channelOption.id) {
      currentConfig.etkinlikTopChannelId = null;
      currentConfig.etkinlikTopMessageId = null;
      fs.writeFileSync(configPath, JSON.stringify(currentConfig, null, 2), 'utf8');
      client.config = currentConfig;

      return interaction.reply({
        content: `Canli guncellenen etkinlik listesi ${channelOption} kanali icin devre disi birakildi.`,
        flags: MessageFlags.Ephemeral
      });
    }

    currentConfig.etkinlikTopChannelId = channelOption.id;
    currentConfig.etkinlikTopMessageId = null;
    fs.writeFileSync(configPath, JSON.stringify(currentConfig, null, 2), 'utf8');
    client.config = currentConfig;

    await interaction.reply({
      content: `Canli guncellenen etkinlik listesi ${channelOption} kanali icin etkinlestirildi ve guncelleniyor.`,
      flags: MessageFlags.Ephemeral
    });

    await updateEtkinlikTopMessage(client);
    return;
  }

  await interaction.guild.members.fetch();
  let allCounts = getAllUsersEventCounts().sort((a, b) => b.count - a.count);
  const onayRoleId = client.config.onayRoleId;
  allCounts = allCounts.filter(item => {
    const member = interaction.guild.members.cache.get(item.userId);
    if (!member) return false;
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    if (onayRoleId && member.roles.cache.has(onayRoleId)) return true;
    return false;
  });

  let page = 0;
  const { attachment, row, totalPages } = await buildPage(allCounts, page, interaction.guild, client.config.ekipIsmi);

  const reply = await interaction.reply({
    files: [attachment],
    components: totalPages > 1 ? [row] : [],
    allowedMentions: { parse: [] },
    fetchReply: true
  });

  if (totalPages <= 1) return;

  const collector = reply.createMessageComponentCollector({
    filter: componentInteraction => componentInteraction.user.id === interaction.user.id && ['etop_prev', 'etop_next'].includes(componentInteraction.customId),
    time: 5 * 60 * 1000
  });

  collector.on('collect', async componentInteraction => {
    try {
      await componentInteraction.deferUpdate();
    } catch (err) {
      console.error('etop deferUpdate error:', err);
      return;
    }

    if (componentInteraction.customId === 'etop_next') page = Math.min(page + 1, totalPages - 1);
    else page = Math.max(page - 1, 0);

    try {
      const { attachment: newAttachment, row: newRow } = await buildPage(allCounts, page, interaction.guild, client.config.ekipIsmi);
      await componentInteraction.editReply({
        files: [newAttachment],
        attachments: [],
        components: [newRow],
        allowedMentions: { parse: [] }
      });
    } catch (err) {
      console.error('etop editReply error:', err);
    }
  });

  collector.on('end', async () => {
    try {
      const { attachment: finalAttachment, totalPages: finalTotalPages } = await buildPage(allCounts, page, interaction.guild, client.config.ekipIsmi);
      await reply.edit({
        files: [finalAttachment],
        attachments: [],
        components: [buildButtons(page, finalTotalPages, true)],
        allowedMentions: { parse: [] }
      });
    } catch {}
  });
}

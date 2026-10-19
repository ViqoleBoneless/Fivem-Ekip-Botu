import { loadGiveaways, saveGiveaways } from '../db.js';
import {
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags
} from 'discord.js';
import { E } from '../utils/emojis.js';

export function buildGiveawayContainer(giveaway, isEnded = false) {
  const container = new ContainerBuilder()
    .setAccentColor(isEnded ? 0xED4245 : 0x5865F2);

  const title = isEnded
    ? `## ${E.pandawow || '🎉'} Çekiliş Sona Erdi`
    : `## ${E.pandawow || '🎉'} Çekiliş Başladı!`;

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(title));
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

  let winnerText = '';
  if (isEnded) {
    if (giveaway.winners && giveaway.winners.length > 0) {
      winnerText = `<a:30348trophyfixed:1509701464748982382> **Kazananlar:** ${giveaway.winners.map(id => `<@${id}>`).join(', ')}`;
    } else {
      winnerText = `<a:30348trophyfixed:1509701464748982382> **Kazananlar:** Yeterli katılım yok.`;
    }
  } else {
    winnerText = `<a:TimerSand:1509704018199449680> **Bitiş Zamanı:** <t:${Math.floor(giveaway.endsAt / 1000)}:F> (<t:${Math.floor(giveaway.endsAt / 1000)}:R>)`;
  }

  let descText = giveaway.description ? `\n📝 **Açıklama:** ${giveaway.description}` : '';

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `🎁 **Ödül:** **${giveaway.prize}**\n` +
    `> ${E.yildiz || '⭐'} **Kazanan Sayısı:** \`${giveaway.winnerCount}\`\n` +
    `> ${E.uye || '👤'} **Başlatan:** <@${giveaway.creatorId}>\n` +
    `> 📊 **Katılımcı Sayısı:** \`${giveaway.participants.length}\`\n` +
    winnerText + descText
  ));

  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

  if (!isEnded) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`giveaway_join_${giveaway.messageId}`)
        .setLabel(`Katıl (${giveaway.participants.length})`)
        .setStyle(ButtonStyle.Success)
        .setEmoji('🎉')
    );
    container.addActionRowComponents(row);
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
  }

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));

  return container;
}

export async function handleGiveawayJoin(interaction, client) {
  const messageId = interaction.customId.replace('giveaway_join_', '');
  const giveaways = loadGiveaways();
  const giveaway = giveaways.find(g => g.messageId === messageId);

  if (!giveaway) {
    return interaction.reply({ content: '❌ Çekiliş bulunamadı.', flags: MessageFlags.Ephemeral });
  }

  if (giveaway.ended) {
    return interaction.reply({ content: '❌ Bu çekiliş zaten sona ermiş.', flags: MessageFlags.Ephemeral });
  }

  const userId = interaction.user.id;
  const isJoined = giveaway.participants.includes(userId);

  if (isJoined) {
    // Leave giveaway
    giveaway.participants = giveaway.participants.filter(id => id !== userId);
    saveGiveaways(giveaways);

    await interaction.reply({ content: '📤 Çekilişten başarıyla ayrıldınız.', flags: MessageFlags.Ephemeral });
  } else {
    // Join giveaway
    giveaway.participants.push(userId);
    saveGiveaways(giveaways);

    await interaction.reply({ content: '🎉 Çekilişe başarıyla katıldınız!', flags: MessageFlags.Ephemeral });
  }

  // Update message with IsComponentsV2 flag
  const container = buildGiveawayContainer(giveaway);
  await interaction.message.edit({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
}

export async function endGiveaway(giveaway, guild, client) {
  giveaway.ended = true;

  const participants = giveaway.participants || [];
  let winners = [];

  if (giveaway.forcedWinnerId) {
    const forcedIds = String(giveaway.forcedWinnerId).split(',').map(s => s.trim()).filter(s => /^\d+$/.test(s));
    if (forcedIds.length > 0) {
      winners = forcedIds;
    }
  }

  if (winners.length === 0 && participants.length > 0) {
    const winnerCount = Math.min(giveaway.winnerCount, participants.length);
    const tempParticipants = [...participants];
    for (let i = 0; i < winnerCount; i++) {
      const randIndex = Math.floor(Math.random() * tempParticipants.length);
      winners.push(tempParticipants.splice(randIndex, 1)[0]);
    }
  }

  giveaway.winners = winners;

  try {
    const channel = await guild.channels.fetch(giveaway.channelId).catch(() => null);
    if (channel?.isTextBased()) {
      const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
      if (message) {
        const container = buildGiveawayContainer(giveaway, true);
        await message.edit({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
      }

      // Announce winners
      if (winners.length > 0) {
        await channel.send({
          content: `🎉 Tebrikler! **${giveaway.prize}** çekilişini kazandınız: ${winners.map(id => `<@${id}>`).join(', ')}`,
          allowedMentions: { parse: ['users'] }
        });
      } else {
        await channel.send({
          content: `⏰ **${giveaway.prize}** çekilişi sona erdi ancak yeterli katılım olmadığı için kazanan belirlenemedi.`
        });
      }
    }
  } catch (err) {
    console.error('Giveaway end error:', err);
  }

  // Delete management message from aktif-işlemler
  try {
    const mgmtChId = client.config?.aktifIslemlerChannelId;
    if (mgmtChId && giveaway.mgmtMessageId) {
      const mgmtChannel = await guild.channels.fetch(mgmtChId).catch(() => null);
      if (mgmtChannel?.isTextBased()) {
        const mgmtMsg = await mgmtChannel.messages.fetch(giveaway.mgmtMessageId).catch(() => null);
        if (mgmtMsg) await mgmtMsg.delete().catch(() => null);
      }
    }
  } catch (err) {
    console.error('Giveaway management message deletion error:', err);
  }
}

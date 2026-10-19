import {
  SlashCommandBuilder, PermissionFlagsBits, MessageFlags
} from 'discord.js';
import { loadGiveaways, saveGiveaways } from '../db.js';
import { buildGiveawayContainer } from '../handlers/giveawayHandler.js';

export const data = new SlashCommandBuilder()
  .setName('çekiliş-yenidençek')
  .setDescription('Belirtilen çekiliş için yeniden kazanan çeker.')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption(o => o.setName('mesaj-id').setDescription('Çekiliş mesaj ID\'si').setRequired(true));

export async function execute(interaction, client) {
  const messageId = interaction.options.getString('mesaj-id', true);
  const giveaways = loadGiveaways();
  const giveaway = giveaways.find(g => g.messageId === messageId);

  if (!giveaway) {
    return interaction.reply({ content: '❌ Çekiliş bulunamadı.', flags: MessageFlags.Ephemeral });
  }

  if (!giveaway.ended) {
    return interaction.reply({ content: '❌ Çekiliş henüz bitmemiş. Önce bitirmelisiniz.', flags: MessageFlags.Ephemeral });
  }

  const participants = giveaway.participants || [];
  if (participants.length === 0) {
    return interaction.reply({ content: '❌ Çekilişe katılan kimse olmadığı için yeniden çekilemez.', flags: MessageFlags.Ephemeral });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const winnerCount = Math.min(giveaway.winnerCount, participants.length);
  const winners = [];
  const tempParticipants = [...participants];
  for (let i = 0; i < winnerCount; i++) {
    const randIndex = Math.floor(Math.random() * tempParticipants.length);
    winners.push(tempParticipants.splice(randIndex, 1)[0]);
  }

  giveaway.winners = winners;
  saveGiveaways(giveaways);

  // Edit original message
  try {
    const channel = await interaction.guild.channels.fetch(giveaway.channelId).catch(() => null);
    if (channel?.isTextBased()) {
      const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
      if (message) {
        const container = buildGiveawayContainer(giveaway, true);
        await message.edit({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
      }
      
      await channel.send({
        content: `🎉 **Yeniden Çekim!** **${giveaway.prize}** çekilişinin yeni kazananları: ${winners.map(id => `<@${id}>`).join(', ')}`,
        allowedMentions: { parse: ['users'] }
      });
    }
  } catch (err) {
    console.error('Re-roll error:', err);
  }

  await interaction.editReply({ content: '✅ Çekiliş yeniden çekildi ve kazananlar duyuruldu.' });
}

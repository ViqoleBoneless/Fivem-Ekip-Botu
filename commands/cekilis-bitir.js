import {
  SlashCommandBuilder, PermissionFlagsBits, MessageFlags
} from 'discord.js';
import { loadGiveaways, saveGiveaways } from '../db.js';
import { endGiveaway } from '../handlers/giveawayHandler.js';

export const data = new SlashCommandBuilder()
  .setName('çekiliş-bitir')
  .setDescription('Belirtilen çekilişi erken bitirir.')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption(o => o.setName('mesaj-id').setDescription('Çekiliş mesaj ID\'si').setRequired(true));

export async function execute(interaction, client) {
  const messageId = interaction.options.getString('mesaj-id', true);
  const giveaways = loadGiveaways();
  const giveaway = giveaways.find(g => g.messageId === messageId);

  if (!giveaway) {
    return interaction.reply({ content: '❌ Çekiliş bulunamadı.', flags: MessageFlags.Ephemeral });
  }

  if (giveaway.ended) {
    return interaction.reply({ content: '❌ Bu çekiliş zaten sona ermiş.', flags: MessageFlags.Ephemeral });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  await endGiveaway(giveaway, interaction.guild, client);
  saveGiveaways(giveaways);

  await interaction.editReply({ content: '✅ Çekiliş başarıyla erken bitirildi.' });
}

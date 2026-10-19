import { hasPermission } from '../utils/permissions.js';
import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { getTicket } from '../db.js';

export const data = new SlashCommandBuilder()
  .setName('ticket-çıkar')
  .setDescription('Bir kullanıcıyı ticket kanalından çıkarır.')
  .addUserOption(o => o.setName('kullanici').setDescription('Çıkarılacak kullanıcı').setRequired(true));

export async function execute(interaction, client) {
  if (!hasPermission(interaction.member, 'ticketStaff', client))
    return interaction.reply({ content: '❌ Bu komutu kullanmak için yetkili rolüne sahip olmalısınız.', ephemeral: true });

  const isTicket = getTicket(interaction.guild.id, interaction.channel.id);
  if (!isTicket) return interaction.reply({ content: '❌ Bu komut sadece ticket kanallarında kullanılabilir.', ephemeral: true });

  const targetUser = interaction.options.getUser('kullanici');
  // Ticket sahibini çıkaramazsın
  if (isTicket.userId === targetUser.id) return interaction.reply({ content: '❌ Ticket sahibini kanaldan çıkaramazsınız.', ephemeral: true });

  try {
    await interaction.channel.permissionOverwrites.edit(targetUser, { ViewChannel: false });
    await interaction.reply({ content: `✅ ${targetUser} ticket kanalından çıkarıldı.` });
  } catch (err) {
    console.error('ticket-çıkar hatası:', err);
    await interaction.reply({ content: '❌ Kullanıcı çıkarılırken hata oluştu.', ephemeral: true });
  }
}

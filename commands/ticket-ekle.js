import { hasPermission } from '../utils/permissions.js';
import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { getTicket } from '../db.js';

export const data = new SlashCommandBuilder()
  .setName('ticket-ekle')
  .setDescription('Bir kullanıcıyı ticket kanalına ekler.')
  .addUserOption(o => o.setName('kullanici').setDescription('Eklenecek kullanıcı').setRequired(true));

export async function execute(interaction, client) {
  if (!hasPermission(interaction.member, 'ticketStaff', client))
    return interaction.reply({ content: '❌ Bu komutu kullanmak için yetkili rolüne sahip olmalısınız.', ephemeral: true });

  // Ticket kanalı kontrolü
  const isTicket = getTicket(interaction.guild.id, interaction.channel.id);
  if (!isTicket) return interaction.reply({ content: '❌ Bu komut sadece ticket kanallarında kullanılabilir.', ephemeral: true });

  const targetUser = interaction.options.getUser('kullanici');
  const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
  if (!targetMember) return interaction.reply({ content: '❌ Kullanıcı sunucuda bulunamadı.', ephemeral: true });

  try {
    await interaction.channel.permissionOverwrites.edit(targetMember, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true
    });
    await interaction.reply({ content: `✅ ${targetUser} ticket kanalına eklendi.` });
  } catch (err) {
    console.error('ticket-ekle hatası:', err);
    await interaction.reply({ content: '❌ Kullanıcı eklenirken hata oluştu.', ephemeral: true });
  }
}

import { hasPermission } from '../utils/permissions.js';
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { getTicketsForGuild } from '../db.js';
import { forceCloseTicket } from '../handlers/ticketHandler.js';

export const data = new SlashCommandBuilder()
  .setName('butunticketlerikapat')
  .setDescription('Sunucudaki tüm açık destek ve başvuru ticket kanallarını kapatır ve siler.');

export async function execute(interaction, client) {
  if (!hasPermission(interaction.member, 'ticketStaff', client)) {
    return interaction.reply({ content: '❌ Bu komutu kullanmak için yetkili rolüne sahip olmalısınız.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const dbTickets = getTicketsForGuild(interaction.guild.id);
    const ticketChannels = [];

    // Filter text channels that are registered in SQLite or start with basvuru-, destek-, referans-
    const textChannels = interaction.guild.channels.cache.filter(c => c.type === ChannelType.GuildText);
    for (const [channelId, channel] of textChannels) {
      const dbTicket = dbTickets[channelId];
      const nameLower = channel.name.toLowerCase();
      const isTicketName = nameLower.startsWith('basvuru-') || nameLower.startsWith('destek-') || nameLower.startsWith('referans-');

      if (dbTicket || isTicketName) {
        ticketChannels.push(channel);
      }
    }

    if (ticketChannels.length === 0) {
      return interaction.editReply({ content: 'ℹ️ Sunucuda kapatılacak açık ticket kanalı bulunamadı.' });
    }

    await interaction.editReply({ content: `⏳ Toplam **${ticketChannels.length}** adet ticket kapatılıyor ve siliniyor. Lütfen bekleyin...` });

    let successCount = 0;
    for (const channel of ticketChannels) {
      try {
        await forceCloseTicket(channel, interaction.member);
        successCount++;
      } catch (err) {
        console.error(`Kanal kapatılırken hata oluştu (${channel.name}):`, err);
      }
    }

    await interaction.followUp({ content: `✅ Toplam **${successCount}** adet ticket kanalı başarıyla kapatıldı, transkriptleri çıkartılarak loglandı ve silindi.`, ephemeral: true });
  } catch (err) {
    console.error('butunticketlerikapat komut hatası:', err);
    await interaction.editReply({ content: '❌ İşlem gerçekleştirilirken bir hata oluştu.' });
  }
}

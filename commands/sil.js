import {
  SlashCommandBuilder, PermissionFlagsBits, MessageFlags, EmbedBuilder
} from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('sil')
  .setDescription('Belirtilen miktarda mesajı temizler.')
  .addIntegerOption(option =>
    option.setName('miktar')
      .setDescription('Silinecek mesaj sayısı (1-100)')
      .setMinValue(1)
      .setMaxValue(100)
      .setRequired(true)
  );

export async function execute(interaction, client) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
    return interaction.editReply({ content: '❌ Bu komutu kullanmak için "Mesajları Yönet" yetkisine sahip olmalısınız.' });
  }

  if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageMessages)) {
    return interaction.editReply({ content: '❌ Botun mesajları silme yetkisi yok (Mesajları Yönet yetkisi gerekiyor).' });
  }

  const miktar = interaction.options.getInteger('miktar', true);

  try {
    const deleted = await interaction.channel.bulkDelete(miktar, true);

    // mesaj-log kanalına Embed V1 gönder
    const msgLogChannelId = client.config.messageLogChannelId;
    if (msgLogChannelId && client.config?.messageLogChannelIdEnabled !== false) {
      const logChannel = interaction.guild.channels.cache.get(msgLogChannelId) || await interaction.guild.channels.fetch(msgLogChannelId).catch(() => null);
      if (logChannel?.isTextBased()) {
        const embed = new EmbedBuilder()
          .setColor(0x3498db)
          .setTitle('🗑️ Toplu Mesaj Silme')
          .addFields(
            { name: '📺 Kanal', value: `${interaction.channel} (\`#${interaction.channel.name}\`)`, inline: true },
            { name: '🗑️ Silinen Miktar', value: `\`${deleted.size}\``, inline: true },
            { name: '<:ye:1507732515585265825> İşlemi Yapan', value: `${interaction.user} (\`${interaction.user.tag}\`)`, inline: false }
          )
          .setFooter({ text: 'Viqole Bot`s' });
        logChannel.send({ embeds: [embed] }).catch(err => console.error('Sil log gönderme hatası:', err));
      }
    }

    return interaction.editReply({ content: `✅ Başarıyla **${deleted.size}** adet mesaj silindi.` });
  } catch (error) {
    console.error('Mesaj silme hatası:', error);
    return interaction.editReply({ content: '❌ Mesajlar silinirken bir hata oluştu (14 günden eski mesajlar bulkDelete ile silinemez).' });
  }
}

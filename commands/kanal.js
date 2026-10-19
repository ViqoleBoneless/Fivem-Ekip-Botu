import {
  SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType
} from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('kanal')
  .setDescription('Kanal kilidini açar veya kanalı kilitler.')
  .addStringOption(o =>
    o.setName('islem')
      .setDescription('Yapılacak işlem')
      .setRequired(true)
      .addChoices(
        { name: 'Kilitle', value: 'kilitle' },
        { name: 'Aç', value: 'ac' }
      )
  )
  .addChannelOption(o =>
    o.setName('hedef-kanal')
      .setDescription('Kilitlenecek/açılacak kanal (boş = bulunulan kanal)')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(false)
  );

export async function execute(interaction, client) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // Yetki kontrolü (kullanıcı)
  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
    return interaction.editReply({ content: '❌ Bu komutu kullanmak için "Kanalları Yönet" yetkisine sahip olmalısınız.' });
  }

  // Yetki kontrolü (bot)
  if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
    return interaction.editReply({ content: '❌ Botun kanalları yönetme yetkisi yok (Kanalları Yönet yetkisi gerekiyor).' });
  }

  const islem = interaction.options.getString('islem', true);
  const targetChannel = interaction.options.getChannel('hedef-kanal') || interaction.channel;

  const everyoneRole = interaction.guild.roles.everyone;
  const onayRoleId = client.config?.onayRoleId;
  const onayRole = onayRoleId ? interaction.guild.roles.cache.get(onayRoleId) : null;

  try {
    if (islem === 'kilitle') {
      // Kilitle: SendMessages yetkisini kapat
      await targetChannel.permissionOverwrites.edit(everyoneRole, { SendMessages: false });
      if (onayRole) {
        await targetChannel.permissionOverwrites.edit(onayRole, { SendMessages: false });
      }

      // Bilgilendirme mesajı gönder (kanala duyuru)
      await targetChannel.send({ content: '🔒 **Bu kanal yetkililer tarafından geçici olarak kilitlenmiştir.**' }).catch(() => null);

      return interaction.editReply({ content: `✅ ${targetChannel} başarıyla kilitlendi.` });
    } else {
      // Aç: SendMessages yetkisini sıfırla (varsayılana çek)
      await targetChannel.permissionOverwrites.edit(everyoneRole, { SendMessages: null });
      if (onayRole) {
        await targetChannel.permissionOverwrites.edit(onayRole, { SendMessages: null });
      }

      // Bilgilendirme mesajı gönder (kanala duyuru)
      await targetChannel.send({ content: '🔓 **Bu kanalın kilidi yetkililer tarafından açılmıştır.**' }).catch(() => null);

      return interaction.editReply({ content: `✅ ${targetChannel} kilidi başarıyla açıldı.` });
    }
  } catch (err) {
    console.error('Kanal kilitleme/açma hatası:', err);
    return interaction.editReply({ content: '❌ Kanal izinleri güncellenirken bir hata oluştu.' });
  }
}

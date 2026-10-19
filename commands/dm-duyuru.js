import {
  SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder, MessageFlags,
  ContainerBuilder, SectionBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize,
  ButtonBuilder, ButtonStyle, Collection
} from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('dm-duyuru')
  .setDescription('Seçilen roldeki tüm üyelere DM ile mesaj gönderir.')
  .addRoleOption(o => o.setName('rol').setDescription('Mesaj gönderilecek rol').setRequired(true))
  .addStringOption(o => o.setName('mesaj').setDescription('Gönderilecek mesaj').setRequired(true));

function getFormattedDate() {
  const options = {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  };
  const formatter = new Intl.DateTimeFormat('tr-TR', options);
  const parts = formatter.formatToParts(new Date());
  const partMap = {};
  for (const part of parts) {
    partMap[part.type] = part.value;
  }
  return `${partMap.day}.${partMap.month}.${partMap.year} ${partMap.hour}:${partMap.minute}:${partMap.second}`;
}

export async function execute(interaction, client) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator))
    return interaction.reply({ content: '❌ Yönetici yetkisi gerekiyor.', flags: MessageFlags.Ephemeral });

  const role = interaction.options.getRole('rol');
  const message = interaction.options.getString('mesaj');

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // Sunucu davet bağlantısını belirle
  let serverInviteUrl = null;
  try {
    const vanity = await interaction.guild.fetchVanityData().catch(() => null);
    if (vanity?.code) {
      serverInviteUrl = `https://discord.gg/${vanity.code}`;
    } else {
      const existingInvites = await interaction.guild.invites.fetch().catch(() => null);
      if (existingInvites && existingInvites.size > 0) {
        serverInviteUrl = existingInvites.first().url;
      } else {
        const targetChannel = interaction.guild.rulesChannel ||
          interaction.guild.publicUpdatesChannel ||
          interaction.guild.channels.cache.find(c => c.isTextBased() && c.permissionsFor(interaction.guild.members.me)?.has('CreateInstantInvite'));
        if (targetChannel) {
          const createdInvite = await targetChannel.createInvite({ maxAge: 0, reason: 'DM Duyuru Butonu' }).catch(() => null);
          if (createdInvite?.url) serverInviteUrl = createdInvite.url;
        }
      }
    }
  } catch (err) {
    console.error('Duyuru davet linki alınamadı:', err);
  }

  // Eğer davet linki hiçbir şekilde oluşturulamazsa sunucu direkt linki fallback
  if (!serverInviteUrl) {
    serverInviteUrl = `https://discord.com/channels/${interaction.guild.id}`;
  }

  const dmContainer = new ContainerBuilder();
  // Renk yok (setAccentColor çağrılmadı)
  // Emojiler yok, sade ve şık tipografi
  const ekipIsmi = client.config?.ekipIsmi || interaction.guild.name;
  const headerSection = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${ekipIsmi}\nEkip Duyurusu`)
    )
    .setButtonAccessory(
      new ButtonBuilder()
        .setLabel('Sunucuya Git')
        .setStyle(ButtonStyle.Link)
        .setURL(serverInviteUrl)
    );

  dmContainer
    .addSectionComponents(headerSection)
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(message))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Gönderen: ${interaction.user.tag}`));

  const sentMembers = [];
  const failedMembers = [];

  try {
    // Discord Gateway rate-limit (opcode 8) hatasını önlemek için doğrudan yerel önbellekteki (cache) üyeleri kullanıyoruz.
    // Bot başlangıçta (index.js) tüm üyeleri zaten önbelleğe aldığı için bu liste günceldir.
    const roleMembers = interaction.guild.members.cache.filter(m => Map.prototype.has.call(m.roles.cache, role.id) && !m.user.bot);

    const roleMembersArray = Array.from(roleMembers.values());
    const chunkSize = 5;
    for (let i = 0; i < roleMembersArray.length; i += chunkSize) {
      const chunk = roleMembersArray.slice(i, i + chunkSize);
      await Promise.all(chunk.map(async (member) => {
        try {
          await member.send({ components: [dmContainer], flags: MessageFlags.IsComponentsV2 });
          sentMembers.push(member.id);
        } catch {
          failedMembers.push(member.id);
        }
      }));
    }

    const successCount = sentMembers.length;
    const failCount = failedMembers.length;

    const successContainer = new ContainerBuilder()
      .setAccentColor(0x57F287)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## <a:duyuruvar:1507733857917735022> DM Duyurusu Tamamlandı`))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `> <a:tik:1507733693903540265> **Başarılı:** \`${successCount}\` üye\n` +
        `> ❌ **Başarısız (DM kapalı):** \`${failCount}\` üye`
      ))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));

    await interaction.editReply({ components: [successContainer], flags: MessageFlags.IsComponentsV2 });

    // dm-duyuru-log kanalına log at
    const dmDuyuruLogChannelId = client.config.dmDuyuruLogChannelId;
    if (dmDuyuruLogChannelId && client.config?.dmDuyuruLogChannelIdEnabled !== false) {
      const logChannel = interaction.guild.channels.cache.get(dmDuyuruLogChannelId);
      if (logChannel?.isTextBased()) {
        const dateStr = getFormattedDate();
        let logDescription = `**Komutu Kullanan:** ${interaction.user}\n` +
          `**Saat:** \`${dateStr}\`\n` +
          `**Hedef Rol:** \`${role.name}\`\n` +
          `**Toplam Kişi:** \`${roleMembers.size}\`\n\n` +
          `──────────────────────────────────\n\n` +
          `**Gönderildi (${successCount}):**\n${sentMembers.map(id => `<@${id}>`).join(', ') || 'Yok'}\n\n` +
          `**Gönderilemedi (${failCount}):**\n${failedMembers.map(id => `<@${id}>`).join(', ') || 'Yok'}`;

        if (logDescription.length > 3000) {
          const summaryContainer = new ContainerBuilder()
            .setAccentColor(0x2f3136)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🧾 DM Duyuru Logu`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
              `> **Komutu Kullanan:** ${interaction.user}\n` +
              `> **Saat:** \`${dateStr}\`\n` +
              `> **Hedef Rol:** \`${role.name}\`\n` +
              `> **Toplam Kişi:** \`${roleMembers.size}\`\n` +
              `> **Gönderildi:** \`${successCount}\` kişi\n` +
              `> **Gönderilemedi:** \`${failCount}\` kişi\n\n` +
              `*(Liste karakter sınırını aştığı için dosya olarak eklenmiştir)*`
            ))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Viqole Bot\`s`));

          const rawLogText = `DM Duyuru Logu\n` +
            `Komutu Kullanan: ${interaction.user.tag} (${interaction.user.id})\n` +
            `Saat: ${dateStr}\n` +
            `Hedef Rol: ${role.name} (${role.id})\n` +
            `Toplam Kişi: ${roleMembers.size}\n\n` +
            `Gönderildi (${successCount}):\n${sentMembers.map(id => {
              const m = roleMembers.get(id);
              return m ? `@${m.user.tag} (${id})` : id;
            }).join(', ')}\n\n` +
            `Gönderilemedi (${failCount}):\n${failedMembers.map(id => {
              const m = roleMembers.get(id);
              return m ? `@${m.user.tag} (${id})` : id;
            }).join(', ')}`;

          const buffer = Buffer.from(rawLogText, 'utf-8');
          const attachment = new AttachmentBuilder(buffer, { name: 'dm-duyuru-log.txt' });
          await logChannel.send({ components: [summaryContainer], files: [attachment], flags: MessageFlags.IsComponentsV2 }).catch(err => console.error('DM Duyuru log dosya gönderme hatası:', err));
        } else {
          const logContainer = new ContainerBuilder()
            .setAccentColor(0x2f3136)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🧾 DM Duyuru Logu`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(logDescription))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Viqole Bot\`s`));
          await logChannel.send({ components: [logContainer], flags: MessageFlags.IsComponentsV2 }).catch(err => console.error('DM Duyuru log gönderme hatası:', err));
        }
      }
    }

  } catch (err) {
    console.error('dm-duyuru hatası:', err);
    await interaction.editReply({ content: '<a:unlem:1507734634568483078> DM duyurusu gönderilirken hata oluştu.' });
  }
}

import {
  SlashCommandBuilder,
  AttachmentBuilder,
  MessageFlags,
  PermissionFlagsBits
} from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('tik-kontrol')
  .setDescription('Belirtilen mesajda hangi rol üyelerinin tik attığını, hangilerinin atmadığını gösterir.')
  .addStringOption(o =>
    o.setName('mesajid')
      .setDescription('Tikin bulunduğu mesajın ID\'si')
      .setRequired(true)
  )
  .addRoleOption(o =>
    o.setName('rol')
      .setDescription('Kontrolü yapılacak rol')
      .setRequired(true)
  )
  .addStringOption(o =>
    o.setName('tikemoji')
      .setDescription('Tik olarak kabul edilecek emoji (örn: ✅ veya :white_check_mark:)')
      .setRequired(true)
  );

export async function execute(interaction, client) {
  // Yetki kontrolü - Admin veya onayRoleId
  const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
  const hasOnayRole = client.config.onayRoleId && interaction.member.roles.cache.has(client.config.onayRoleId);
  if (!isAdmin && !hasOnayRole) {
    return interaction.reply({
      content: '<:red:1533059321389121587> Bu komutu kullanmak için Yönetici yetkisine veya Onay rolüne sahip olmanız gerekiyor.',
      flags: MessageFlags.Ephemeral
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const messageId = interaction.options.getString('mesajid').trim();
  const targetRole = interaction.options.getRole('rol');
  const emojiInput = interaction.options.getString('tikemoji').trim();

  // Emoji'yi normalize et: :white_check_mark: → ✅ gibi unicode ise string olarak geliyor
  // Discord.js reaction key için: unicode emoji direkt string, custom emoji <:isim:id> → isim:id
  const emojiKey = normalizeEmoji(emojiInput);

  // Mesajı bul - önce mevcut kanalda, bulunamazsa tüm kanalları tara
  let targetMessage = null;
  try {
    targetMessage = await interaction.channel.messages.fetch(messageId).catch(() => null);
    if (!targetMessage) {
      // Diğer metin kanallarını tara
      const textChannels = interaction.guild.channels.cache.filter(c => c.isTextBased() && c.id !== interaction.channel.id);
      for (const [, ch] of textChannels) {
        try {
          targetMessage = await ch.messages.fetch(messageId).catch(() => null);
          if (targetMessage) break;
        } catch { /* devam et */ }
      }
    }
  } catch (err) {
    console.error('[tik-kontrol] Mesaj fetch hatası:', err);
  }

  if (!targetMessage) {
    return interaction.editReply({
      content: `❌ \`${messageId}\` ID'li mesaj bulunamadı. Botun o kanala erişimi olduğundan emin olun.`
    });
  }

  // O emojiye ait reaction objesini bul
  const reaction = targetMessage.reactions.cache.find(r => {
    const rKey = r.emoji.id ? `${r.emoji.name}:${r.emoji.id}` : r.emoji.name;
    return rKey === emojiKey || r.emoji.name === emojiKey || r.emoji.toString() === emojiInput;
  });

  // Reaction'ı fetchle (kullanıcı listesi için)
  let reactedUsers = new Set();
  if (reaction) {
    try {
      // Tüm kullanıcıları çek (100'den fazla olabilir, loop ile)
      let lastId = null;
      while (true) {
        const options = { limit: 100 };
        if (lastId) options.after = lastId;
        const fetched = await reaction.users.fetch(options).catch(() => null);
        if (!fetched || fetched.size === 0) break;
        for (const [userId] of fetched) reactedUsers.add(userId);
        if (fetched.size < 100) break;
        lastId = fetched.last()?.id;
      }
    } catch (err) {
      console.error('[tik-kontrol] Reaction users fetch hatası:', err);
    }
  }

  // Sunucudaki tüm üyeleri güncelle
  await interaction.guild.members.fetch().catch(() => null);

  // Role sahip üyeleri al
  const roleMembers = interaction.guild.members.cache.filter(m =>
    !m.user.bot && Map.prototype.has.call(m.roles.cache, targetRole.id)
  );

  if (roleMembers.size === 0) {
    return interaction.editReply({
      content: `❌ **${targetRole.name}** rolüne sahip hiç üye bulunamadı.`
    });
  }

  const tikleyenler = [];
  const tiklemeyenler = [];

  for (const [, member] of roleMembers) {
    if (reactedUsers.has(member.id)) {
      tikleyenler.push(`${member.displayName} (${member.user.tag}) [${member.id}]`);
    } else {
      tiklemeyenler.push(`${member.displayName} (${member.user.tag}) [${member.id}]`);
    }
  }

  // Dosyaları oluştur
  const tikleyenlerContent = tikleyenler.length > 0
    ? tikleyenler.join('\n')
    : '(Kimse tik atmadı)';

  const tiklemeyenlerContent = tiklemeyenler.length > 0
    ? tiklemeyenler.join('\n')
    : '(Herkes tik attı)';

  const tikleyenlerBuf = Buffer.from(tikleyenlerContent, 'utf8');
  const tiklemeyenlerBuf = Buffer.from(tiklemeyenlerContent, 'utf8');

  const tikleyenlerFile = new AttachmentBuilder(tikleyenlerBuf, { name: 'tikleyenler.txt' });
  const tiklemeyenlerFile = new AttachmentBuilder(tiklemeyenlerBuf, { name: 'tiklemeyenler.txt' });

  // Mesaj linki ve emoji gösterimi artık kullanılmıyor

  const ozet =
    `## 🔍 Tik Kontrol Sonucu\n` +
    `> <:Gang:1521498839024931000> **Toplam Rol Üyesi:** \`${roleMembers.size}\`\n` +
    `> <:onay:1533056299355340871> **Tik Atan:** \`${tikleyenler.length}\`\n` +
    `> <:red:1533059321389121587> **Tik Atmayan:** \`${tiklemeyenler.length}\`\n\n` +
    `-# Tik atan ve atmayan üyelerin listesi aşağıdaki dosyalarda.`;

  // Yanıtı hedef mesajın reply'ı olarak gönder (yönergeye göre yanıt olarak)
  try {
    await targetMessage.reply({
      content: ozet,
      files: [tikleyenlerFile, tiklemeyenlerFile],
      allowedMentions: { parse: [] }
    });
  } catch (err) {
    console.error('[tik-kontrol] Reply gönderme hatası:', err);
    // Gönderim başarısız olursa interaction kanalına at
    await interaction.channel.send({
      content: ozet,
      files: [tikleyenlerFile, tiklemeyenlerFile],
      allowedMentions: { parse: [] }
    }).catch(() => null);
  }

  await interaction.editReply({ content: '✅ Tik kontrol tamamlandı, sonuçlar ilgili mesaja yanıt olarak gönderildi.' });
}

/**
 * Kullanıcının girdiği emoji string'ini Discord reaction key formatına normalize eder.
 * Örnekler:
 *   "✅"               → "✅"
 *   ":white_check_mark:" → "✅"  (unicode adı ile eşleşme Discord API'de sağlanır)
 *   "<:tikk:12345>"    → "tikk:12345"
 *   ":tikk:"           → "tikk"
 */
function normalizeEmoji(input) {
  // Custom emoji: <:isim:id> veya <a:isim:id>
  const customMatch = input.match(/^<a?:(\w+):(\d+)>$/);
  if (customMatch) return `${customMatch[1]}:${customMatch[2]}`;

  // :isim: formatı (custom emoji adı veya unicode ismi)
  const namedMatch = input.match(/^:(\w+):$/);
  if (namedMatch) return namedMatch[1];

  // Direkt unicode emoji veya başka bir şey
  return input;
}

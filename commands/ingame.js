import {
  SlashCommandBuilder,
  AttachmentBuilder,
  PermissionFlagsBits,
  MessageFlags
} from 'discord.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadEvents, saveEvents } from '../db.js';
import { buildEventContainer, parseEventDuration } from '../utils/eventHelper.js';
import { generateEventCard } from '../utils/canvasHelper.js';
import { getLogoPath } from '../utils/logoHelper.js';
import { E } from '../utils/emojis.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const data = new SlashCommandBuilder()
  .setName('ingame')
  .setDescription('Bir InGame etkinliği duyurusu oluşturur.')
  .addStringOption(o =>
    o.setName('ingame_isim')
      .setDescription('InGame etkinliğinin adı (örn: Banka Soygunu, Toplantı, Devriye)')
      .setRequired(true)
  )
  .addStringOption(o =>
    o.setName('sure')
      .setDescription('Katılım süresi (örn: 22:00 veya 1 saat, 30 dk)')
      .setRequired(true)
  )
  .addIntegerOption(o =>
    o.setName('kisi_sayisi')
      .setDescription('Maksimum katılımcı sayısı')
      .setRequired(true)
  );

export async function execute(interaction, client) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: '❌ Bu komutu kullanmak için **Yönetici** yetkisine sahip olmalısınız.', flags: MessageFlags.Ephemeral });
  }

  const channel = interaction.channel;
  const ingameIsim = interaction.options.getString('ingame_isim', true);
  const sure = interaction.options.getString('sure', true);
  const limit = interaction.options.getInteger('kisi_sayisi', true);

  if (!channel.isTextBased()) {
    return interaction.reply({ content: '❌ Lütfen bu komutu bir metin kanalında kullanınız.', flags: MessageFlags.Ephemeral });
  }

  if (limit <= 0) {
    return interaction.reply({ content: '❌ Katılımcı sayısı 0\'dan büyük olmalıdır.', flags: MessageFlags.Ephemeral });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const ekipIsmi = client.config?.ekipIsmi || interaction.guild.name;
  const eventCardBuffer = await generateEventCard({
    ekipIsmi,
    eventType: ingameIsim
  }).catch(err => {
    console.error('[INGAME CANVAS] Failed to generate event card:', err);
    return null;
  });

  const files = [];
  if (eventCardBuffer) {
    files.push(new AttachmentBuilder(eventCardBuffer, { name: 'logo.png' }));
  } else {
    const logoPath = getLogoPath(client);
    files.push(new AttachmentBuilder(logoPath, { name: 'logo.png' }));
  }

  const expiresAt = parseEventDuration(sure);
  const { container, row } = buildEventContainer(ingameIsim, limit, [], false, sure);

  try {
    const message = await channel.send({
      components: [container, row],
      files,
      flags: MessageFlags.IsComponentsV2
    });

    let mgmtMessageId = null;

    // aktif-işlemler kanalına yönetim mesajı gönder
    const aktifIslemlerChannelId = client.config?.aktifIslemlerChannelId;
    if (aktifIslemlerChannelId) {
      const mgmtChannel = interaction.guild.channels.cache.get(aktifIslemlerChannelId)
        || await interaction.guild.channels.fetch(aktifIslemlerChannelId).catch(() => null);
      if (mgmtChannel?.isTextBased()) {
        const {
          ContainerBuilder: CB,
          TextDisplayBuilder: TDB,
          SeparatorBuilder: SB,
          SeparatorSpacingSize: SSS,
          ActionRowBuilder: ARB,
          ButtonBuilder: BB,
          ButtonStyle: BS,
          MessageFlags: MF
        } = await import('discord.js');

        const mgmtRow = new ARB().addComponents(
          new BB().setCustomId(`aktif_etkinlik_duzenle_${message.id}`).setLabel('Düzenle').setStyle(BS.Primary).setEmoji('1506242550233829427'),
          new BB().setCustomId(`aktif_etkinlik_sonlandir_${message.id}`).setLabel('Sonlandır').setStyle(BS.Danger).setEmoji('1507748207617114264'),
          new BB().setCustomId(`aktif_etkinlik_cikar_${message.id}`).setLabel('Katılan Çıkart').setStyle(BS.Secondary).setEmoji('1507732515585265825')
        );

        const mgmtContainer = new CB()
          .setAccentColor(0xFEE75C)
          .addTextDisplayComponents(new TDB().setContent(`## ${E.ayarlar} InGame Etkinlik Yönetimi`))
          .addSeparatorComponents(new SB().setDivider(true).setSpacing(SSS.Small))
          .addTextDisplayComponents(new TDB().setContent(
            `> ${E.liste} **Etkinlik:** ${ingameIsim}\n` +
            `> ${E.uye} **Kontenjan:** ${limit} kişi\n` +
            `> ${E.tarih} **Süre:** ${sure}\n` +
            `> ${E.kanal} **Kanal:** ${channel}\n` +
            `> ${E.baglanti} **Mesaj:** [Mesaja Git](https://discord.com/channels/${interaction.guild.id}/${channel.id}/${message.id})\n` +
            `> ${E.yetkili} **Başlatan:** ${interaction.user}`
          ))
          .addSeparatorComponents(new SB().setDivider(true).setSpacing(SSS.Small))
          .addActionRowComponents(mgmtRow)
          .addSeparatorComponents(new SB().setDivider(true).setSpacing(SSS.Small))
          .addTextDisplayComponents(new TDB().setContent('-# Viqole Bot`s'));


        const mgmtMsg = await mgmtChannel.send({ components: [mgmtContainer], flags: MF.IsComponentsV2 }).catch(err => console.error('Aktif-işlemler ingame mesajı hatası:', err));
        if (mgmtMsg) mgmtMessageId = mgmtMsg.id;
      }
    }

    const events = loadEvents();
    events.push({
      messageId: message.id,
      mgmtMessageId,
      channelId: channel.id,
      guildId: interaction.guild.id,
      eventType: ingameIsim,
      limit,
      sure,
      participants: [],
      finished: false,
      expiresAt
    });
    saveEvents(events);

    await interaction.editReply({ content: `✅ **${ingameIsim}** etkinliği bu kanalda başarıyla paylaşıldı.` });
  } catch (error) {
    console.error('InGame etkinlik oluşturma hatası:', error);
    await interaction.editReply({ content: '❌ InGame etkinliği oluşturulurken hata oluştu.' });
  }
}

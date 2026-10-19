import {
  SlashCommandBuilder, ChannelType, PermissionFlagsBits, MessageFlags,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder,
  TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize
} from 'discord.js';
import { getPanelSizBanAfGuild, setPanelSizBanAfGuild } from '../db.js';

export const data = new SlashCommandBuilder()
  .setName('panelsizbanaf-sistemi')
  .setDescription('Panelsiz ban affı sistemini açar veya kapatır.')
  .addChannelOption(o =>
    o.setName('yazma_kanali')
      .setDescription('Üyelerin ban sebebini yazacağı kanal')
      .setRequired(false)
      .addChannelTypes(ChannelType.GuildText)
  )
  .addChannelOption(o =>
    o.setName('ban_listesi_kanali')
      .setDescription('Ban listesinin tutulacağı kanal')
      .setRequired(false)
      .addChannelTypes(ChannelType.GuildText)
  )
  .addStringOption(o =>
    o.setName('mesaj_id')
      .setDescription('Ban listesi kanalındaki mevcut liste mesajının ID\'si (isteğe bağlı)')
      .setRequired(false)
  );

export async function execute(interaction, client) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.editReply({ content: '❌ Bu komutu kullanmak için **Yönetici** yetkisine sahip olmalısınız.' });
  }

  const guildId = interaction.guild.id;
  const mevcutDurum = getPanelSizBanAfGuild(guildId);

  // Sistem zaten aktifse → kapat
  if (mevcutDurum?.active) {
    setPanelSizBanAfGuild(guildId, { active: false });
    return interaction.editReply({ content: '🔴 **Panelsiz Ban Affı Sistemi kapatıldı.**' });
  }

  // Sistem kapalıysa → kanalları al ve aç
  const yazmaKanali = interaction.options.getChannel('yazma_kanali');
  const banListesiKanali = interaction.options.getChannel('ban_listesi_kanali');
  const mesajId = interaction.options.getString('mesaj_id')?.trim();

  if (!yazmaKanali || !banListesiKanali) {
    return interaction.editReply({
      content: '❌ Sistemi **açmak** için `yazma_kanali` ve `ban_listesi_kanali` parametrelerini belirtmelisiniz.\n\nSistemi **kapatmak** için komutu parametresiz kullanın.'
    });
  }

  const newCfg = {
    active: true,
    yazmaKanalId: yazmaKanali.id,
    banListeKanalId: banListesiKanali.id,
    banAfListeMesajId: null,
    yonetimMesajlari: {},
    entries: []
  };
  setPanelSizBanAfGuild(guildId, newCfg);

  let importMsg = '';

  // ── Mesaj ID girilmişse o mesajı liste olarak al ──
  if (mesajId) {
    if (!/^\d{17,20}$/.test(mesajId)) {
      return interaction.editReply({ content: '❌ Geçersiz Mesaj ID formatı. 17-20 haneli sayısal bir ID giriniz.' });
    }

    try {
      const targetMsg = await banListesiKanali.messages.fetch(mesajId).catch(() => null);

      if (!targetMsg) {
        return interaction.editReply({
          content: `❌ \`${mesajId}\` ID'li mesaj **${banListesiKanali}** kanalında bulunamadı.\n\nMesajın doğru kanalda olduğundan emin olun.`
        });
      }

      if (targetMsg.author.id !== client.user.id) {
        return interaction.editReply({
          content: `❌ Bu mesaj bota ait değil. Sadece **botun gönderdiği** liste mesajlarını seçebilirsiniz.`
        });
      }

      // Mesajı parse et
      const idExtractPattern = /(\d{17,20})/;
      const idLinePattern = /\d{17,20}/; // Parantez zorunluluğunu kaldırdık
      const lines = targetMsg.content.split('\n').filter(l => l.trim() && idLinePattern.test(l));

      if (lines.length === 0) {
        return interaction.editReply({
          content: `❌ Seçilen mesajda Discord ID içeren satır bulunamadı.\n\nMesaj formatı şu şekilde olmalıdır:\n\`\`\`\n@Kullanıcı (123456789012345678) sebep\n\`\`\``
        });
      }

      const importedEntries = [];
      for (const line of lines) {
        const idMatch = line.match(idExtractPattern);
        if (!idMatch) continue;
        const userId = idMatch[1];
        const afterId = line.substring(line.indexOf(userId) + userId.length);
        const reason = afterId.replace(/^[)\s`]+/, '').trim() || 'Belirtilmedi';
        if (!importedEntries.some(e => e.userId === userId)) {
          importedEntries.push({ userId, reason });
        }
      }

      if (importedEntries.length === 0) {
        return interaction.editReply({ content: '❌ Mesajdan geçerli kayıt parse edilemedi.' });
      }

      newCfg.entries = importedEntries;
      newCfg.banAfListeMesajId = targetMsg.id;
      newCfg.yonetimMesajlari = {};

      // Liste mesajını formatla ve Çıkart butonu ekle
      const listLines = newCfg.entries.map((e, i) => `${i + 1}. <@${e.userId}> (\`${e.userId}\`) ${e.reason}`);
      const cikarButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('panelsiz_banaf_cikar').setLabel('Çıkart').setStyle(ButtonStyle.Danger).setEmoji('❌')
      );
      await targetMsg.edit({ content: listLines.join('\n'), components: [cikarButton] }).catch(() => null);

      // Yönetim kanalına kişi başına embed gönder
      const mgmtChannelId = client.config?.banAffiManagementChannelId;
      const mgmtChannel = mgmtChannelId
        ? (interaction.guild.channels.cache.get(mgmtChannelId) || await interaction.guild.channels.fetch(mgmtChannelId).catch(() => null))
        : null;

      if (mgmtChannel?.isTextBased()) {
        for (const entry of newCfg.entries) {
          const buttonRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`panelsiz_banaf_acildi_${entry.userId}`).setLabel('Açıldı').setStyle(ButtonStyle.Success).setEmoji('✅'),
            new ButtonBuilder().setCustomId(`panelsiz_banaf_sil_${entry.userId}`).setLabel('Sil').setStyle(ButtonStyle.Danger).setEmoji('🗑️')
          );
          const mgmtContainer = new ContainerBuilder()
            .setAccentColor(0x3498db)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 📬 Ban Affı Talebi (Import)`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
              `> <:ye:1507732515585265825> **Kullanıcı:** <@${entry.userId}> (\`${entry.userId}\`)\n` +
              `> 📝 **Sebep:** ${entry.reason}\n\n` +
              `\`\`\`\n${entry.userId} - ${entry.reason}\n\`\`\``
            ))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addActionRowComponents(buttonRow)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));
          const mgmtMsg = await mgmtChannel.send({ components: [mgmtContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
          if (mgmtMsg) {
            newCfg.yonetimMesajlari[entry.userId] = mgmtMsg.id;
          }
        }
      }

      setPanelSizBanAfGuild(guildId, newCfg);
      importMsg = `\n\n> 📥 **${importedEntries.length} kişi** liste mesajından kaydedildi ve yönetim kanalına gönderildi.`;

    } catch (err) {
      console.error('[PANELSIZ BAN AF] Mesaj ID import hatası:', err);
      importMsg = '\n\n> ⚠️ Liste mesajı import edilirken bir hata oluştu.';
    }
  }

  return interaction.editReply({
    content:
      `✅ **Panelsiz Ban Affı Sistemi açıldı!**\n\n` +
      `> 📝 **Yazma Kanalı:** ${yazmaKanali}\n` +
      `> 📋 **Ban Listesi Kanalı:** ${banListesiKanali}\n\n` +
      `Üyeler ${yazmaKanali} kanalına yazdıklarında, mesajları ${banListesiKanali} kanalındaki listeye otomatik eklenecektir.\n` +
      `Sistemi **kapatmak** için bu komutu tekrar (parametresiz) kullanın.` +
      importMsg
  });
}

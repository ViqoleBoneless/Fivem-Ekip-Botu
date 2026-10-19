import {
  SlashCommandBuilder, PermissionFlagsBits, MessageFlags,
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize,
  Routes
} from 'discord.js';
import fs from 'fs';
import { buildTicketPanel } from './ticket-panel.js';

export const data = new SlashCommandBuilder()
  .setName('basvuru-durum')
  .setDescription('Başvuru (Ticket) sisteminin durumunu açar veya kapatır.')
  .addStringOption(o => o.setName('durum')
    .setDescription('Başvuru durumu')
    .setRequired(true)
    .addChoices(
      { name: 'Açık', value: 'acik' },
      { name: 'Kapalı', value: 'kapali' }
    )
  );

export async function execute(interaction, client) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: '❌ Bu komutu kullanabilmek için **Yönetici** yetkisine sahip olmalısınız.', flags: MessageFlags.Ephemeral });
  }

  const durum = interaction.options.getString('durum');

  try {
    const cp = client.configPath;
    let currentConfig = {};
    if (fs.existsSync(cp)) {
      currentConfig = JSON.parse(fs.readFileSync(cp, 'utf8'));
    }

    currentConfig.basvuruDurumu = durum;
    fs.writeFileSync(cp, JSON.stringify(currentConfig, null, 2), 'utf8');
    client.config = currentConfig;

    const statusText = durum === 'acik' ? '🟢 AÇIK' : '🔴 KAPALI';
    
    // Update the message in the ticket channel if it exists
    const ticketChannelId = currentConfig.ticketChannelId;
    let messageUpdateStatus = '';

    if (ticketChannelId) {
      const channel = interaction.guild.channels.cache.get(ticketChannelId) 
        || await interaction.guild.channels.fetch(ticketChannelId).catch(() => null);
      if (channel && channel.isTextBased()) {
        let msg = null;
        let messageId = currentConfig.ticketPanelMessageId;
        if (messageId) {
          msg = await channel.messages.fetch(messageId).catch(() => null);
        }

        // If not found by ID, scan the channel for a message sent by the bot containing components
        if (!msg) {
          const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
          if (messages) {
            msg = messages.find(m => 
              m.author.id === client.user.id && 
              m.components && m.components.length > 0 &&
              (m.components[0].components[0].customId === 'ticket_category' || m.components[0].components[0].customId?.startsWith('ticket_category_btn_'))
            );
            if (msg) {
              // Save the found message ID
              currentConfig.ticketPanelMessageId = msg.id;
              fs.writeFileSync(cp, JSON.stringify(currentConfig, null, 2), 'utf8');
              client.config = currentConfig;
            }
          }
        }

        if (msg) {
          const container = buildTicketPanel(client);
          await client.rest.patch(
            Routes.channelMessage(channel.id, msg.id),
            {
              body: {
                components: [container.toJSON()],
                flags: MessageFlags.IsComponentsV2
              }
            }
          );
          messageUpdateStatus = '\n💬 **Bilgi:** Ticket kanalındaki başvuru paneli otomatik güncellendi.';
        } else {
          messageUpdateStatus = '\n⚠️ **Uyarı:** Ticket kanalında başvuru paneli bulunamadı. Yeni bir panel göndermek için `/ticket-panel` komutunu kullanabilirsiniz.';
        }
      }
    } else {
      messageUpdateStatus = '\nℹ️ **Bilgi:** Config\'de `ticketChannelId` tanımlı değil. Başvuru paneli güncellenemedi.';
    }

    const container = new ContainerBuilder()
      .setAccentColor(durum === 'acik' ? 0x57F287 : 0xED4245)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 📝 Başvuru Durumu Güncellendi`))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `> **Yeni Durum:** ${statusText}\n` +
        `> **Açıklama:** Ticket panelinde başvurular ${durum === 'acik' ? 'artık yapılabilir' : 'artık yapılamaz (KAPALI ibaresi görünecek)'}.\n` +
        `> **Güncelleyen:** ${interaction.user}${messageUpdateStatus}`
      ))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));

    return interaction.reply({ components: [container], flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
  } catch (err) {
    console.error('Error changing basvuru-durum:', err);
    return interaction.reply({ content: '❌ Başvuru durumu güncellenirken hata oluştu.', flags: MessageFlags.Ephemeral });
  }
}

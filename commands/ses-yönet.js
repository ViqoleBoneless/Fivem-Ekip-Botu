import { hasPermission } from '../utils/permissions.js';
import {
  SlashCommandBuilder, ChannelType, MessageFlags,
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize,
  ActionRowBuilder, ButtonBuilder, ButtonStyle
} from 'discord.js';
import { loadEvents } from '../db.js';

export const data = new SlashCommandBuilder()
  .setName('ses-yönet')
  .setDescription('Ses kanalı yönetim paneli (Toplama, Susturma/Mute, Taşıma).')
  .addStringOption(opt =>
    opt.setName('islem')
      .setDescription('Yapılacak ses yönetim işlemi (seçilmezse yönetim paneli açılır)')
      .setRequired(false)
      .addChoices(
        { name: 'Mute / Unmute (Sustur veya Aç)', value: 'mute' },
        { name: 'Herkesi Topla (Bulunduğum Kanala)', value: 'topla_herkes' },
        { name: 'Son Etkinliktekileri Topla', value: 'topla_ingame' },
        { name: 'Kanalı Taşı', value: 'tasi' }
      )
  )
  .addChannelOption(opt =>
    opt.setName('kanal')
      .setDescription('İşlem yapılacak ses kanalı / Taşınacak kaynak kanal')
      .setRequired(false)
      .addChannelTypes(ChannelType.GuildVoice)
  )
  .addChannelOption(opt =>
    opt.setName('hedef_kanal')
      .setDescription('Taşıma işlemi için hedef ses kanalı')
      .setRequired(false)
      .addChannelTypes(ChannelType.GuildVoice)
  )
  .addUserOption(opt =>
    opt.setName('muaf')
      .setDescription('Mute işleminde muaf tutulacak kişi')
      .setRequired(false)
  );

export function buildSesYonetPanel(interaction) {
  const userVoice = interaction.member?.voice?.channel;
  const voiceText = userVoice ? `${userVoice} (\`#${userVoice.name}\`)` : '*Bir ses kanalında değilsiniz*';

  const container = new ContainerBuilder()
    .setAccentColor(0x5865F2)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🔊 Ses Yönetim Paneli`))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `> <:hash:1507734074805063731> **Bulunduğunuz Kanal:** ${voiceText}\n` +
      `> <:mod:1507746579078053999> **Yetkili:** ${interaction.user}\n\n` +
      `Aşağıdaki butonları kullanarak bulunduğunuz ses kanalını anında yönetebilirsiniz:`
    ))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('sesyonet_btn_mute')
      .setLabel('Kanalı Mutele / Aç')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🔇'),
    new ButtonBuilder()
      .setCustomId('sesyonet_btn_topla_herkes')
      .setLabel('Herkesi Topla')
      .setStyle(ButtonStyle.Success)
      .setEmoji('👥'),
    new ButtonBuilder()
      .setCustomId('sesyonet_btn_topla_ingame')
      .setLabel('Etkinliktekileri Topla')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🎮')
  );

  container
    .addActionRowComponents(row1)
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));

  return container;
}

export async function handleSesMuteAction(interaction, client, targetVoiceChannel = null, muafUser = null) {
  const voiceChannel = targetVoiceChannel || interaction.member?.voice?.channel;
  if (!voiceChannel) {
    const msg = '❌ Lütfen bir ses kanalı belirtin veya bir ses kanalına katılın.';
    if (interaction.deferred || interaction.replied) return interaction.followUp({ content: msg, flags: MessageFlags.Ephemeral });
    return interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
  }

  const logChannelId = client.config.muteJailLogChannelId || client.config.warningLogChannelId;
  const logChannel = logChannelId ? interaction.guild.channels.cache.get(logChannelId) : null;

  const members = voiceChannel.members;
  const targets = Array.from(members.values()).filter(m =>
    !m.user.bot &&
    m.id !== interaction.user.id &&
    (!muafUser || m.id !== muafUser.id)
  );

  if (targets.length === 0) {
    const msg = `❌ ${voiceChannel} ses kanalında işlem yapılabilecek uygun üye bulunamadı.`;
    if (interaction.deferred || interaction.replied) return interaction.followUp({ content: msg, flags: MessageFlags.Ephemeral });
    return interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
  }

  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }

  const mutedTargets = targets.filter(m => m.voice.serverMute);
  const shouldUnmute = mutedTargets.length > 0;

  let processCount = 0;
  let skipped = [];

  for (const member of targets) {
    try {
      await member.voice.setMute(!shouldUnmute, shouldUnmute ? 'Toplu ses unmute komutu.' : 'Toplu ses mute komutu.');
      processCount++;
    } catch (err) {
      console.error(`${member.user.tag} ses kanalı susturma/açma işleminde hata:`, err);
    }
  }

  if (members.has(interaction.user.id)) {
    skipped.push(`${interaction.member} (Yetkili)`);
  }
  if (muafUser && members.has(muafUser.id)) {
    const muafMember = members.get(muafUser.id);
    skipped.push(`${muafMember} (Muaf)`);
  }

  const actionText = shouldUnmute ? 'Ses Kanalı Toplu Unmute' : 'Ses Kanalı Toplu Mute';
  const accentColor = shouldUnmute ? 0x57F287 : 0xED4245;
  const emoji = shouldUnmute ? '🔊' : '<:emote_vmute:1507734485058195536>';

  const isLogEnabled = logChannelId === client.config?.muteJailLogChannelId
    ? (client.config?.muteJailLogChannelIdEnabled !== false)
    : (client.config?.warningLogChannelIdEnabled !== false);

  if (isLogEnabled && logChannel?.isTextBased()) {
    const logContainer = new ContainerBuilder()
      .setAccentColor(accentColor)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${emoji} ${actionText}`))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `> <:hash:1507734074805063731> **Ses Kanalı:** ${voiceChannel} (\`#${voiceChannel.name}\`)\n` +
        `> <:mod:1507746579078053999> **Yetkili:** ${interaction.user} (\`${interaction.user.tag}\`)\n` +
        `> <:yldz:1506291961349537873> **İşlem Yapılan Kişi Sayısı:** \`${processCount}\` kişi\n` +
        `> <a:pandayemkyiyom:1507734363046150204> **Muaf/Etkilenmeyenler:** ${skipped.join(', ') || 'Yok'}`
      ))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));

    await logChannel.send({ components: [logContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
  }

  const replyMsg = shouldUnmute
    ? `🔊 ${voiceChannel} ses kanalındaki bütün kullanıcıların susturması başarıyla kaldırıldı.`
    : `<:emote_vmute:1507734485058195536> ${voiceChannel} ses kanalındaki bütün kullanıcılar başarıyla susturuldu.`;

  return interaction.editReply({ content: replyMsg });
}

export async function handleSesToplaAction(interaction, client, selection = 'herkes', targetChannelOverride = null) {
  const targetChannel = targetChannelOverride || interaction.member?.voice?.channel;
  if (!targetChannel) {
    const msg = '❌ Bu komutu kullanabilmek için bir ses kanalında olmalısınız.';
    if (interaction.deferred || interaction.replied) return interaction.followUp({ content: msg, flags: MessageFlags.Ephemeral });
    return interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
  }

  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
  }

  let membersToMove = [];

  if (selection === 'herkes') {
    interaction.guild.channels.cache.forEach(channel => {
      if (channel.type === ChannelType.GuildVoice && channel.id !== targetChannel.id) {
        channel.members.forEach(member => {
          if (!member.user.bot) {
            membersToMove.push(member);
          }
        });
      }
    });
  } else if (selection === 'ingame') {
    const events = loadEvents();
    if (!events || events.length === 0) {
      return interaction.editReply({ content: '❌ Sunucuda kayıtlı bir etkinlik bulunamadı.' });
    }

    const lastEvent = events[events.length - 1];
    const participants = lastEvent.participants || [];
    if (participants.length === 0) {
      return interaction.editReply({ content: '❌ Son etkinliğe katılan hiç kimse bulunmuyor.' });
    }

    for (const userId of participants) {
      const member = interaction.guild.members.cache.get(userId) || await interaction.guild.members.fetch(userId).catch(() => null);
      if (member && member.voice?.channel && member.voice.channel.id !== targetChannel.id) {
        membersToMove.push(member);
      }
    }
  }

  if (membersToMove.length === 0) {
    return interaction.editReply({ content: '❌ Taşınabilecek durumda/ses kanalında olan uygun üye bulunamadı.' });
  }

  let movedCount = 0;
  let errorCount = 0;

  for (const member of membersToMove) {
    try {
      await member.voice.setChannel(targetChannel, 'Toplu ses toplayıcı komutu.');
      movedCount++;
    } catch (err) {
      console.error(`${member.user.tag} ses kanalına taşınırken hata oluştu:`, err);
      errorCount++;
    }
  }

  const groupText = selection === 'herkes' ? 'Bütün Kanallardaki Üyeler' : 'Son Etkinlik Katılımcıları';

  const container = new ContainerBuilder()
    .setAccentColor(0x57F287)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 👥 Toplu Ses Toplama Tamamlandı`))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `> <:hash:1507734074805063731> **Toplanan Grup:** ${groupText}\n` +
      `> <:hash:1507734074805063731> **Hedef Kanal:** ${targetChannel} (\`#${targetChannel.name}\`)\n` +
      `> <:ye:1507732515585265825> **Başarıyla Toplanan:** \`${movedCount}\` üye\n` +
      (errorCount > 0 ? `> ⚠️ **Hata Oluşan:** \`${errorCount}\` üye\n` : '') +
      `> <:mod:1507746579078053999> **Yetkili:** ${interaction.user}`
    ))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bots'));

  return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

export async function handleSesTasiAction(interaction, fromChannel, toChannel) {
  if (!fromChannel || !toChannel) {
    return interaction.reply({ content: '❌ Lütfen kaynak (kanal) ve hedef (hedef_kanal) ses kanallarını belirtin.', flags: MessageFlags.Ephemeral });
  }

  if (fromChannel.id === toChannel.id) {
    return interaction.reply({ content: '❌ Taşınacak ve gidilecek ses kanalları aynı olamaz.', flags: MessageFlags.Ephemeral });
  }

  const members = fromChannel.members;
  if (members.size === 0) {
    return interaction.reply({ content: `❌ ${fromChannel} ses kanalında taşınacak üye bulunmuyor.`, flags: MessageFlags.Ephemeral });
  }

  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }

  let movedCount = 0;
  let errorCount = 0;

  for (const member of members.values()) {
    try {
      await member.voice.setChannel(toChannel, 'Toplu ses taşıma komutu.');
      movedCount++;
    } catch (err) {
      console.error(`${member.user.tag} ses kanalı taşınırken hata oluştu:`, err);
      errorCount++;
    }
  }

  const container = new ContainerBuilder()
    .setAccentColor(0x57F287)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 👥 Toplu Ses Taşıma Tamamlandı`))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `> <:hash:1507734074805063731> **Taşınan Kanal:** ${fromChannel} (\`#${fromChannel.name}\`)\n` +
      `> <:hash:1507734074805063731> **Gidilen Kanal:** ${toChannel} (\`#${toChannel.name}\`)\n` +
      `> <:ye:1507732515585265825> **Başarıyla Taşınan:** \`${movedCount}\` üye\n` +
      (errorCount > 0 ? `> ⚠️ **Hata Oluşan:** \`${errorCount}\` üye\n` : '') +
      `> <:mod:1507746579078053999> **Yetkili:** ${interaction.user}`
    ))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bots'));

  return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

export async function execute(interaction, client) {
  if (!hasPermission(interaction.member, 'banCommand', client)) {
    return interaction.reply({
      content: '❌ Bu komutu kullanabilmek için **Ban Sorumlusu** veya **Yönetici** yetkilerine sahip olmalısınız.',
      flags: MessageFlags.Ephemeral
    });
  }

  const islem = interaction.options.getString('islem');
  const kanal = interaction.options.getChannel('kanal');
  const hedefKanal = interaction.options.getChannel('hedef_kanal');
  const muaf = interaction.options.getUser('muaf');

  // 1. MUTE / UNMUTE
  if (islem === 'mute') {
    return handleSesMuteAction(interaction, client, kanal, muaf);
  }

  // 2. HERKESİ TOPLA
  if (islem === 'topla_herkes') {
    return handleSesToplaAction(interaction, client, 'herkes', kanal);
  }

  // 3. ETKİNLİKTEKİLERİ TOPLA
  if (islem === 'topla_ingame') {
    return handleSesToplaAction(interaction, client, 'ingame', kanal);
  }

  // 4. KANAL TAŞI
  if (islem === 'tasi') {
    return handleSesTasiAction(interaction, kanal, hedefKanal);
  }

  // 5. YÖNETİM PANELİ (Varsayılan)
  const container = buildSesYonetPanel(interaction);
  return interaction.reply({
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
  });
}

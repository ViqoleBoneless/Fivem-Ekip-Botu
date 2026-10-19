import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ActionRowBuilder,
  RoleSelectMenuBuilder
} from 'discord.js';
import { db } from '../db.js';

export const data = new SlashCommandBuilder()
  .setName('topluperm-çek')
  .setDescription('Belirli kriterlere göre toplu yetki/perm geri çekme işlemi yapar.')
  .addStringOption(o =>
    o.setName('kriter')
      .setDescription('Permleri çekilecek üyelerin belirleneceği kriter')
      .setRequired(true)
      .addChoices(
        { name: 'Etkinlik İnaktif', value: 'etkinlik' },
        { name: 'Ses İnaktif', value: 'ses' },
        { name: 'Metin İnaktif', value: 'metin' },
        { name: 'Belirli Rol', value: 'rol' },
        { name: 'Dosyadan ID Listesi (.txt / .json)', value: 'dosya' }
      )
  )
  .addStringOption(o =>
    o.setName('muaf')
      .setDescription('İşlemden muaf tutulacak Discord IDler (virgülle ayırın: 123,456,789)')
      .setRequired(false)
  );

function hasAllPerm(interaction, client) {
  const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
  if (isAdmin) return true;

  const allPermUsersStr = client.config?.allPermUsers || '';
  const allPermUsers = allPermUsersStr ? allPermUsersStr.split(',').map(id => id.trim()).filter(Boolean) : [];
  if (allPermUsers.includes(interaction.user.id)) return true;

  const allPermRolesStr = client.config?.allPermRoles || '';
  const allPermRoles = allPermRolesStr ? allPermRolesStr.split(',').map(id => id.trim()).filter(Boolean) : [];
  if (allPermRoles.some(roleId => interaction.member.roles.cache.has(roleId))) return true;

  return false;
}

export async function execute(interaction, client) {
  if (!hasAllPerm(interaction, client)) {
    return interaction.reply({ content: '❌ Bu komutu kullanmak için **Yönetici** veya **All-Perm** yetkisine sahip olmalısınız.', flags: MessageFlags.Ephemeral });
  }

  const kriter = interaction.options.getString('kriter', true);
  const muafRaw = interaction.options.getString('muaf') || '';
  const guild = interaction.guild;

  // Muaf ID'leri parse et (virgülle ayrılmış)
  const muafSet = new Set(
    muafRaw.split(',').map(id => id.trim()).filter(id => /^\d{17,20}$/.test(id))
  );

  // Rol seçimi ve dosya dışındaki inaktiflik kriterleri için onayRoleId gereklidir
  const onayRoleId = client.config?.onayRoleId;
  if (kriter !== 'rol' && kriter !== 'dosya' && !onayRoleId) {
    return interaction.reply({
      content: '❌ Konfigürasyonda ekip üyesi rolü (`onayRoleId`) tanımlanmamış!',
      flags: MessageFlags.Ephemeral
    });
  }

  // 1) Belirli Rol
  if (kriter === 'rol') {
    const row = new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId('topluperm_role_select')
        .setPlaceholder('Yetkileri çekilecek üyelerin bulunduğu rolü seçin...')
    );

    const response = await interaction.reply({
      content: 'Lütfen permleri çekilecek üyelerin bulunduğu rolü seçin:',
      components: [row],
      flags: MessageFlags.Ephemeral,
      fetchReply: true
    });

    const collectorFilter = i => i.user.id === interaction.user.id && i.customId === 'topluperm_role_select';

    try {
      const confirmation = await response.awaitMessageComponent({ filter: collectorFilter, time: 60000 });
      await confirmation.deferUpdate();

      const selectedRoleId = confirmation.values[0];
      const selectedRole = guild.roles.cache.get(selectedRoleId) || await guild.roles.fetch(selectedRoleId).catch(() => null);

      if (!selectedRole) {
        return interaction.editReply({ content: '❌ Seçilen rol bulunamadı.', components: [] });
      }

      await interaction.editReply({ content: `⏳ **${selectedRole.name}** rolündeki üyeler taranıyor ve permleri çekiliyor...`, components: [] });

      if (guild.members.cache.size < 2) await guild.members.fetch().catch(() => null);
      const targetMembers = Array.from(selectedRole.members.values()).filter(m => !m.user.bot && !muafSet.has(m.id));

      if (targetMembers.length === 0) {
        const emptyContainer = new ContainerBuilder()
          .setAccentColor(0xED4245)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent('## ❌ Üye Bulunamadı'))
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(`> **${selectedRole.name}** rolüne sahip hiçbir üye bulunamadı veya tümü muaf tutuldu.`))
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
          .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));

        return interaction.editReply({ content: '', components: [emptyContainer], flags: MessageFlags.IsComponentsV2 });
      }

      const result = await pullRolesFromMembers(guild, targetMembers, client, muafSet);

      const container = buildResultContainer({
        kriterText: `Belirli Rol: **${selectedRole.name}**`,
        bulunan: targetMembers.length,
        muafCount: muafSet.size,
        ...result
      });

      await interaction.editReply({ content: '', components: [container], flags: MessageFlags.IsComponentsV2 });

    } catch (e) {
      await interaction.editReply({ content: '❌ Seçim süresi dolduğu için işlem iptal edildi veya bir hata oluştu.', components: [] });
    }
    return;
  }

  // 2) Dosyadan ID Listesi
  if (kriter === 'dosya') {
    await interaction.reply({
      content: '📎 Lütfen Discord IDlerini içeren bir `.txt` veya `.json` dosyasını bu kanala **yükleyin** (60 saniye içinde). Dosyadan tüm Discord IDleri otomatik olarak algılanacaktır.',
      flags: MessageFlags.Ephemeral
    });

    const msgFilter = m => m.author.id === interaction.user.id && m.attachments.size > 0;

    let collected;
    try {
      collected = await interaction.channel.awaitMessages({ filter: msgFilter, max: 1, time: 60000, errors: ['time'] });
    } catch {
      return interaction.editReply({ content: '❌ Süre doldu. Dosya yüklenmedi, işlem iptal edildi.' });
    }

    const msg = collected.first();
    const attachment = msg.attachments.first();

    if (!attachment.name.endsWith('.txt') && !attachment.name.endsWith('.json')) {
      await msg.delete().catch(() => null);
      return interaction.editReply({ content: '❌ Sadece `.txt` veya `.json` dosyaları kabul edilmektedir.' });
    }

    // Dosyayı indir
    let fileContent;
    try {
      const res = await fetch(attachment.url);
      fileContent = await res.text();
    } catch (err) {
      console.error('[TOPLUPERM-CEK] Dosya indirilirken hata:', err);
      await msg.delete().catch(() => null);
      return interaction.editReply({ content: '❌ Dosya okunurken bir hata oluştu.' });
    }

    // Dosya içindeki tüm Discord IDleri (17-20 haneli sayılar) regex ile çıkar
    const idPattern = /\b(\d{17,20})\b/g;
    const foundIds = [...fileContent.matchAll(idPattern)].map(m => m[1]);
    const uniqueIds = [...new Set(foundIds)].filter(id => !muafSet.has(id));

    // Mesajı sil (gizli işlem)
    await msg.delete().catch(() => null);

    if (uniqueIds.length === 0) {
      return interaction.editReply({ content: '❌ Dosyada geçerli bir Discord ID bulunamadı veya tümü muaf listesinde.' });
    }

    await interaction.editReply({ content: `⏳ Dosyadan **${uniqueIds.length}** Discord ID algılandı. Permleri çekiliyor...` });

    // Üyeleri çek
    if (guild.members.cache.size < 2) await guild.members.fetch().catch(() => null);
    const targetMembers = [];
    const notInServer = [];

    for (const id of uniqueIds) {
      const member = guild.members.cache.get(id);
      if (member && !member.user.bot) {
        targetMembers.push(member);
      } else {
        notInServer.push(id);
      }
    }

    if (targetMembers.length === 0) {
      return interaction.editReply({ content: `❌ Dosyadaki ${uniqueIds.length} ID'nin hiçbiri sunucuda bulunamadı.` });
    }

    const result = await pullRolesFromMembers(guild, targetMembers, client, muafSet);

    const container = buildResultContainer({
      kriterText: `Dosyadan ID Listesi`,
      bulunan: targetMembers.length,
      muafCount: muafSet.size,
      notInServer: notInServer.length,
      ...result
    });

    await interaction.editReply({ content: '', components: [container], flags: MessageFlags.IsComponentsV2 });
    return;
  }

  // 3) İnaktiflik kriterleri (etkinlik / ses / metin)
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const role = guild.roles.cache.get(onayRoleId) || await guild.roles.fetch(onayRoleId).catch(() => null);
  if (!role) {
    return interaction.editReply({
      content: '❌ Konfigürasyondaki ekip üyesi rolü sunucuda bulunamadı!'
    });
  }

  if (guild.members.cache.size < 2) await guild.members.fetch().catch(() => null);
  const teamMembers = Array.from(role.members.values()).filter(m => !m.user.bot && !muafSet.has(m.id));

  const targetMembers = [];
  let kriterText = '';

  if (kriter === 'etkinlik') {
    kriterText = 'Etkinlik İnaktif (Etkinlik Sayısı = 0)';
    for (const m of teamMembers) {
      const row = db.prepare('SELECT SUM(events) as eventCount FROM stats WHERE user_id = ?').get(m.id);
      const count = row ? (row.eventCount || 0) : 0;
      if (count === 0) targetMembers.push(m);
    }
  } else if (kriter === 'ses') {
    kriterText = 'Ses İnaktif (Ses Süresi = 0)';
    for (const m of teamMembers) {
      const row = db.prepare('SELECT SUM(voice) as voiceTime FROM stats WHERE user_id = ?').get(m.id);
      const duration = row ? (row.voiceTime || 0) : 0;
      if (duration === 0) targetMembers.push(m);
    }
  } else if (kriter === 'metin') {
    kriterText = 'Metin İnaktif (Mesaj Sayısı = 0)';
    for (const m of teamMembers) {
      const row = db.prepare('SELECT SUM(messages) as msgCount FROM stats WHERE user_id = ?').get(m.id);
      const count = row ? (row.msgCount || 0) : 0;
      if (count === 0) targetMembers.push(m);
    }
  }

  if (targetMembers.length === 0) {
    const emptyContainer = new ContainerBuilder()
      .setAccentColor(0xED4245)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('## ❌ Üye Bulunamadı'))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`> Belirtilen kriterlere (${kriterText}) uyan hiçbir ekip üyesi bulunamadı.`))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));

    return interaction.editReply({ content: '', components: [emptyContainer], flags: MessageFlags.IsComponentsV2 });
  }

  await interaction.editReply({ content: `⏳ Kriterlere uyan **${targetMembers.length}** üyenin permleri çekiliyor...` });

  const result = await pullRolesFromMembers(guild, targetMembers, client, muafSet);

  const container = buildResultContainer({
    kriterText,
    bulunan: targetMembers.length,
    muafCount: muafSet.size,
    ...result
  });

  await interaction.editReply({ content: '', components: [container], flags: MessageFlags.IsComponentsV2 });
}

function buildResultContainer({ kriterText, bulunan, muafCount, notInServer = 0, successCount, failCount }) {
  let detailText =
    `> <:mod:1507746579078053999> **Kriter:** ${kriterText}\n` +
    `> 👥 **Hedef Üye:** ${bulunan} kişi\n`;

  if (muafCount > 0) detailText += `> 🛡️ **Muaf Tutulan:** ${muafCount} ID\n`;
  if (notInServer > 0) detailText += `> ⚠️ **Sunucuda Bulunamayan:** ${notInServer} ID\n`;

  detailText +=
    `> ✅ **Başarılı:** ${successCount} üye\n` +
    `> ❌ **Başarısız:** ${failCount} üye`;

  return new ContainerBuilder()
    .setAccentColor(0x57F287)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('## ✅ Toplu Perm Çekme Tamamlandı'))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(detailText))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));
}

async function pullRolesFromMembers(guild, targetMembers, client, muafSet = new Set()) {
  let successCount = 0;
  let failCount = 0;

  const botHighestRole = guild.members.me.roles.highest;
  const autoRoleId = client.config?.autoRoleId;
  const autoRole = autoRoleId ? guild.roles.cache.get(autoRoleId) : null;

  for (const member of targetMembers) {
    if (member.id === guild.ownerId) continue; // Sunucu sahibini atla
    if (muafSet.has(member.id)) continue;       // Muaf listesindeyse atla

    try {
      const rolesToRemove = member.roles.cache.filter(role => {
        if (role.id === guild.id) return false;                         // @everyone
        if (autoRoleId && role.id === autoRoleId) return false;         // Otorol
        if (role.managed) return false;                                 // Booster / entegrasyon rolleri
        if (role.position >= botHighestRole.position) return false;     // Botun üstündeki roller
        return true;
      });

      if (rolesToRemove.size > 0) {
        await member.roles.remove(rolesToRemove, 'Toplu perm çekme işlemi').catch(err => { throw err; });
      }

      // Otorol tanımlıysa ve üyede yoksa ver
      if (autoRole && !member.roles.cache.has(autoRoleId)) {
        await member.roles.add(autoRole, 'Toplu perm çekme işlemi - Otorol').catch(err => { throw err; });
      }
      successCount++;
    } catch (err) {
      console.error(`[TOPLUPERM-CEK] Error processing member ${member.user.tag}:`, err);
      failCount++;
    }
  }

  return { successCount, failCount };
}

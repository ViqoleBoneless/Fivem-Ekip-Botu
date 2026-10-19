import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder
} from 'discord.js';
import { E } from './emojis.js';

/**
 * InGame etkinlik paneli oluşturur.
 * Container V2 kullanır ancak accent color olmaz.
 * Butonlar container dışında ayrı bir ActionRow olarak döner.
 * 
 * @returns {{ container: ContainerBuilder, row: ActionRowBuilder }}
 */
export function buildEventContainer(eventType, limit, participants = [], finished = false, sure = null, yedek = null, toplanmaSaati = null) {
  const current = participants.length;
  const mainCount = Math.min(current, limit);
  const isTargetReached = current >= limit;

  // ── Durum kutusu (diff codeblock) ──
  let statusBox;
  if (finished) {
    if (isTargetReached) {
      statusBox = `\`\`\`diff\n+ [ HEDEFE ULAŞILDI / BİTTİ (${current}/${limit}) ] +\n\`\`\``;
    } else {
      statusBox = `\`\`\`diff\n- [ SÜRE DOLDU / BİTTİ (${current}/${limit}) ] -\n\`\`\``;
    }
  } else if (isTargetReached) {
    statusBox = `\`\`\`diff\n+ [ HEDEFE ULAŞILDI (${current}/${limit}) ] +\n\`\`\``;
  } else {
    statusBox = `\`\`\`diff\n+ [ KATILIMLAR AÇIK (${current}/${limit}) ] +\n\`\`\``;
  }

  // ── Bilgi satırları ──
  let infoLines = `${E.tarih} **Süre:** ${finished ? 'Süre Doldu / Bitti' : (sure || 'Belirtilmedi')}`;
  if (toplanmaSaati) {
    infoLines += `\n${E.duyuru} **Toplanma Saati:** ${toplanmaSaati}`;
  }

  // ── Katılımcı listesi ──
  let pList;
  if (participants.length === 0) {
    pList = '*Henüz katılan üye bulunmuyor.*';
  } else {
    const mainList = participants.slice(0, limit);
    const yedekList = participants.slice(limit);

    const mainStr = mainList.map((id, i) => `${i + 1}. <@${id}> \`${id}\``).join('\n');
    let yedekStr = '';
    if (yedekList.length > 0) {
      yedekStr = '\n**~ YEDEKLER ~**\n' + yedekList.map((id, i) => `Y${i + 1}. <@${id}> \`${id}\``).join('\n');
    }
    pList = mainStr + yedekStr;
  }

  if (pList.length > 1800) {
    pList = pList.substring(0, 1750) + '\n... ve diğerleri';
  }

  // ── Container (renksiz — accent color yok) ──
  const container = new ContainerBuilder()
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL('attachment://logo.png')
      )
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**${eventType}**`)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(statusBox)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(infoLines)
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`***Katılımcılar***\n${pList}`)
    );

  // ── Butonlar (container dışında ayrı ActionRow) ──
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('event_join')
      .setLabel('Katıl')
      .setStyle(ButtonStyle.Success)
      .setEmoji({ id: '1507733693903540265' })
      .setDisabled(finished),
    new ButtonBuilder()
      .setCustomId('event_leave')
      .setLabel('Ayrıl')
      .setStyle(ButtonStyle.Danger)
      .setEmoji({ id: '1507748207617114264' })
      .setDisabled(finished)
  );

  return { container, row };
}

export function parseEventDuration(sure) {
  if (!sure) return null;
  const trimmed = sure.trim();

  // HH:MM formatı
  const matchTime = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (matchTime) {
    const now = new Date();
    const hours = parseInt(matchTime[1], 10);
    const minutes = parseInt(matchTime[2], 10);
    const targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);
    if (targetDate.getTime() <= now.getTime()) {
      targetDate.setDate(targetDate.getDate() + 1);
    }
    return targetDate.getTime();
  }

  // Göreceli süre (1.5 saat, 30 dk, 1h)
  const relativeMatchFloat = trimmed.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*([a-zA-Zçığüşöа-яА-Я]+)$/);
  if (relativeMatchFloat) {
    const value = parseFloat(relativeMatchFloat[1]);
    const unit = relativeMatchFloat[2];
    let multiplier = 0;
    if (/^(saat|sa|h|hour|hours)$/i.test(unit)) {
      multiplier = 60 * 60 * 1000;
    } else if (/^(dakika|dk|d|m|min|minute|minutes)$/i.test(unit)) {
      multiplier = 60 * 1000;
    } else if (/^(saniye|sn|s|sec|second|seconds)$/i.test(unit)) {
      multiplier = 1000;
    }
    if (multiplier > 0) {
      return Date.now() + Math.round(value * multiplier);
    }
  }

  return null;
}

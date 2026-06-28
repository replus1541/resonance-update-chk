import {
  ChannelType,
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} from 'discord.js';
import { config } from '../config.js';
import { ALL_SOURCES } from '../constants.js';
import { toDiscordEmbed } from './discord-embed.js';
import { toDiscordContent } from './discord-content.js';

const SOURCE_CHOICES = [
  { name: '전체', value: 'ALL' },
  ...ALL_SOURCES.map((source) => ({ name: source, value: source }))
];

export async function startDiscordBot(db) {
  if (!config.discordBotEnabled) {
    return { enabled: false, notify: async () => ({ sent: false, reason: 'Discord bot disabled' }), stop: async () => {} };
  }
  if (!config.discordBotToken || !config.discordClientId) {
    throw new Error('DISCORD_BOT_ENABLED=true requires DISCORD_BOT_TOKEN and DISCORD_CLIENT_ID');
  }

  const commands = buildCommands();
  const rest = new REST({ version: '10' }).setToken(config.discordBotToken);
  await rest.put(Routes.applicationCommands(config.discordClientId), { body: commands.map((command) => command.toJSON()) });

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    try {
      await handleCommand(interaction, db);
    } catch (error) {
      const payload = { content: `처리 실패: ${error.message}`, ephemeral: true };
      if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
      else await interaction.reply(payload);
    }
  });

  await client.login(config.discordBotToken);
  console.log(`Discord bot logged in as ${client.user?.tag || config.discordClientId}`);

  return {
    enabled: true,
    notify: (item) => notifyDiscordSubscribers(client, db, item),
    stop: async () => client.destroy()
  };
}

function buildCommands() {
  return [
    new SlashCommandBuilder()
      .setName('subscribe')
      .setDescription('현재 채널에 RES 업데이트 알림을 등록합니다.')
      .addStringOption((option) => option
        .setName('source')
        .setDescription('알림 받을 소스')
        .setRequired(false)
        .addChoices(...SOURCE_CHOICES)),
    new SlashCommandBuilder()
      .setName('unsubscribe')
      .setDescription('현재 채널의 RES 업데이트 알림을 해제합니다.')
      .addStringOption((option) => option
        .setName('source')
        .setDescription('해제할 소스')
        .setRequired(false)
        .addChoices(...SOURCE_CHOICES)),
    new SlashCommandBuilder()
      .setName('subscriptions')
      .setDescription('현재 채널의 RES 업데이트 알림 등록 상태를 봅니다.'),
    new SlashCommandBuilder()
      .setName('res-status')
      .setDescription('RES 업데이트 감시기의 소스별 상태를 봅니다.'),
    new SlashCommandBuilder()
      .setName('latest')
      .setDescription('저장된 RES 최신 글/영상과 작성일을 봅니다.')
      .addStringOption((option) => option
        .setName('source')
        .setDescription('확인할 소스')
        .setRequired(false)
        .addChoices(...SOURCE_CHOICES))
      .addIntegerOption((option) => option
        .setName('count')
        .setDescription('source 지정 시 볼 항목 수, 최대 10개')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(10))
  ];
}

async function handleCommand(interaction, db) {
  if (!interaction.guildId) {
    await interaction.reply({ content: '서버 채널에서만 사용할 수 있습니다.', ephemeral: true });
    return;
  }
  if (interaction.channel?.type === ChannelType.DM) {
    await interaction.reply({ content: '서버 채널에서만 사용할 수 있습니다.', ephemeral: true });
    return;
  }

  const sourceOption = interaction.options.getString('source');
  const source = sourceOption && sourceOption !== 'ALL' ? sourceOption : null;

  if (interaction.commandName === 'subscribe') {
    const sub = db.upsertDiscordSubscription({
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      source,
      mentionUserId: interaction.user.id
    });
    await interaction.reply({ content: `등록 완료: <#${sub.channelId}> / ${sub.source || '전체 소스'} / 멘션: <@${interaction.user.id}>`, ephemeral: true });
    return;
  }

  if (interaction.commandName === 'unsubscribe') {
    const changes = db.deleteDiscordSubscription({ guildId: interaction.guildId, channelId: interaction.channelId, source });
    await interaction.reply({ content: changes ? `해제 완료: ${source || '전체 소스'}` : '해제할 등록이 없습니다.', ephemeral: true });
    return;
  }

  if (interaction.commandName === 'subscriptions') {
    const rows = db.listDiscordSubscriptions({ guildId: interaction.guildId, channelId: interaction.channelId });
    const text = rows.length
      ? rows.map((row) => `- ${row.source || '전체 소스'} / <#${row.channelId}> / 멘션: ${row.mentionUserId ? `<@${row.mentionUserId}>` : '없음'}`).join('\n')
      : '현재 채널에 등록된 알림이 없습니다.';
    await interaction.reply({ content: text, ephemeral: true });
    return;
  }

  if (interaction.commandName === 'res-status') {
    const rows = db.listSourceStatus();
    const text = rows.length
      ? rows.map((row) => [
        `- ${row.source}: baseline=${row.baseline_done ? 'done' : 'pending'}`,
        `last=${formatKst(row.last_success_at) || '-'}`,
        `next=${formatKst(row.next_check_at) || '-'}`,
        `backoff=${formatKst(row.backoff_until) || '-'}`,
        `failures=${row.failure_count || 0}`,
        `error=${row.last_error ? 'yes' : 'no'}`
      ].join(', ')).join('\n')
      : '아직 수집 상태가 없습니다.';
    await interaction.reply({ content: text.slice(0, 1900), ephemeral: true });
    return;
  }

  if (interaction.commandName === 'latest') {
    const count = interaction.options.getInteger('count') || 1;
    const rows = db.listLatestFeedItemsBySource({
      sources: source ? [source] : null,
      limitPerSource: source ? count : 1
    });
    const text = rows.length ? rows.map(formatLatestItem).join('\n\n') : '저장된 글/영상이 없습니다.';
    await interaction.reply({ content: text.slice(0, 1900), ephemeral: true });
  }
}

function formatLatestItem(item) {
  const timeLine = item.publishedAt
    ? `작성일: ${formatKst(item.publishedAt)}`
    : `작성일: 확인 불가\n발견시각: ${formatKst(item.collectedAt) || '-'}`;
  return [
    `**${item.source}** ${item.category || '기타'} / ${item.type || 'unknown'}`,
    `제목: ${item.title || '(제목 없음)'}`,
    timeLine,
    `링크: ${item.url}`
  ].join('\n');
}

function formatKst(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
}

async function notifyDiscordSubscribers(client, db, item) {
  const subscriptions = db.listDiscordSubscriptions({ source: item.source });
  if (subscriptions.length === 0) {
    return { sent: false, notifier: 'discord-bot', reason: 'no subscriptions' };
  }

  let sent = 0;
  const errors = [];
  for (const sub of subscriptions) {
    try {
      const channel = await client.channels.fetch(sub.channelId);
      if (!channel?.isTextBased()) {
        errors.push(`${sub.channelId}: not text based`);
        continue;
      }
      await channel.send({
        content: toDiscordContent(item, sub.mentionUserId),
        embeds: [toDiscordEmbed(item)],
        allowedMentions: sub.mentionUserId ? { users: [sub.mentionUserId] } : { parse: [] }
      });
      sent += 1;
    } catch (error) {
      errors.push(`${sub.channelId}: ${error.message}`);
    }
  }

  return {
    sent: sent > 0,
    notifier: 'discord-bot',
    channelCount: sent,
    errors
  };
}

import { config } from '../config.js';
import { toDiscordEmbed } from './discord-embed.js';

export async function notifyDiscord(item) {
  if (!config.discordBotToken) {
    return { sent: false, reason: 'DISCORD_BOT_TOKEN is empty' };
  }
  if (!config.discordChannelId) {
    return { sent: false, reason: 'DISCORD_CHANNEL_ID is empty' };
  }

  const response = await fetch(`https://discord.com/api/v10/channels/${config.discordChannelId}/messages`, {
    method: 'POST',
    headers: {
      authorization: `Bot ${config.discordBotToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      embeds: [toDiscordEmbed(item)]
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Discord bot message failed: HTTP ${response.status} ${text.slice(0, 500)}`);
  }

  return { sent: true };
}

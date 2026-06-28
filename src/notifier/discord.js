import { config } from '../config.js';
import { toDiscordEmbed } from './discord-embed.js';

export async function notifyDiscord(item) {
  if (!config.discordWebhookUrl) {
    return { sent: false, reason: 'DISCORD_WEBHOOK_URL is empty' };
  }

  const response = await fetch(config.discordWebhookUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      username: config.discordUsername,
      embeds: [toDiscordEmbed(item)]
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Discord webhook failed: HTTP ${response.status} ${text.slice(0, 500)}`);
  }

  return { sent: true };
}

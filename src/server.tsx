import type { Bot, Context } from 'koishi';
import { Config, name } from './config';
import { Profile } from './typing';

const MESSAGE_REGEX = /^<@?(.*?)>\s*(.*)$/;

export function server(ctx: Context, config: Config) {
  const logger = ctx.logger(name);

  if (config.notification.enable) {
    // https://github.com/tobymao/18xx/blob/master/lib/hooks.rb
    ctx.server.post(config.notification.path, async (ptx, _next) => {
      const { text = '' } = ptx.request.body || {};
      const result = MESSAGE_REGEX.exec(text);
      if (!result) {
        logger.error('Webhook格式错误');
        return (ptx.status = 400);
      }
      const [, webhookId, message] = result;
      if (!Number(webhookId) || !message) {
        logger.error('Webhook格式错误');
        return (ptx.status = 400);
      }
      const profiles = await ctx.database.get(name, { id: Number(webhookId) });
      logger.info('Webhook', webhookId, message, profiles);

      const sendNotification = async (profile: Profile, bots: Bot[] = ctx.bots, guildIds: string[] = [profile.guildId]) => {
        let success = false;
        for (const bot of bots) {
          for (const guildId of guildIds) {
            try {
              const result = await bot.sendMessage(
                guildId,
                <>
                  <at id={profile.userId} name={webhookId} /> {message}
                </>
              );
              logger.info('通知发送成功', result, message, profile);
              success = true;
              break;
            } catch (e) {
              logger.error('通知发送失败', e, message, profile);
            }
          }
          if (success) {
            break;
          }
        }
        if (!success) {
          logger.info('未能发送通知', message, profile);
        }
        return success;
      };

      for (const profile of profiles.filter((profile) => profile.notify)) {
        // 每个profile都要通知
        if (!config.notification.items.length) {
          // 如果没有配置，直接发送通知
          await sendNotification(profile);
          continue;
        }

        for (const item of config.notification.items.filter((item) => !item.platform || item.platform === profile.platform)) {
          if (item.botIds.length && !item.botIds.includes(profile.botId) && !item.defaultBotIds.includes(profile.botId)) {
            continue;
          }
          if (item.guildIds.length && !item.guildIds.includes(profile.guildId) && item.defaultGuildId !== profile.guildId) {
            continue;
          }
          // 找到匹配的配置后
          // 先拿出所有有效的bot，和所有的群，然后尝试发送直到成功为止
          const bots: Bot[] = Array.from(
            new Set(
              [
                ...item.defaultBotIds.map((id) => ctx.bots.find((bot) => bot.selfId === id)),
                ctx.bots.find((bot) => bot.selfId === profile.botId),
                ...item.botIds.map((id) => ctx.bots.find((bot) => bot.selfId === id)),
              ].filter(Boolean)
            )
          );
          const guildIds: string[] = Array.from(new Set([item.defaultGuildId, profile.guildId, ...item.guildIds].filter(Boolean)));

          if (await sendNotification(profile, bots, guildIds)) {
            // 每个平台只通知一次
            break;
          }
        }
      }
      return (ptx.status = 200);
    });
    logger.info('启用通知服务');
  }
}

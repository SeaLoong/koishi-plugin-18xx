import Server from '@koishijs/plugin-server';
import type { Bot, Context } from 'koishi';
import { LRUCache } from 'lru-cache';
import { Config, name, SendMode } from './config';
import { Profile } from './typing';

class ForkServer extends Server {}

const createProxyCtx = (ctx: Context) =>
  new Proxy(ctx, {
    get(target, p, receiver) {
      const val = Reflect.get(target, p, receiver);
      if (p === 'name' && name !== val) {
        return `${name} > ${val}`;
      }
      return val;
    },
  });

const forkServer = (ctx: Context, config: Config) =>
  new Promise<typeof ctx.server>((resolve, reject) => {
    const proxy = createProxyCtx(ctx.isolate('server'));
    proxy.plugin(ForkServer, {
      ...ctx.server.config,
      ...config.server,
    });
    proxy.once('server/ready', () => resolve(proxy.server));
    proxy.once('dispose', reject);
  });

const MESSAGE_REGEX = /^<@?(.*?)>\s*([\S\s]*)$/;
const GAME_REGEX = /18xx\.games\/game\/(\d+)/;

/**
 * 缓存上次发送通知的信息，限制在一名玩家在一场对局中一定时间内只能通知一次
 * key: webhookId + userId + gameId
 * value: timestamp
 */
const sendCache = new LRUCache<string, { ts: number; cancel?: () => void }>({ max: 1000 });

export async function server(ctx: Context, config: Config) {
  const logger = ctx.logger(name);

  let server = ctx.server;
  if (config.server.port && config.server.port !== server.port) {
    logger.info('Server port is different from koishi Server port, fork server.');
    server = await forkServer(ctx, config);
  }

  if (config.notification.enable) {
    // https://github.com/tobymao/18xx/blob/master/lib/hooks.rb
    server.post(config.notification.path, async (ptx, _next) => {
      // <@12345> Your Turn in 1830 "" (Auction Round 1) \nhttp://18xx.games/game/123456
      const { text = '' } = ptx.request.body || {};
      if (!text) {
        logger.error('Webhook 格式错误, body', ptx.request.body);
        return (ptx.status = 400);
      }

      const matchMessage = MESSAGE_REGEX.exec(text);
      const webhookId = Number(matchMessage?.[1]);
      const message = matchMessage?.[2] || '';
      if (!webhookId || !message) {
        logger.error('Webhook 格式错误, text', text);
        return (ptx.status = 400);
      }

      const matchGame = GAME_REGEX.exec(message);
      const gameId = matchGame?.[1] || '';
      const profiles = await ctx.database.get(name, { id: webhookId });
      logger.debug('Webhook', webhookId, gameId, message, profiles);

      const sendNotification = async (
        profile: Profile,
        sendMode: SendMode = 'private-guild',
        bots: Bot[] = ctx.bots,
        guildIds: string[] = [profile.guildId]
      ) => {
        const sendCacheKey = [webhookId, profile.userId, gameId].join('|');
        for (const bot of bots) {
          for (const guildId of guildIds) {
            try {
              let result: string[];
              const sendPrivate = () => bot.sendPrivateMessage(profile.userId, message, guildId);
              const sendGuild = () =>
                bot.sendMessage(
                  guildId,
                  <>
                    <at id={profile.userId} name={`${webhookId}`} /> {message}
                  </>
                );
              switch (sendMode) {
                case 'private-only':
                  result = await sendPrivate();
                  break;
                case 'private-guild':
                  try {
                    result = await sendPrivate();
                  } catch (e) {
                    logger.error('私聊消息发送失败，尝试群消息', e, sendCacheKey, message);
                    result = await sendGuild();
                  }
                  break;
                case 'guild-only':
                  result = await sendGuild();
                  break;
              }
              if (result?.length > 0) {
                logger.info('通知发送成功', result, sendCacheKey, message);
                sendCache.set(sendCacheKey, { ts: Date.now() });
                return true;
              }
            } catch (e) {
              logger.error('通知发送失败', e, sendCacheKey, message);
            }
          }
        }
        logger.info('未能发送通知', sendCacheKey, message);
        return false;
      };

      const tryProfile = async (profile: Profile) => {
        const sendCacheKey = [webhookId, profile.userId, gameId].join('|');
        if (sendCache.has(sendCacheKey)) {
          const { ts: lastTimestamp, cancel: cancelPrevTask } = sendCache.get(sendCacheKey);
          cancelPrevTask?.();
          const nextTimestamp = lastTimestamp + profile.interval * 1000;
          const now = Date.now();
          if (nextTimestamp > now) {
            logger.debug('通知发送间隔小于限制', sendCacheKey, nextTimestamp - now);
            const cancel = ctx.setTimeout(() => tryProfile(profile), nextTimestamp - now);
            sendCache.set(sendCacheKey, { ts: lastTimestamp, cancel });
            return;
          }
          sendCache.delete(sendCacheKey);
        }
        if (!config.notification.items.length) {
          // 如果没有配置，直接发送通知
          await sendNotification(profile);
          return;
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

          if (await sendNotification(profile, item.sendMode, bots, guildIds)) {
            // 每个平台只通知一次
            return;
          }
        }
      };

      for (const profile of profiles.filter((profile) => profile.notify)) {
        // 每个profile都要尝试通知
        tryProfile(profile);
      }
      return (ptx.status = 200);
    });
    logger.info('启用通知服务');
  }
}

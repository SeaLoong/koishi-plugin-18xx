import type { Command, Context } from 'koishi';
import { Config, name } from './config';

export function command(ctx: Context, config: Config) {
  const logger = ctx.logger(name);

  const checkSessionMiddleware: Command.Action = ({ session }) => {
    if (!session.guildId) {
      return '请在群里使用这个命令';
    }
    if (config.notification.items.length) {
      let found = false;
      for (const { botIds, guildIds, defaultBotIds, defaultGuildId } of config.notification.items.filter(
        (item) => !item.platform || item.platform === session.platform
      )) {
        if (botIds.length && !botIds.includes(session.selfId) && !defaultBotIds.includes(session.selfId)) {
          continue;
        }
        if (guildIds.length && !guildIds.includes(session.guildId) && defaultGuildId !== session.guildId) {
          continue;
        }
        found = true;
        break;
      }
      // 不匹配直接静默失败
      if (!found) return '';
    }
  };

  ctx
    .command('18xx.bind <id>', '绑定账号')
    .option('force', '-f', { authority: 4 })
    .usage('id 是个人资料页地址栏 profile 后面的数字')
    .usage('需要先绑定账号，并在个人资料页 Webhook User ID 中填入你的 id')
    .before(checkSessionMiddleware)
    .action(async ({ session, options }, id) => {
      if (Number(id)) {
        if (!options.force) {
          const profiles = await ctx.database.get(name, { id: Number(id) });
          if (profiles.length) {
            if (profiles.length > 1) {
              logger.error(`${id} 绑定了多个账号`, profiles, session);
            }
            // 已经绑定过了，检查是否为同一个用户
            if (profiles[0].userId !== session.userId) {
              return `${id} 已被其他用户绑定`;
            }
          }
        }
        const result = await ctx.database.upsert(name, [
          {
            id: Number(id),
            userId: session.userId,
            platform: session.platform,
            botId: session.selfId,
            guildId: session.guildId,
          },
        ]);
        if (result.inserted) {
          return `${id} 绑定成功`;
        } else {
          return `${id} 重新绑定成功`;
        }
      } else {
        return '绑定失败';
      }
    });

  ctx
    .command('18xx.unbind <id>', '取消绑定账号')
    .usage('id 是个人资料页地址栏 profile 后面的数字')
    .action(async ({ session }, id) => {
      const result = await ctx.database.remove(name, { id: Number(id), userId: session.userId });
      if (!result.matched) {
        return '你还没有绑定账号';
      }
      if (result.removed) {
        return `${id} 解绑成功`;
      }
      return '解绑失败';
    });

  ctx
    .command('18xx.list', '列出已绑定的账号')
    .usage('需要先绑定账号，并在个人资料页 Webhook User ID 中填入你的 id')
    .alias('18xx.ls')
    .action(async ({ session }) => {
      const profiles = await ctx.database.get(name, { userId: session.userId });
      if (!profiles.length) {
        return '你还没有绑定账号';
      }
      return `当前已绑定${profiles.length}个账号:\n${profiles.map((p) => `${p.id}`).join('\n')}`;
    });

  ctx
    .command('18xx.on', '开启通知')
    .usage('需要先绑定账号，并在个人资料页 Webhook User ID 中填入你的 id')
    .action(async ({ session }) => {
      const profiles = await ctx.database.get(name, { userId: session.userId });
      if (!profiles.length) {
        return '你还没有绑定账号';
      }
      await ctx.database.upsert(
        name,
        profiles.map((p) => ({ ...p, notify: true }))
      );
      return '通知已开启';
    });

  ctx.command('18xx.off', '关闭通知').action(async ({ session }) => {
    const profiles = await ctx.database.get(name, { userId: session.userId });
    if (!profiles.length) {
      return '你还没有绑定账号';
    }
    await ctx.database.upsert(
      name,
      profiles.map((p) => ({ ...p, notify: false }))
    );
    return '通知已关闭';
  });

  ctx
    .command('18xx.config <key> <value>', '修改设置')
    .usage('需要先绑定账号，并在个人资料页 Webhook User ID 中填入你的 id')
    .action(async ({ session }, key, value) => {
      const profiles = await ctx.database.get(name, { userId: session.userId });
      if (!profiles.length) {
        return '你还没有绑定账号';
      }
      if (typeof key !== 'string' || typeof value !== 'string') {
        return '参数错误';
      }
      let val: any = value;
      switch (key) {
        case 'notify':
          val = value !== '0' && Boolean(value);
          break;
        case 'interval':
          val = Math.max(10, Math.min(600, Number(value)));
          break;
      }
      try {
        const result = await ctx.database.upsert(
          name,
          profiles.map((p) => ({ ...p, [key]: val }))
        );
        if (result.matched) {
          return `设置已修改：${key}=${val}`;
        }
      } catch (e) {
        logger.error('Cannot update config:', e?.message || e);
        return `未能修改设置：${key}=${val}`;
      }
    });
}

import { Context } from 'koishi';
import { command } from './command';
import { Config, inject, name } from './config';
import { server } from './server';

export { Config, inject, name };

export function apply(ctx: Context, config: Config) {
  ctx.model.extend(name, {
    id: 'integer',
    userId: 'string',
    platform: 'string',
    botId: 'string',
    guildId: 'string',
    notify: {
      type: 'boolean',
      initial: true,
    },
    interval: {
      type: 'integer',
      initial: 30,
    },
  });

  command(ctx, config);

  server(ctx, config);
}

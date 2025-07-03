import { Context } from 'koishi';
import { Config, name, inject } from './config';
import { command } from './command';
import { server } from './server';

export { name, inject };
export { Config };

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
  });

  command(ctx, config);

  server(ctx, config);
}

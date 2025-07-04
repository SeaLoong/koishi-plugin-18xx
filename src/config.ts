import { Server } from '@koishijs/plugin-server';
import { Schema } from 'koishi';

export type SendMode = 'private-only' | 'private-guild' | 'guild-only';

export const name = '18xx';

export const inject = {
  required: ['server', 'database'],
  // optional: ['puppeteer'],
};

export interface Config {
  server: {
    enable?: boolean;
  } & Partial<Server.Config>;
  notification: {
    enable: boolean;
    path: string;
    items: {
      platform: string;
      defaultGuildId: string;
      guildIds: string[];
      defaultBotIds: string[];
      botIds: string[];
      sendMode: 'private-only' | 'private-guild' | 'guild-only';
    }[];
  };
}

export const Config: Schema<Config> = Schema.object({
  server: Schema.intersect([
    Schema.object({
      enable: Schema.boolean().default(false).description('自定义服务器'),
    }),
    Schema.union([
      Schema.intersect([
        Schema.object({
          enable: Schema.const(true).required(),
        }),
        Server.Config,
      ]),
      Schema.object({}),
    ]),
  ]),
  notification: Schema.object({
    enable: Schema.boolean().default(true).description('启用通知'),
    path: Schema.string().default('/18xx').description('Webhook 监听路径'),
    items: Schema.array(
      Schema.object({
        platform: Schema.string().default('').description('平台，为空表示不限制'),
        defaultGuildId: Schema.string().default('').description('默认发送通知的群，如果不指定，通知会被发送到绑定时的群，如果绑定时没有群，通知不会发送'),
        guildIds: Schema.array(Schema.string()).default([]).description('允许发送通知的群，为空表示允许在所有群发送通知'),
        defaultBotIds: Schema.array(Schema.string()).default([]).description('默认发送通知的机器人，如果不指定，通知由绑定时的机器人发送'),
        botIds: Schema.array(Schema.string())
          .default([])
          .description('允许发送通知的机器人，如果先前的机器人都无法工作，将会尝试使用后面的机器人发送通知，为空表示允许所有机器人发送通知'),
        sendMode: Schema.union([
          Schema.const('private-only').description('仅私聊'),
          Schema.const('private-guild').description('私聊优先，失败则群聊'),
          Schema.const('guild-only').description('仅群聊'),
        ])
          .default('private-guild')
          .description('通知发送方式'),
      })
    )
      .default([])
      .description('平台通知设置'),
  }).description('通知设置'),
});

export default Config;

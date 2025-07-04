import {} from '@koishijs/plugin-server';
import {} from 'koishi';

declare module 'koishi' {
  interface Context {}

  interface Events {}

  interface User {}

  interface Channel {}

  interface Tables {
    '18xx': Profile;
  }
}

interface Profile {
  id: number;
  userId: string;
  platform: string;
  botId: string;
  guildId: string;
  notify: boolean;
  interval: number;
}

import {} from 'koishi';
import {} from '@koishijs/plugin-server';

declare module 'koishi' {
  interface Context {
    github?: GitHub;
  }

  interface Events {
    'github/webhook'(event: string, payload: CommonPayload): void;
  }

  interface User {
    github: {
      accessToken: string;
      refreshToken: string;
    };
  }

  interface Channel {
    github: {
      webhooks: Dict<EventFilter>;
    };
  }

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
}

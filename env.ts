import { defineEnv, string } from 'void/env';

export default defineEnv({
  KORA_APP_NAME: string().default('Kora'),
});

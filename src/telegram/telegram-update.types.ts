// The subset of Telegram's Update object we handle.
export interface TelegramUser {
  id: number;
  username?: string;
  first_name?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: TelegramUser;
    chat: { id: number; type: string };
    text?: string;
    contact?: { phone_number: string; user_id?: number };
  };
  // A tap on an inline button with callback_data (Telenotify Pass Yes/No).
  callback_query?: {
    id: string;
    from: TelegramUser;
    data?: string;
    message?: { message_id: number; chat: { id: number; type: string } };
  };
  my_chat_member?: {
    chat: { id: number; type: string };
    from: TelegramUser;
    new_chat_member: { status: string };
  };
  // Setup bot only (Managed Bots): a bot was created for us to manage, or its token
  // or owner changed. `user` is the person who created it.
  managed_bot?: {
    user: TelegramUser;
    bot: TelegramUser;
  };
}

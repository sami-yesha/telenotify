// Thin wrapper over the Telegram Bot API (https://core.telegram.org/bots/api).
// One instance per bot token.

export interface InlineButton {
  text: string;
  url: string;
}

/** A button that sends `data` back to the bot (a callback_query) instead of opening a link. */
export interface CallbackButton {
  text: string;
  callback_data: string;
}

export class TelegramApiError extends Error {
  constructor(
    readonly errorCode: number,
    readonly description: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(`Telegram API ${errorCode}: ${description}`);
  }

  // 403: the user blocked the bot or deleted their account.
  get isBlocked(): boolean {
    return this.errorCode === 403;
  }

  // 400 "chat not found": the chat id is no longer valid for this bot.
  get isChatGone(): boolean {
    return this.errorCode === 400 && /chat not found/i.test(this.description);
  }
}

export class TelegramApiClient {
  private static readonly BASE_URL = 'https://api.telegram.org';

  constructor(
    private readonly botToken: string,
    private readonly timeoutMs = 10_000,
  ) {}

  getMe(): Promise<{ id: number; username: string; first_name: string }> {
    return this.call('getMe', {});
  }

  /** The line shown on the bot's profile and before a chat starts (max 120 characters). */
  getMyShortDescription(): Promise<{ short_description: string }> {
    return this.call('getMyShortDescription', {});
  }

  setMyShortDescription(shortDescription: string): Promise<boolean> {
    return this.call('setMyShortDescription', { short_description: shortDescription });
  }

  /** The name at the top of the chat (max 64 characters). */
  getMyName(): Promise<{ name: string }> {
    return this.call('getMyName', {});
  }

  setMyName(name: string): Promise<boolean> {
    return this.call('setMyName', { name });
  }

  /** Shown in an empty chat, before the customer presses Start (max 512 characters). */
  getMyDescription(): Promise<{ description: string }> {
    return this.call('getMyDescription', {});
  }

  setMyDescription(description: string): Promise<boolean> {
    return this.call('setMyDescription', { description });
  }

  setMyCommands(commands: { command: string; description: string }[]): Promise<boolean> {
    return this.call('setMyCommands', { commands });
  }

  /** Telegram only takes a new JPEG upload here (a file can't be reused). */
  async setMyProfilePhoto(jpeg: Buffer): Promise<boolean> {
    const form = new FormData();
    // attach://<name> points at the form field that holds the file.
    form.append('photo', JSON.stringify({ type: 'static', photo: 'attach://photo_file' }));
    form.append('photo_file', new Blob([new Uint8Array(jpeg)], { type: 'image/jpeg' }), 'photo.jpg');
    return this.send<boolean>('setMyProfilePhoto', form);
  }

  /** Managed Bots: the token of a bot this (manager) bot manages. */
  getManagedBotToken(botId: number): Promise<string> {
    return this.call('getManagedBotToken', { user_id: botId });
  }

  setWebhook(url: string, secretToken: string, allowedUpdates: string[] = ['message', 'my_chat_member']): Promise<boolean> {
    return this.call('setWebhook', {
      url,
      secret_token: secretToken,
      allowed_updates: allowedUpdates,
    });
  }

  deleteWebhook(): Promise<boolean> {
    return this.call('deleteWebhook', {});
  }

  sendMessage(
    chatId: string,
    text: string,
    options: { buttons?: (InlineButton | CallbackButton)[][]; requestContact?: boolean; html?: boolean } = {},
  ): Promise<{ message_id: number }> {
    let replyMarkup: unknown;
    if (options.buttons?.length) {
      replyMarkup = { inline_keyboard: options.buttons };
    } else if (options.requestContact) {
      replyMarkup = {
        keyboard: [[{ text: 'Share my phone number', request_contact: true }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      };
    }
    return this.call('sendMessage', { chat_id: chatId, text, reply_markup: replyMarkup, ...(options.html ? { parse_mode: 'HTML' } : {}) });
  }

  /**
   * Managed Bots: a keyboard button that opens Telegram's "create a bot" window, with
   * the name and username filled in (the person can change both). Needs Bot
   * Management Mode on for this bot in the @BotFather Mini App.
   */
  sendCreateBotButton(chatId: string, text: string, button: { label: string; suggestedName: string; suggestedUsername: string }): Promise<{ message_id: number }> {
    return this.call('sendMessage', {
      chat_id: chatId,
      text,
      reply_markup: {
        keyboard: [[{ text: button.label, request_managed_bot: { request_id: 1, suggested_name: button.suggestedName, suggested_username: button.suggestedUsername } }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    });
  }

  removeKeyboardMessage(chatId: string, text: string): Promise<{ message_id: number }> {
    return this.call('sendMessage', { chat_id: chatId, text, reply_markup: { remove_keyboard: true } });
  }

  /** Replaces a sent message's text; buttons are removed unless given. */
  editMessageText(chatId: string, messageId: string | number, text: string, buttons?: (InlineButton | CallbackButton)[][]): Promise<unknown> {
    return this.call('editMessageText', { chat_id: chatId, message_id: Number(messageId), text, reply_markup: { inline_keyboard: buttons ?? [] } });
  }

  /** Stops the button's loading spinner; text shows as a small toast. */
  answerCallbackQuery(callbackQueryId: string, text?: string): Promise<boolean> {
    return this.call('answerCallbackQuery', { callback_query_id: callbackQueryId, ...(text ? { text } : {}) });
  }

  private call<T>(method: string, body: Record<string, unknown>): Promise<T> {
    return this.send(method, JSON.stringify(body));
  }

  // A JSON string, or a multipart form for file uploads (fetch sets its content type).
  private async send<T>(method: string, body: string | FormData): Promise<T> {
    const response = await fetch(`${TelegramApiClient.BASE_URL}/bot${this.botToken}/${method}`, {
      method: 'POST',
      ...(typeof body === 'string' ? { headers: { 'content-type': 'application/json' } } : {}),
      body,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const payload = (await response.json()) as {
      ok: boolean;
      result?: T;
      error_code?: number;
      description?: string;
      parameters?: { retry_after?: number };
    };
    if (!payload.ok) {
      throw new TelegramApiError(
        payload.error_code ?? response.status,
        payload.description ?? 'Unknown error',
        payload.parameters?.retry_after,
      );
    }
    return payload.result as T;
  }
}

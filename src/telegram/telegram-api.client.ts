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

  private async call<T>(method: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${TelegramApiClient.BASE_URL}/bot${this.botToken}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
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

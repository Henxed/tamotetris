// Минимальный бот без зависимостей. Требуется Node.js 18+.
// Запуск:
// BOT_TOKEN="123:abc" WEBAPP_URL="https://your-domain.example/tetrapet/" node bot/bot.js

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL;

if (!BOT_TOKEN || !WEBAPP_URL) {
  console.error('Нужно задать BOT_TOKEN и WEBAPP_URL');
  process.exit(1);
}

const API = `https://api.telegram.org/bot${BOT_TOKEN}`;
let offset = 0;

async function api(method, payload) {
  const response = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!data.ok) throw new Error(`${method}: ${data.description}`);
  return data.result;
}

async function sendGameButton(chatId) {
  await api('sendMessage', {
    chat_id: chatId,
    text: '🐠 TetraPet Aquarium: собирай линии в тетрисе, получай монетки и ухаживай за питомцем в аквариуме.',
    reply_markup: {
      inline_keyboard: [[
        {
          text: 'Играть',
          web_app: { url: WEBAPP_URL },
        },
      ]],
    },
  });
}

async function poll() {
  while (true) {
    try {
      const updates = await api('getUpdates', { offset, timeout: 35, allowed_updates: ['message'] });
      for (const update of updates) {
        offset = update.update_id + 1;
        const message = update.message;
        if (!message?.chat?.id) continue;
        const text = message.text || '';
        if (text.startsWith('/start') || text.startsWith('/play')) {
          await sendGameButton(message.chat.id);
        }
      }
    } catch (error) {
      console.error(error.message);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
}

poll();

# TetraPet Aquarium

Telegram Mini App: тетрис + тамагочи в стиле ретро-аквариума.

## Что уже есть

- Тетрис на Canvas: фигуры, поворот, ghost-piece, комбо, ускорение, очки.
- Монетки за очищенные линии.
- Питомец в аквариуме: сытость, настроение, чистота, энергия.
- Инвентарь и магазин: еда, губка, игрушка, декор.
- Bubble Fever: временный x2 множитель монет.
- Декор с пассивными бонусами.
- Управление мышью, клавиатурой и свайпами.
- Telegram WebApp API: expand, цвета, haptic feedback, popup.
- Telegram CloudStorage: сейв синхронизируется между устройствами внутри одного Telegram-бота.
- Fallback в localStorage: игра открывается и в обычном браузере.
- Минимальный `bot/bot.js` без зависимостей для кнопки “Играть”.

## Как работает сохранение

Файл `src/state.js` сначала пытается загрузить сейв из:

```text
Telegram.WebApp.CloudStorage.getItem('tetrapet_save_v1')
```

Если CloudStorage доступен, игра сохраняет туда весь прогресс:

```text
Telegram.WebApp.CloudStorage.setItem('tetrapet_save_v1', JSON.stringify(state))
```

Если игра запущена не внутри Telegram или CloudStorage недоступен, используется обычный `localStorage`.

В шапке игры есть бейдж:

- `☁ Telegram Cloud` — сейв идёт в Telegram CloudStorage.
- `localStorage` — сейв только локальный, между устройствами не синхронизируется.
- `☁ Cloud: ошибка` — Telegram CloudStorage доступен, но запись не прошла. Наведи мышкой/зажми на бейдж, чтобы увидеть текст ошибки.

Текущий сейв компактный и хранится в одном ключе. У Telegram CloudStorage есть лимит 4096 символов на значение, поэтому если потом добавишь коллекции, квесты, много декора и историю событий, лучше разбить сейв на несколько ключей.

## Быстрый локальный запуск

```bash
cd telegram-tetrapet
python3 -m http.server 5173
```

Открыть в браузере:

```text
http://localhost:5173
```

В обычном браузере будет работать `localStorage`, а не Telegram CloudStorage.

## Деплой на GitHub Pages

Проект уже статический: сборка не нужна.

1. Создай репозиторий, например `telegram-tetrapet`.
2. Скопируй все файлы проекта в корень репозитория.
3. Закоммить и запушь:

```bash
git init
git add .
git commit -m "Initial TetraPet Mini App"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/telegram-tetrapet.git
git push -u origin main
```

4. В GitHub открой:

```text
Settings → Pages → Build and deployment → Deploy from a branch
```

5. Выбери:

```text
Branch: main
Folder: / (root)
```

После публикации URL будет примерно такой:

```text
https://YOUR_USERNAME.github.io/telegram-tetrapet/
```

Именно этот URL нужно указывать в Telegram как Mini App URL.

## Подключение к Telegram

### Вариант 1. Через BotFather без своего сервера

Это самый удобный вариант для GitHub Pages.

1. Создай бота через `@BotFather`.
2. Открой настройки Mini App / Web App в BotFather.
3. Укажи URL GitHub Pages:

```text
https://YOUR_USERNAME.github.io/telegram-tetrapet/
```

После этого Mini App можно открыть из меню бота или кнопки, которую настроишь в BotFather.

### Вариант 2. Через `bot/bot.js`

Этот вариант нужен, если хочешь, чтобы бот сам отправлял кнопку “Играть” в ответ на `/start`.

GitHub Pages не запускает Node.js, поэтому `bot/bot.js` нужно держать отдельно: на VPS, домашнем сервере, Railway, Render или другом хостинге.

```bash
BOT_TOKEN="123456:ABC" WEBAPP_URL="https://YOUR_USERNAME.github.io/telegram-tetrapet/" node bot/bot.js
```

В чате с ботом написать:

```text
/start
```

## Управление

Клавиатура:

- ← / → — движение.
- ↑ — поворот.
- ↓ — мягкое падение.
- Space — жёсткое падение.
- P — пауза.

На телефоне:

- тап по полю — поворот.
- свайп влево/вправо — движение.
- свайп вниз — жёсткое падение.

## Что можно добавить дальше

- Разбить CloudStorage на несколько ключей: профиль, питомец, инвентарь, статистика.
- Ежедневные задания: “сделай 3 комбо”, “очисти 10 линий”.
- Таблица лидеров через backend.
- Разные питомцы: рыбка, аксолотль, краб, кибер-кот.
- Сезоны аквариума и коллекции декора.
- Telegram Stars: косметика/баттл-пасс без pay-to-win.

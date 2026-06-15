import { TetrisGame } from './tetris.js';
import { getActiveBuff, getState, getStorageStatus, initStateStorage, saveState, tickPetMinute } from './state.js';
import {
  cleanPet,
  feedPet,
  handleRename,
  playWithPet,
  putPetToSleep,
  renderPet,
  renderShop,
} from './pet.js';

const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  tg.setHeaderColor('#07111f');
  tg.setBackgroundColor('#07111f');
}

const elements = {
  coins: document.querySelector('#coins'),
  storageStatus: document.querySelector('#storageStatus'),
  score: document.querySelector('#score'),
  lines: document.querySelector('#lines'),
  combo: document.querySelector('#combo'),
  gameStatus: document.querySelector('#gameStatus'),
  startBtn: document.querySelector('#startBtn'),
  gameCanvas: document.querySelector('#gameCanvas'),
  nextCanvas: document.querySelector('#nextCanvas'),
  buffLabel: document.querySelector('#buffLabel'),
  petName: document.querySelector('#petName'),
  petSprite: document.querySelector('#petSprite'),
  petThought: document.querySelector('#petThought'),
  hunger: document.querySelector('#hunger'),
  mood: document.querySelector('#mood'),
  clean: document.querySelector('#clean'),
  energy: document.querySelector('#energy'),
  hungerText: document.querySelector('#hungerText'),
  moodText: document.querySelector('#moodText'),
  cleanText: document.querySelector('#cleanText'),
  energyText: document.querySelector('#energyText'),
  decorOne: document.querySelector('#decorOne'),
  decorTwo: document.querySelector('#decorTwo'),
  shopList: document.querySelector('#shopList'),
};

function notify(message) {
  if (tg?.showPopup) {
    tg.showPopup({ title: 'TetraPet', message, buttons: [{ type: 'ok' }] });
    return;
  }
  console.log(message);
}

function haptic(type = 'light') {
  tg?.HapticFeedback?.impactOccurred?.(type);
}

function renderWallet() {
  elements.coins.textContent = getState().coins;
}

function renderStorageStatus() {
  if (!elements.storageStatus) return;
  const status = getStorageStatus();
  if (status.mode === 'telegram_cloud' && !status.error) {
    elements.storageStatus.textContent = '☁ Telegram Cloud';
    elements.storageStatus.title = 'Сейв синхронизируется между устройствами через Telegram CloudStorage';
    return;
  }
  if (status.mode === 'telegram_cloud' && status.error) {
    elements.storageStatus.textContent = '☁ Cloud: ошибка';
    elements.storageStatus.title = status.error;
    return;
  }
  elements.storageStatus.textContent = 'localStorage';
  elements.storageStatus.title = 'Игра запущена вне Telegram или CloudStorage недоступен — сейв хранится локально';
}

function renderBuff() {
  const activeBuff = getActiveBuff();
  if (activeBuff === 'bubble_fever') {
    const secondsLeft = Math.max(0, Math.ceil((getState().buffEndsAt - Date.now()) / 1000));
    elements.buffLabel.textContent = `Bubble Fever: монеты x2 ещё ${secondsLeft}с`;
    return;
  }
  const pet = getState().pet;
  const hasCareBonus = pet.hunger > 55 && pet.mood > 55 && pet.clean > 55;
  elements.buffLabel.textContent = hasCareBonus ? 'Бонус питомца: +1 монета за очистку' : 'Бонус питомца: ухаживай за ним';
}

function fullRender() {
  renderWallet();
  renderStorageStatus();
  renderBuff();
  renderPet(elements);
  renderShop(elements.shopList, notify, fullRender);
}

const game = new TetrisGame({
  canvas: elements.gameCanvas,
  nextCanvas: elements.nextCanvas,
  onStats: (stats) => {
    elements.score.textContent = stats.score;
    elements.lines.textContent = stats.lines;
    elements.combo.textContent = stats.combo;
    if (stats.gameOver) {
      elements.gameStatus.textContent = 'Аквариум ждёт реванша';
      elements.startBtn.textContent = 'Снова';
    } else if (stats.paused) {
      elements.gameStatus.textContent = 'Пауза';
      elements.startBtn.textContent = 'Продолжить';
    } else if (stats.running) {
      elements.gameStatus.textContent = 'Собирай линии и монеты';
      elements.startBtn.textContent = 'Пауза';
    } else {
      elements.gameStatus.textContent = 'Готов к игре';
      elements.startBtn.textContent = 'Старт';
    }
    renderBuff();
  },
  onCoins: (coins, cleared, multiplier) => {
    haptic(multiplier > 1 ? 'heavy' : 'medium');
    renderWallet();
    renderPet(elements);
    const text = multiplier > 1 ? `+${coins} ◈ за ${cleared} линии с Fever x2` : `+${coins} ◈ за ${cleared} линии`;
    elements.gameStatus.textContent = text;
  },
  onGameOver: ({ score, lines }) => {
    haptic('heavy');
    renderPet(elements);
    renderWallet();
    saveState();
    notify(`Партия закончена. Очки: ${score}, линии: ${lines}.`);
  },
});

elements.startBtn.addEventListener('click', () => {
  haptic('light');
  if (game.running && !game.gameOver) game.togglePause();
  else game.start();
});

document.querySelectorAll('[data-action]').forEach((button) => {
  button.addEventListener('click', () => {
    haptic('light');
    const action = button.dataset.action;
    if (action === 'left') game.move(-1);
    if (action === 'right') game.move(1);
    if (action === 'rotate') game.rotate();
    if (action === 'down') game.softDrop();
    if (action === 'drop') game.hardDrop();
  });
});

document.addEventListener('keydown', (event) => {
  const keys = ['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', ' ', 'Spacebar', 'p', 'P'];
  if (!keys.includes(event.key)) return;
  event.preventDefault();
  if (event.key === 'ArrowLeft') game.move(-1);
  if (event.key === 'ArrowRight') game.move(1);
  if (event.key === 'ArrowDown') game.softDrop();
  if (event.key === 'ArrowUp') game.rotate();
  if (event.key === ' ' || event.key === 'Spacebar') game.hardDrop();
  if (event.key === 'p' || event.key === 'P') game.togglePause();
});

document.querySelector('#feedBtn').addEventListener('click', () => { feedPet(notify); haptic(); fullRender(); });
document.querySelector('#cleanBtn').addEventListener('click', () => { cleanPet(notify); haptic(); fullRender(); });
document.querySelector('#playBtn').addEventListener('click', () => { playWithPet(notify); haptic('medium'); fullRender(); });
document.querySelector('#sleepBtn').addEventListener('click', () => { putPetToSleep(notify); haptic(); fullRender(); });
document.querySelector('#renameBtn').addEventListener('click', () => { handleRename(); fullRender(); });

document.querySelectorAll('[data-tab]').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('[data-tab]').forEach((item) => item.classList.toggle('active', item === tab));
    document.querySelectorAll('[data-tab-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.tabPanel !== tab.dataset.tab;
    });
    fullRender();
  });
});

let touchStartX = 0;
let touchStartY = 0;
elements.gameCanvas.addEventListener('touchstart', (event) => {
  const touch = event.changedTouches[0];
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
}, { passive: true });

elements.gameCanvas.addEventListener('touchend', (event) => {
  const touch = event.changedTouches[0];
  const dx = touch.clientX - touchStartX;
  const dy = touch.clientY - touchStartY;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);

  if (Math.max(absX, absY) < 22) {
    game.rotate();
    return;
  }
  if (absX > absY) game.move(dx > 0 ? 1 : -1);
  else if (dy > 0) game.hardDrop();
  else game.rotate();
}, { passive: true });

setInterval(() => {
  tickPetMinute();
  renderPet(elements);
  renderBuff();
}, 60_000);

setInterval(renderBuff, 1000);
setInterval(() => renderPet(elements), 5000);

async function bootstrap() {
  elements.startBtn.disabled = true;
  elements.gameStatus.textContent = 'Загружаю сейв...';

  try {
    await initStateStorage();
  } catch (error) {
    console.warn('Save init failed:', error);
  }

  elements.startBtn.disabled = false;
  fullRender();
}

void bootstrap();

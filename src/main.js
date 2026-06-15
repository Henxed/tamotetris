import { TetrisGame } from './tetris.js';
import {
  clearOfflineReport,
  getActiveBuff,
  getControlSettings,
  getOfflineReport,
  getState,
  getStorageStatus,
  initStateStorage,
  saveState,
  setControlSetting,
  startNewPetLife,
  tickPetMinute,
} from './state.js';
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
  bestScore: document.querySelector('#bestScore'),
  gameStatus: document.querySelector('#gameStatus'),
  startBtn: document.querySelector('#startBtn'),
  resetBtn: document.querySelector('#resetBtn'),
  gameCanvas: document.querySelector('#gameCanvas'),
  nextCanvas: document.querySelector('#nextCanvas'),
  lastRunResult: document.querySelector('#lastRunResult'),
  toggleControlsBtn: document.querySelector('#toggleControlsBtn'),
  invertControlsBtn: document.querySelector('#invertControlsBtn'),
  touchControlsBtn: document.querySelector('#touchControlsBtn'),
  swipeDropBtn: document.querySelector('#swipeDropBtn'),
  controlsPanel: document.querySelector('#controlsPanel'),
  touchHint: document.querySelector('#touchHint'),
  petName: document.querySelector('#petName'),
  petSprite: document.querySelector('#petSprite'),
  petThought: document.querySelector('#petThought'),
  petDeathOverlay: document.querySelector('#petDeathOverlay'),
  petActionButtons: Array.from(document.querySelectorAll('#petActions button')),
  offlineNotice: document.querySelector('#offlineNotice'),
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
  elements.bestScore.textContent = getState().bestScore;
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
  if (!activeBuff) return;
  const secondsLeft = Math.max(0, Math.ceil((getState().buffEndsAt - Date.now()) / 1000));
  elements.gameStatus.textContent = activeBuff === 'bubble_fever'
    ? `Bubble Fever: x2 ещё ${secondsLeft}с`
    : 'Бонус активен';
}

function renderOfflineNotice() {
  const report = getOfflineReport();
  if (!elements.offlineNotice) return;
  if (!report?.message) {
    elements.offlineNotice.hidden = true;
    elements.offlineNotice.textContent = '';
    return;
  }
  elements.offlineNotice.hidden = false;
  elements.offlineNotice.textContent = report.message;
  elements.offlineNotice.classList.toggle('danger', Boolean(report.died));
}

function renderControlSettings() {
  const settings = getControlSettings();
  elements.controlsPanel.hidden = !settings.showControls;
  elements.toggleControlsBtn.textContent = settings.showControls ? 'Кнопки: вкл' : 'Кнопки: выкл';
  elements.invertControlsBtn.textContent = settings.invertHorizontal ? 'Инверсия: вкл' : 'Инверсия: выкл';
  elements.touchControlsBtn.textContent = settings.touchControls ? 'Тач: вкл' : 'Тач: выкл';
  elements.swipeDropBtn.textContent = settings.swipeDrop ? 'Свайп вниз: вкл' : 'Свайп вниз: выкл';
  elements.touchHint.hidden = !settings.touchControls;
}

function fullRender() {
  renderWallet();
  renderStorageStatus();
  renderControlSettings();
  renderOfflineNotice();
  renderPet(elements);
  renderShop(elements.shopList, notify, fullRender);
}

function selectTab(tabName) {
  document.querySelectorAll('[data-tab]').forEach((item) => {
    item.classList.toggle('active', item.dataset.tab === tabName);
  });
  document.querySelectorAll('[data-tab-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.tabPanel !== tabName;
  });
  fullRender();
}

const game = new TetrisGame({
  canvas: elements.gameCanvas,
  nextCanvas: elements.nextCanvas,
  onStats: (stats) => {
    elements.score.textContent = stats.score;
    elements.lines.textContent = stats.lines;
    elements.combo.textContent = stats.combo;
    if (stats.gameOver) {
      elements.gameStatus.textContent = 'Партия закончена';
      elements.startBtn.textContent = 'Снова';
    } else if (stats.paused) {
      elements.gameStatus.textContent = 'Пауза';
      elements.startBtn.textContent = 'Продолжить';
    } else if (stats.running) {
      elements.gameStatus.textContent = 'Игра идёт';
      elements.startBtn.textContent = 'Пауза';
    } else {
      elements.gameStatus.textContent = 'Готов к игре';
      elements.startBtn.textContent = 'Старт';
    }
  },
  onCoins: (_coins, _cleared, multiplier) => {
    haptic(multiplier > 1 ? 'heavy' : 'medium');
    renderWallet();
    renderPet(elements);
  },
  onGameOver: ({ score, lines, coins }) => {
    haptic('heavy');
    renderPet(elements);
    renderWallet();
    elements.lastRunResult.hidden = false;
    elements.lastRunResult.textContent = `Итог партии: +${coins} ◈ · ${lines} линий · ${score} очков.`;
    saveState();
    notify(`Партия закончена. Заработано: ${coins} ◈. Линии: ${lines}. Очки: ${score}.`);
  },
});

elements.startBtn.addEventListener('click', () => {
  haptic('light');
  elements.lastRunResult.hidden = true;
  if (game.running && !game.gameOver) game.togglePause();
  else game.start();
});

elements.resetBtn.addEventListener('click', () => {
  haptic('medium');
  game.reset();
  elements.lastRunResult.hidden = true;
});

function horizontalDirection(rawDirection) {
  const settings = getControlSettings();
  return settings.invertHorizontal ? rawDirection * -1 : rawDirection;
}

document.querySelectorAll('[data-action]').forEach((button) => {
  button.addEventListener('click', () => {
    haptic('light');
    const action = button.dataset.action;
    if (action === 'left') game.move(horizontalDirection(-1));
    if (action === 'right') game.move(horizontalDirection(1));
    if (action === 'rotate') game.rotate();
    if (action === 'down') game.softDrop();
    if (action === 'drop') game.hardDrop();
  });
});

document.addEventListener('keydown', (event) => {
  const target = event.target;
  if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

  const key = event.key.toLowerCase();
  const supportedKeys = ['arrowleft', 'arrowright', 'arrowdown', 'arrowup', ' ', 'spacebar', 'a', 'd', 's', 'w', 'p', 'r'];
  if (!supportedKeys.includes(key)) return;
  event.preventDefault();

  if (key === 'arrowleft' || key === 'a') game.move(horizontalDirection(-1));
  if (key === 'arrowright' || key === 'd') game.move(horizontalDirection(1));
  if (key === 'arrowdown' || key === 's') game.softDrop();
  if (key === 'arrowup' || key === 'w') game.rotate();
  if (key === ' ' || key === 'spacebar') game.hardDrop();
  if (key === 'p') game.togglePause();
  if (key === 'r') {
    game.reset();
    elements.lastRunResult.hidden = true;
  }
});

elements.toggleControlsBtn.addEventListener('click', () => {
  const settings = getControlSettings();
  setControlSetting('showControls', !settings.showControls);
  renderControlSettings();
});

elements.invertControlsBtn.addEventListener('click', () => {
  const settings = getControlSettings();
  setControlSetting('invertHorizontal', !settings.invertHorizontal);
  renderControlSettings();
});

elements.touchControlsBtn.addEventListener('click', () => {
  const settings = getControlSettings();
  setControlSetting('touchControls', !settings.touchControls);
  renderControlSettings();
});

elements.swipeDropBtn.addEventListener('click', () => {
  const settings = getControlSettings();
  setControlSetting('swipeDrop', !settings.swipeDrop);
  renderControlSettings();
});

const touchState = {
  active: false,
  startX: 0,
  startY: 0,
  lastMoveX: 0,
  startedAt: 0,
  horizontalLocked: false,
  movedHorizontally: false,
};

function getPrimaryTouch(event) {
  return event.changedTouches?.[0] || event.touches?.[0] || null;
}

elements.gameCanvas.addEventListener('touchstart', (event) => {
  const settings = getControlSettings();
  if (!settings.touchControls || event.touches.length > 1) return;
  const touch = getPrimaryTouch(event);
  if (!touch) return;
  event.preventDefault();
  touchState.active = true;
  touchState.startX = touch.clientX;
  touchState.startY = touch.clientY;
  touchState.lastMoveX = touch.clientX;
  touchState.startedAt = performance.now();
  touchState.horizontalLocked = false;
  touchState.movedHorizontally = false;
}, { passive: false });

elements.gameCanvas.addEventListener('touchmove', (event) => {
  const settings = getControlSettings();
  if (!touchState.active || !settings.touchControls) return;
  const touch = getPrimaryTouch(event);
  if (!touch) return;
  event.preventDefault();

  const totalDx = touch.clientX - touchState.startX;
  const totalDy = touch.clientY - touchState.startY;
  const absX = Math.abs(totalDx);
  const absY = Math.abs(totalDy);

  if (!touchState.horizontalLocked && absX > 18 && absX > absY * 1.15) {
    touchState.horizontalLocked = true;
  }

  if (!touchState.horizontalLocked) return;

  const rect = elements.gameCanvas.getBoundingClientRect();
  const step = Math.max(22, rect.width / 8.5);
  const diff = touch.clientX - touchState.lastMoveX;
  const moves = Math.trunc(diff / step);

  if (!moves) return;
  const direction = horizontalDirection(Math.sign(moves));
  for (let i = 0; i < Math.min(Math.abs(moves), 3); i += 1) {
    game.move(direction);
  }
  touchState.lastMoveX += moves * step;
  touchState.movedHorizontally = true;
}, { passive: false });

elements.gameCanvas.addEventListener('touchend', (event) => {
  const settings = getControlSettings();
  if (!touchState.active || !settings.touchControls) return;
  const touch = getPrimaryTouch(event);
  if (!touch) return;
  event.preventDefault();

  const dx = touch.clientX - touchState.startX;
  const dy = touch.clientY - touchState.startY;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  const duration = performance.now() - touchState.startedAt;
  const maxDist = Math.max(absX, absY);

  const isTap = maxDist < 18 && duration < 360;
  const isSafeDrop = settings.swipeDrop
    && !touchState.horizontalLocked
    && !touchState.movedHorizontally
    && dy > 96
    && absY > absX * 1.75
    && duration < 900;
  const isSingleHorizontal = !touchState.movedHorizontally && absX > 42 && absX > absY * 1.25;

  if (isTap) {
    game.rotate();
  } else if (isSafeDrop) {
    game.hardDrop();
  } else if (isSingleHorizontal) {
    game.move(horizontalDirection(dx > 0 ? 1 : -1));
  }

  touchState.active = false;
}, { passive: false });

elements.gameCanvas.addEventListener('touchcancel', () => {
  touchState.active = false;
}, { passive: true });

document.querySelector('#feedBtn').addEventListener('click', () => { feedPet(notify); haptic(); fullRender(); });
document.querySelector('#cleanBtn').addEventListener('click', () => { cleanPet(notify); haptic(); fullRender(); });
document.querySelector('#playBtn').addEventListener('click', () => { playWithPet(notify); haptic('medium'); fullRender(); });
document.querySelector('#sleepBtn').addEventListener('click', () => { putPetToSleep(notify); haptic(); fullRender(); });
document.querySelector('#renameBtn').addEventListener('click', () => { handleRename(); fullRender(); });
document.querySelector('#newPetBtn').addEventListener('click', () => {
  startNewPetLife();
  clearOfflineReport();
  haptic('heavy');
  fullRender();
  notify('Новый питомец появился в аквариуме.');
});

document.querySelectorAll('[data-tab]').forEach((tab) => {
  tab.addEventListener('click', () => selectTab(tab.dataset.tab));
});

setInterval(() => {
  const report = tickPetMinute();
  renderPet(elements);
  renderOfflineNotice();
  if (report?.died) {
    selectTab('pet');
    notify(report.message);
  }
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

  const report = getOfflineReport();
  if (report?.message) {
    if (report.died) selectTab('pet');
    notify(report.message);
  }
}

void bootstrap();

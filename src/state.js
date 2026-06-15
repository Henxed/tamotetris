const LOCAL_STORAGE_KEY = 'tetrapet_aquarium_save_v1';
const CLOUD_STORAGE_KEY = 'tetrapet_save_v1';
const CLOUD_VALUE_LIMIT = 4096;
const SAVE_DEBOUNCE_MS = 450;

export const SHOP_ITEMS = [
  {
    id: 'food_flakes',
    title: 'Пиксельные хлопья',
    icon: '🍘',
    price: 6,
    description: '+22 сытости. Базовая еда для питомца.',
    type: 'consumable',
    effect: { hunger: 22, mood: 3 },
  },
  {
    id: 'bubble_toy',
    title: 'Пузырьковая игрушка',
    icon: '🫧',
    price: 12,
    description: '+18 настроения и шанс на Bubble Fever.',
    type: 'consumable',
    effect: { mood: 18, energy: -6, fever: 45 },
  },
  {
    id: 'clean_sponge',
    title: 'Неоновая губка',
    icon: '🧽',
    price: 8,
    description: '+25 чистоты. Аквариум снова сияет.',
    type: 'consumable',
    effect: { clean: 25, mood: 4 },
  },
  {
    id: 'coral_lamp',
    title: 'Коралловая лампа',
    icon: '🪸',
    price: 45,
    description: 'Декор. Настроение питомца медленнее падает.',
    type: 'decor',
    decorSlot: 'coral_lamp',
  },
  {
    id: 'retro_shell',
    title: 'Ретро-ракушка',
    icon: '🐚',
    price: 32,
    description: 'Декор. Даёт +1 монету за тетрис из 4 линий.',
    type: 'decor',
    decorSlot: 'retro_shell',
  },
];

const defaultState = () => ({
  version: 2,
  coins: 0,
  totalCoins: 0,
  score: 0,
  lines: 0,
  games: 0,
  bestScore: 0,
  activeBuff: null,
  buffEndsAt: 0,
  inventory: {
    food_flakes: 2,
    bubble_toy: 0,
    clean_sponge: 1,
  },
  ownedDecor: [],
  pet: {
    name: 'Бульк',
    hunger: 74,
    mood: 72,
    clean: 78,
    energy: 66,
    lastTick: Date.now(),
  },
});

let state = defaultState();
let initialized = false;
let saveTimer = null;
let lastCloudSaveError = null;
let storageMode = 'local';
let cloudAvailable = false;

function getTelegramCloudStorage() {
  const webApp = window.Telegram?.WebApp;
  const cloud = webApp?.CloudStorage;
  const hasApi = typeof cloud?.getItem === 'function' && typeof cloud?.setItem === 'function';
  const versionOk = typeof webApp?.isVersionAtLeast === 'function'
    ? webApp.isVersionAtLeast('6.9')
    : true;

  return hasApi && versionOk ? cloud : null;
}

function cloudGetItem(key) {
  const cloud = getTelegramCloudStorage();
  if (!cloud) return Promise.resolve(null);

  return new Promise((resolve) => {
    cloud.getItem(key, (error, value) => {
      if (error) {
        lastCloudSaveError = String(error);
        resolve(null);
        return;
      }
      resolve(value || null);
    });
  });
}

function cloudSetItem(key, value) {
  const cloud = getTelegramCloudStorage();
  if (!cloud) return Promise.resolve(false);

  return new Promise((resolve) => {
    cloud.setItem(key, value, (error, stored) => {
      if (error) {
        lastCloudSaveError = String(error);
        console.warn('Telegram CloudStorage save failed:', error);
        resolve(false);
        return;
      }
      lastCloudSaveError = null;
      resolve(Boolean(stored));
    });
  });
}

export async function initStateStorage() {
  if (initialized) return state;

  const localRaw = loadRawLocal();
  const cloudRaw = await cloudGetItem(CLOUD_STORAGE_KEY);
  cloudAvailable = Boolean(getTelegramCloudStorage());
  storageMode = cloudAvailable ? 'telegram_cloud' : 'local';

  const loadedRaw = cloudRaw || localRaw;
  state = mergeState(defaultState(), parseSave(loadedRaw));
  applyOfflineDecay(state);
  initialized = true;

  // Если игрок раньше запускал игру вне Telegram, переносим локальный сейв в CloudStorage.
  if (cloudAvailable && !cloudRaw && localRaw) {
    saveState({ immediate: true });
  } else {
    saveState({ localOnly: true });
  }

  return state;
}

function parseSave(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function loadRawLocal() {
  try {
    return localStorage.getItem(LOCAL_STORAGE_KEY);
  } catch {
    return null;
  }
}

function saveRawLocal(raw) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, raw);
  } catch (error) {
    console.warn('localStorage save failed:', error);
  }
}

function mergeState(base, loaded) {
  if (!loaded || typeof loaded !== 'object') return base;
  return {
    ...base,
    ...loaded,
    inventory: { ...base.inventory, ...(loaded.inventory || {}) },
    ownedDecor: Array.isArray(loaded.ownedDecor) ? loaded.ownedDecor : [],
    pet: { ...base.pet, ...(loaded.pet || {}) },
  };
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function applyOfflineDecay(target) {
  const now = Date.now();
  const lastTick = target.pet.lastTick || now;
  const minutes = Math.max(0, Math.floor((now - lastTick) / 60000));
  if (!minutes) return;

  const hasCoral = target.ownedDecor.includes('coral_lamp');
  const moodDrain = hasCoral ? 0.18 : 0.3;

  target.pet.hunger = clamp(target.pet.hunger - minutes * 0.42);
  target.pet.clean = clamp(target.pet.clean - minutes * 0.25);
  target.pet.mood = clamp(target.pet.mood - minutes * moodDrain);
  target.pet.energy = clamp(target.pet.energy + minutes * 0.28);
  target.pet.lastTick = now;
}

function serializeState() {
  return JSON.stringify(state);
}

function scheduleCloudSave(raw) {
  if (!cloudAvailable) return;

  if (raw.length > CLOUD_VALUE_LIMIT) {
    lastCloudSaveError = `Сейв ${raw.length} символов больше лимита Telegram CloudStorage ${CLOUD_VALUE_LIMIT}`;
    console.warn(lastCloudSaveError);
    return;
  }

  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void cloudSetItem(CLOUD_STORAGE_KEY, raw);
  }, SAVE_DEBOUNCE_MS);
}

export function getState() {
  return state;
}

export function getStorageStatus() {
  return {
    initialized,
    mode: storageMode,
    cloudAvailable,
    error: lastCloudSaveError,
  };
}

export function saveState(options = {}) {
  if (!initialized) return Promise.resolve(false);
  state.pet.lastTick = Date.now();
  const raw = serializeState();
  saveRawLocal(raw);

  if (options.localOnly) return Promise.resolve(true);

  if (options.immediate && cloudAvailable) {
    clearTimeout(saveTimer);
    return cloudSetItem(CLOUD_STORAGE_KEY, raw);
  }

  scheduleCloudSave(raw);
  return Promise.resolve(true);
}

export function addCoins(amount) {
  const safeAmount = Math.max(0, Math.floor(amount));
  state.coins += safeAmount;
  state.totalCoins += safeAmount;
  saveState();
  return safeAmount;
}

export function spendCoins(amount) {
  const safeAmount = Math.max(0, Math.floor(amount));
  if (state.coins < safeAmount) return false;
  state.coins -= safeAmount;
  saveState();
  return true;
}

export function mutatePet(delta) {
  state.pet.hunger = clamp(state.pet.hunger + (delta.hunger || 0));
  state.pet.mood = clamp(state.pet.mood + (delta.mood || 0));
  state.pet.clean = clamp(state.pet.clean + (delta.clean || 0));
  state.pet.energy = clamp(state.pet.energy + (delta.energy || 0));
  saveState();
}

export function addInventory(itemId, amount = 1) {
  state.inventory[itemId] = (state.inventory[itemId] || 0) + amount;
  saveState();
}

export function consumeInventory(itemId) {
  if (!state.inventory[itemId]) return false;
  state.inventory[itemId] -= 1;
  saveState();
  return true;
}

export function ownDecor(itemId) {
  if (!state.ownedDecor.includes(itemId)) {
    state.ownedDecor.push(itemId);
    saveState();
  }
}

export function setBuff(type, seconds) {
  state.activeBuff = type;
  state.buffEndsAt = Date.now() + seconds * 1000;
  saveState();
}

export function getActiveBuff() {
  if (!state.activeBuff || Date.now() > state.buffEndsAt) {
    state.activeBuff = null;
    state.buffEndsAt = 0;
    saveState();
  }
  return state.activeBuff;
}

export function recordGame(score, lines) {
  state.games += 1;
  state.score += score;
  state.lines += lines;
  state.bestScore = Math.max(state.bestScore, score);
  saveState({ immediate: true });
}

export function renamePet(name) {
  const cleanName = String(name || '').trim().slice(0, 14);
  if (!cleanName) return;
  state.pet.name = cleanName;
  saveState({ immediate: true });
}

export function tickPetMinute() {
  applyOfflineDecay(state);
  saveState();
}

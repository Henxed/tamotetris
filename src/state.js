const LOCAL_STORAGE_KEY = 'tetrapet_aquarium_save_v1';
const CLOUD_STORAGE_KEY = 'tetrapet_save_v1';
const CLOUD_VALUE_LIMIT = 4096;
const SAVE_DEBOUNCE_MS = 450;

const HOUR = 60 * 60 * 1000;
const DECAY = {
  hungerPerHour: 2.15,
  cleanPerHour: 1.65,
  moodPerHour: 1.35,
  energyRecoverPerHour: 4.4,
  hungerDeathGraceHours: 8,
  cleanDeathGraceHours: 12,
};

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
    description: '+18 настроения и Bubble Fever на 45 секунд.',
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

function createPet() {
  const now = Date.now();
  return {
    name: 'Бульк',
    alive: true,
    bornAt: now,
    diedAt: 0,
    hunger: 74,
    mood: 72,
    clean: 78,
    energy: 66,
    lastTick: now,
    lastSeenAt: now,
  };
}

function defaultState() {
  return {
    version: 3,
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
    settings: {
      showControls: false,
      invertHorizontal: false,
      touchControls: true,
      swipeDrop: true,
    },
    pet: createPet(),
  };
}

let state = defaultState();
let initialized = false;
let saveTimer = null;
let lastCloudSaveError = null;
let storageMode = 'local';
let cloudAvailable = false;
let offlineReport = null;

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
  offlineReport = applyOfflineDecay(state, { reason: 'boot' });
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
  const merged = {
    ...base,
    ...loaded,
    inventory: { ...base.inventory, ...(loaded.inventory || {}) },
    ownedDecor: Array.isArray(loaded.ownedDecor) ? loaded.ownedDecor : [],
    settings: { ...base.settings, ...(loaded.settings || {}) },
    pet: { ...base.pet, ...(loaded.pet || {}) },
  };

  merged.version = 3;
  merged.pet.alive = merged.pet.alive !== false;
  merged.pet.diedAt = Number(merged.pet.diedAt || 0);
  merged.pet.bornAt = Number(merged.pet.bornAt || Date.now());
  merged.pet.lastTick = Number(merged.pet.lastTick || Date.now());
  merged.pet.lastSeenAt = Number(merged.pet.lastSeenAt || merged.pet.lastTick);
  merged.pet.hunger = clamp(merged.pet.hunger);
  merged.pet.mood = clamp(merged.pet.mood);
  merged.pet.clean = clamp(merged.pet.clean);
  merged.pet.energy = clamp(merged.pet.energy);
  return merged;
}

function clamp(value, min = 0, max = 100) {
  const safe = Math.max(min, Math.min(max, Number(value) || 0));
  return Math.round(safe * 100) / 100;
}

function formatDuration(minutes) {
  if (minutes < 60) return `${minutes} мин.`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest ? `${hours} ч ${rest} мин.` : `${hours} ч`;
  const days = Math.floor(hours / 24);
  const dayHours = hours % 24;
  return dayHours ? `${days} д ${dayHours} ч` : `${days} д`;
}

function timeToZeroHours(value, drainPerHour) {
  if (value <= 0) return 0;
  return value / Math.max(0.0001, drainPerHour);
}

function applyOfflineDecay(target, options = {}) {
  const now = Date.now();
  const pet = target.pet;
  const lastTick = pet.lastTick || now;
  const elapsedMs = Math.max(0, now - lastTick);
  const elapsedMinutes = Math.floor(elapsedMs / 60000);
  if (!elapsedMinutes) {
    pet.lastSeenAt = now;
    return null;
  }

  const report = {
    reason: options.reason || 'tick',
    minutes: elapsedMinutes,
    durationText: formatDuration(elapsedMinutes),
    died: false,
    critical: false,
    message: '',
  };

  if (!pet.alive) {
    pet.lastTick = now;
    pet.lastSeenAt = now;
    report.critical = true;
    report.message = 'Питомец уже не жив. Можно начать новую жизнь.';
    return report;
  }

  const hours = elapsedMs / HOUR;
  const hasCoral = target.ownedDecor.includes('coral_lamp');
  const moodDrain = hasCoral ? DECAY.moodPerHour * 0.62 : DECAY.moodPerHour;
  const before = {
    hunger: pet.hunger,
    clean: pet.clean,
    mood: pet.mood,
    energy: pet.energy,
  };

  const hungerDeathAt = timeToZeroHours(before.hunger, DECAY.hungerPerHour) + DECAY.hungerDeathGraceHours;
  const cleanDeathAt = timeToZeroHours(before.clean, DECAY.cleanPerHour) + DECAY.cleanDeathGraceHours;

  pet.hunger = clamp(before.hunger - hours * DECAY.hungerPerHour);
  pet.clean = clamp(before.clean - hours * DECAY.cleanPerHour);
  pet.mood = clamp(before.mood - hours * moodDrain);
  pet.energy = clamp(before.energy + hours * DECAY.energyRecoverPerHour);
  pet.lastTick = now;
  pet.lastSeenAt = now;

  const diedFromHunger = hours >= hungerDeathAt;
  const diedFromClean = hours >= cleanDeathAt;
  if (diedFromHunger || diedFromClean) {
    pet.alive = false;
    pet.diedAt = now;
    pet.hunger = 0;
    pet.mood = 0;
    pet.clean = 0;
    pet.energy = 0;
    report.died = true;
    report.critical = true;
    report.message = `Пока тебя не было ${report.durationText}, питомец не выдержал. Можно начать новую жизнь.`;
    return report;
  }

  report.critical = pet.hunger < 25 || pet.clean < 25 || pet.mood < 25;
  if (report.critical) {
    report.message = `Пока тебя не было ${report.durationText}, питомец сильно соскучился. Проверь еду, воду и настроение.`;
  } else if (elapsedMinutes >= 120) {
    report.message = `Пока тебя не было ${report.durationText}, питомец жил своей жизнью. Характеристики пересчитаны.`;
  }

  return report.message ? report : null;
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

export function getOfflineReport() {
  return offlineReport;
}

export function clearOfflineReport() {
  offlineReport = null;
}

export function saveState(options = {}) {
  if (!initialized) return Promise.resolve(false);
  if (state.pet) {
    const now = Date.now();
    state.pet.lastTick = now;
    state.pet.lastSeenAt = now;
  }
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
  if (!state.pet.alive) return false;
  state.pet.hunger = clamp(state.pet.hunger + (delta.hunger || 0));
  state.pet.mood = clamp(state.pet.mood + (delta.mood || 0));
  state.pet.clean = clamp(state.pet.clean + (delta.clean || 0));
  state.pet.energy = clamp(state.pet.energy + (delta.energy || 0));
  saveState();
  return true;
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
  if (!state.activeBuff) return null;
  if (Date.now() > state.buffEndsAt) {
    state.activeBuff = null;
    state.buffEndsAt = 0;
    saveState();
    return null;
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

export function getControlSettings() {
  return state.settings;
}

export function setControlSetting(key, value) {
  if (!(key in state.settings)) return;
  state.settings[key] = Boolean(value);
  saveState();
}

export function startNewPetLife() {
  const name = state.pet.name || 'Бульк';
  state.pet = createPet();
  state.pet.name = name;
  state.inventory = {
    food_flakes: 2,
    bubble_toy: 0,
    clean_sponge: 1,
  };
  state.ownedDecor = [];
  state.activeBuff = null;
  state.buffEndsAt = 0;
  offlineReport = {
    minutes: 0,
    durationText: '',
    died: false,
    critical: false,
    message: 'Новый питомец появился в аквариуме.',
  };
  saveState({ immediate: true });
}

export function tickPetMinute() {
  const report = applyOfflineDecay(state, { reason: 'tick' });
  if (report?.died) offlineReport = report;
  saveState();
  return report;
}

import {
  SHOP_ITEMS,
  addInventory,
  consumeInventory,
  getState,
  mutatePet,
  ownDecor,
  renamePet,
  saveState,
  setBuff,
  spendCoins,
} from './state.js';

const thoughts = {
  happy: ['бульк-бульк! ещё тетрис?', 'аквариум сияет!', 'мне нравится этот телефон'],
  hungry: ['хочу хлопьев...', 'животик урчит', 'купи еду за монетки'],
  dirty: ['стекло мутное...', 'нужна губка', 'я хочу чистую воду'],
  tired: ['я немного посплю', 'энергии мало', 'приглуши лампу...'],
  bored: ['давай игрушку?', 'очисти 2 линии!', 'мне скучно без комбо'],
};

export function renderPet(elements) {
  const state = getState();
  const pet = state.pet;

  elements.petName.textContent = pet.name;
  elements.hunger.value = pet.hunger;
  elements.mood.value = pet.mood;
  elements.clean.value = pet.clean;
  elements.energy.value = pet.energy;
  elements.hungerText.textContent = pet.hunger;
  elements.moodText.textContent = pet.mood;
  elements.cleanText.textContent = pet.clean;
  elements.energyText.textContent = pet.energy;

  elements.petSprite.classList.toggle('sad', pet.hunger < 30 || pet.mood < 30 || pet.clean < 25);
  elements.petSprite.classList.toggle('sleepy', pet.energy < 24);
  elements.petThought.textContent = pickThought(pet);

  elements.decorOne.style.display = state.ownedDecor.includes('coral_lamp') ? 'block' : 'none';
  elements.decorTwo.style.display = state.ownedDecor.includes('retro_shell') ? 'block' : 'none';
}

function pickThought(pet) {
  let pool = thoughts.happy;
  if (pet.hunger < 35) pool = thoughts.hungry;
  else if (pet.clean < 35) pool = thoughts.dirty;
  else if (pet.energy < 25) pool = thoughts.tired;
  else if (pet.mood < 45) pool = thoughts.bored;
  return pool[Math.floor(Date.now() / 5000) % pool.length];
}

export function feedPet(notify) {
  const item = SHOP_ITEMS.find((entry) => entry.id === 'food_flakes');
  if (!consumeInventory(item.id)) {
    notify('Нет еды. Купи хлопья в магазине.');
    return;
  }
  mutatePet(item.effect);
  notify('Питомец съел хлопья.');
}

export function cleanPet(notify) {
  const item = SHOP_ITEMS.find((entry) => entry.id === 'clean_sponge');
  if (!consumeInventory(item.id)) {
    notify('Нет губки. Купи её в магазине.');
    return;
  }
  mutatePet(item.effect);
  notify('Аквариум почищен.');
}

export function playWithPet(notify) {
  const item = SHOP_ITEMS.find((entry) => entry.id === 'bubble_toy');
  if (!consumeInventory(item.id)) {
    notify('Нет игрушки. Купи пузырьковую игрушку.');
    return;
  }
  mutatePet(item.effect);
  setBuff('bubble_fever', item.effect.fever);
  notify('Bubble Fever включён: монеты за линии временно x2.');
}

export function putPetToSleep(notify) {
  mutatePet({ energy: 24, hunger: -4, mood: 3 });
  notify('Питомец отдохнул.');
}

export function handleRename() {
  const state = getState();
  const nextName = prompt('Имя питомца', state.pet.name);
  if (nextName === null) return;
  renamePet(nextName);
}

export function renderShop(list, notify, onChanged) {
  const state = getState();
  const template = document.querySelector('#shopItemTemplate');
  list.innerHTML = '';

  SHOP_ITEMS.forEach((item) => {
    const node = template.content.cloneNode(true);
    const article = node.querySelector('.shop-item');
    const icon = node.querySelector('.item-icon');
    const title = node.querySelector('h3');
    const desc = node.querySelector('p');
    const button = node.querySelector('button');

    icon.textContent = item.icon;
    title.textContent = item.title;

    const owned = state.ownedDecor.includes(item.id);
    const inBag = state.inventory[item.id] || 0;
    desc.textContent = item.type === 'decor'
      ? item.description
      : `${item.description} В рюкзаке: ${inBag}`;
    button.textContent = owned ? 'Есть' : `${item.price} ◈`;
    button.disabled = owned;

    article.dataset.itemId = item.id;
    button.addEventListener('click', () => {
      if (!spendCoins(item.price)) {
        notify('Не хватает монет. Сыграй ещё партию.');
        return;
      }
      if (item.type === 'decor') {
        ownDecor(item.id);
        notify(`Куплено: ${item.title}`);
      } else {
        addInventory(item.id, 1);
        notify(`В рюкзак добавлено: ${item.title}`);
      }
      renderShop(list, notify, onChanged);
      onChanged?.();
      saveState();
    });

    list.appendChild(node);
  });
}

// «Вечер игр» — общий, разделяемый между ВСЕМИ мини-играми реестр очков.
// Не завязан ни на один namespace: любая игра при создании комнаты может
// использовать код существующей "вечеринки" как свой код комнаты (так один
// и тот же код работает во всех играх подряд), и в конце сообщает сюда, кто
// сколько очков заработал в этом раунде — эти очки складываются в общий
// зачёт вечера.
//
// Игроки идентифицируются по имени (сравнение без учёта регистра и
// пробелов по краям) — полноценных аккаунтов на сайте нет, имя лучшее, что
// есть в наличии. Если два разных человека в компании назовутся одинаково,
// их очки объединятся — сознательный компромисс ради простоты.

const PARTY_TTL_MS = 6 * 60 * 60 * 1000; // забываем "вечеринку", если ей не пользовались 6 часов
const parties = new Map(); // code -> { scores: Map(nameKey -> {name, avatar, total}), lastGame, updatedAt }

function nameKey(name) {
  return (name || '').trim().toLowerCase();
}

function touch(party) {
  party.updatedAt = Date.now();
}

function sweep() {
  const now = Date.now();
  for (const [code, party] of parties) {
    if (now - party.updatedAt > PARTY_TTL_MS) parties.delete(code);
  }
}

function ensureParty(code) {
  sweep();
  if (!code) return null;
  const key = code.toUpperCase().trim();
  if (!key) return null;
  let party = parties.get(key);
  if (!party) {
    party = { code: key, scores: new Map(), lastGame: null, updatedAt: Date.now() };
    parties.set(key, party);
  }
  touch(party);
  return party;
}

function hasParty(code) {
  if (!code) return false;
  return parties.has(code.toUpperCase().trim());
}

// contributions: [{ name, avatar, points }]
function recordResult(code, gameKey, contributions) {
  const party = ensureParty(code);
  if (!party) return null;
  party.lastGame = gameKey;
  (contributions || []).forEach(({ name, avatar, points }) => {
    const key = nameKey(name);
    if (!key || !Number.isFinite(points)) return;
    const existing = party.scores.get(key);
    if (existing) {
      existing.total += points;
      if (avatar) existing.avatar = avatar;
      existing.name = name.trim();
    } else {
      party.scores.set(key, { name: name.trim(), avatar: avatar || '🙂', total: points });
    }
  });
  touch(party);
  return getStandings(code);
}

function getStandings(code) {
  const party = code ? parties.get(code.toUpperCase().trim()) : null;
  if (!party) return [];
  return Array.from(party.scores.values())
    .map(p => ({ name: p.name, avatar: p.avatar, total: p.total }))
    .sort((a, b) => b.total - a.total);
}

module.exports = { ensureParty, hasParty, recordResult, getStandings };

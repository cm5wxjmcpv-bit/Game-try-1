const SAVE_KEY = 'pixel_engine_save_v2';
const LEGACY_SAVE_KEY = 'pixel_engine_save_v1';

export function saveGame(snapshot) {
  try {
    if (!isPlainObject(snapshot)) {
      console.warn('[saveSystem] Refusing to save invalid snapshot shape.');
      return;
    }

    localStorage.setItem(SAVE_KEY, JSON.stringify(withSaveMetadata(snapshot)));
  } catch (error) {
    console.warn('[saveSystem] Failed to write save data.', error);
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY) || localStorage.getItem(LEGACY_SAVE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const payload = unwrapSavePayload(parsed);
    const normalized = normalizeSnapshot(payload);

    if (!normalized) {
      console.warn('[saveSystem] Save data failed validation. Falling back to null.');
      return null;
    }

    return normalized;
  } catch (error) {
    console.warn('[saveSystem] Failed to load save data.', error);
    return null;
  }
}

function unwrapSavePayload(parsed) {
  if (!isPlainObject(parsed)) {
    console.warn('[saveSystem] Parsed save is not an object.');
    return null;
  }

  // v2 wrapper format: { version, checkpointAt, payload }
  if ('payload' in parsed) {
    if (!isPlainObject(parsed.payload)) {
      console.warn('[saveSystem] Save wrapper payload is invalid.');
      return null;
    }
    return parsed.payload;
  }

  // v1 compatibility path: raw snapshot object
  return parsed;
}

function validateSnapshot(snapshot) {
  if (!isPlainObject(snapshot)) {
    console.warn('[saveSystem] Snapshot is not an object.');
    return false;
  }

  if (typeof snapshot.currentTownId !== 'string') {
    console.warn('[saveSystem] Snapshot is missing a valid currentTownId.');
    return false;
  }

  if (!isPlainObject(snapshot.player)) {
    console.warn('[saveSystem] Snapshot is missing a valid player object.');
    return false;
  }

  if (!isPlainObject(snapshot.player.stats)) {
    console.warn('[saveSystem] Player stats are missing or invalid.');
    return false;
  }

  return true;
}

function normalizeSnapshot(snapshot) {
  if (!validateSnapshot(snapshot)) return null;

  const normalizedPlayer = {
    ...snapshot.player,
    unlocks: Array.isArray(snapshot.player.unlocks) ? snapshot.player.unlocks : [],
    completedLevels: Array.isArray(snapshot.player.completedLevels)
      ? snapshot.player.completedLevels
      : [],
    effects: Array.isArray(snapshot.player.effects) ? snapshot.player.effects : [],
    cooldowns: isPlainObject(snapshot.player.cooldowns) ? snapshot.player.cooldowns : {},
  };

  return {
    ...snapshot,
    player: normalizedPlayer,
  };
}

function withSaveMetadata(payload) {
  return {
    version: 2,
    checkpointAt: new Date().toISOString(),
    payload,
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function exportSaveAdapter(snapshot) {
  // Future cloud hook (Google Sheets / API).
  return withSaveMetadata(snapshot);
}

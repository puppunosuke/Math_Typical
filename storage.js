// ============================================================
//  Math_Typical - 進捗・メモのストレージ層
//
//  経路: Firebase ログイン必須（自分専用、ログインしないと使えない）
//
//  データモデル（Firestore の /users/{uid}/data/main に1ドキュメント）:
//    {
//      progress: {
//        "<N>": {
//          status: "untouched" | "solved" | "review" | "mastered",
//          memos: [{ at: ISO文字列, text: string }]  // 古い順に積む
//        }
//      },
//      filters: { difficulty: number[], audience: string[], chapter: string[] },
//      lastViewed: number  // 最後に開いた問題番号
//    }
// ============================================================
const STATUS = {
  UNTOUCHED: "untouched",
  SOLVED: "solved",
  REVIEW: "review",
  MASTERED: "mastered",
};

const DEFAULTS = {
  progress: {},
  filters: { difficulty: [1, 2, 3], audience: ["文理共通", "理系のみ"], chapter: [] },
  lastViewed: null,
};

let currentUser = null;
let cache = null;
let resolveAuthReady;
const authReady = new Promise((r) => { resolveAuthReady = r; });

function setupFirebase() {
  window.MathTypical.firebase.watchAuthState((user) => {
    const changed = (currentUser?.uid ?? null) !== (user?.uid ?? null);
    currentUser = user;
    if (changed) cache = null;
    resolveAuthReady();
  });
}

if (window.MathTypical && window.MathTypical.firebase) {
  setupFirebase();
} else {
  window.addEventListener("MathTypical:firebase-ready", setupFirebase, { once: true });
}

async function loadCache() {
  if (cache !== null) return cache;
  await authReady;
  if (!currentUser) return null; // ログインしてない
  const cloud = await window.MathTypical.firebase.loadCloud(currentUser.uid);
  if (cloud) {
    cache = { ...structuredClone(DEFAULTS), ...cloud };
  } else {
    cache = structuredClone(DEFAULTS);
    await window.MathTypical.firebase.saveCloud(currentUser.uid, cache);
  }
  return cache;
}

async function saveCache() {
  if (!currentUser) return;
  await window.MathTypical.firebase.saveCloud(currentUser.uid, cache);
}

// --- 公開 API ---

export const Status = STATUS;

export async function isReady() {
  await authReady;
  return !!currentUser;
}

export function getUser() {
  return currentUser;
}

/**
 * 全進捗データを取得
 */
export async function getAll() {
  return await loadCache();
}

/**
 * 1問の進捗を取得（未着手なら新規オブジェクトを返す。状態書き込みは別途）
 */
export async function getProgress(n) {
  const c = await loadCache();
  if (!c) return null;
  return c.progress[n] ?? { status: STATUS.UNTOUCHED, memos: [] };
}

/**
 * 問題N のステータスを変更
 */
export async function setStatus(n, status) {
  const c = await loadCache();
  if (!c) return;
  if (!c.progress[n]) c.progress[n] = { status: STATUS.UNTOUCHED, memos: [] };
  c.progress[n].status = status;
  await saveCache();
}

/**
 * 問題N にメモを追加（履歴に積む）
 */
export async function appendMemo(n, text) {
  const c = await loadCache();
  if (!c) return;
  if (!c.progress[n]) c.progress[n] = { status: STATUS.UNTOUCHED, memos: [] };
  c.progress[n].memos.push({ at: new Date().toISOString(), text });
  await saveCache();
}

/**
 * フィルター設定を更新
 */
export async function setFilters(filters) {
  const c = await loadCache();
  if (!c) return;
  c.filters = { ...c.filters, ...filters };
  await saveCache();
}

export async function getFilters() {
  const c = await loadCache();
  return c?.filters ?? structuredClone(DEFAULTS.filters);
}

/**
 * 最後に閲覧した問題番号を記録
 */
export async function setLastViewed(n) {
  const c = await loadCache();
  if (!c) return;
  c.lastViewed = n;
  await saveCache();
}

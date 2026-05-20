// ============================================================
//  Math_Typical - アプリ本体
//
//  ビュー切替（login / chapters / problems / detail）、
//  problems.json の読み込み、Firestore 同期と UI 描画を統括する。
// ============================================================
import {
  Status, isReady, getUser, getProgress, setStatus, appendMemo,
  setFilters, getFilters, setLastViewed,
} from "./storage.js";

const STATUS_LABEL = {
  [Status.UNTOUCHED]: "未着手",
  [Status.SOLVED]: "解いた",
  [Status.REVIEW]: "復習中",
  [Status.MASTERED]: "マスター",
};
const STATUS_ICON = {
  [Status.UNTOUCHED]: "·",
  [Status.SOLVED]: "✓",
  [Status.REVIEW]: "↻",
  [Status.MASTERED]: "★",
};
const DIFFICULTY_LABEL = { 1: "★☆☆", 2: "★★☆", 3: "★★★" };

let problems = [];     // problems.json の中身
let currentChapter = null; // 開いている単元 ID
let currentProblemN = null; // 開いている問題番号
let imageURLCache = new Map(); // subpath → DataURL（Storage 取得結果のキャッシュ）

// --- ビュー切替 ---
const VIEWS = ["loginView", "chaptersView", "problemsView", "detailView"];
function showView(id) {
  for (const v of VIEWS) {
    document.getElementById(v).classList.toggle("active", v === id);
  }
}

// --- データロード ---
async function loadProblems() {
  const res = await fetch("./data/problems.json");
  problems = await res.json();
}

// --- 画像URL取得（メモリキャッシュ付き）---
async function getImageURL(subpath) {
  if (imageURLCache.has(subpath)) return imageURLCache.get(subpath);
  const user = getUser();
  if (!user) return null;
  const url = await window.MathTypical.firebase.getImageURL(user.uid, subpath);
  imageURLCache.set(subpath, url);
  return url;
}

// ===== 単元一覧 =====
async function renderChapters() {
  const all = problems;
  // chapter_id ごとに集計
  const byCh = new Map();
  for (const p of all) {
    if (!byCh.has(p.chapter_id)) byCh.set(p.chapter_id, { name: p.chapter_name, items: [] });
    byCh.get(p.chapter_id).items.push(p);
  }
  // 単元別の進捗カウント取得
  const counts = {};
  for (const [cid, _] of byCh) counts[cid] = { solved: 0, review: 0, mastered: 0 };
  for (const p of all) {
    const pr = await getProgress(p.n);
    if (pr && counts[p.chapter_id][pr.status] !== undefined) counts[p.chapter_id][pr.status]++;
  }

  const list = document.getElementById("chapterList");
  list.innerHTML = "";
  const sortedKeys = [...byCh.keys()].sort((a, b) => {
    const [a1, a2] = a.split(".").map(Number);
    const [b1, b2] = b.split(".").map(Number);
    return a1 - b1 || a2 - b2;
  });
  for (const cid of sortedKeys) {
    const { name, items } = byCh.get(cid);
    const c = counts[cid];
    const card = document.createElement("div");
    card.className = "chapter-card";
    card.innerHTML = `
      <span class="chapter-name">${cid} ${name}</span>
      <span class="chapter-meta">
        <span>${items.length}問</span>
        <span style="color:var(--green)">✓${c.solved}</span>
        <span style="color:var(--purple)">↻${c.review}</span>
        <span style="color:var(--gold)">★${c.mastered}</span>
      </span>
    `;
    card.addEventListener("click", () => openChapter(cid));
    list.appendChild(card);
  }
}

// ===== 問題一覧 =====
async function openChapter(cid) {
  currentChapter = cid;
  showView("problemsView");
  const items = problems.filter(p => p.chapter_id === cid);
  document.getElementById("problemsTitle").textContent =
    `${cid} ${items[0].chapter_name}（${items.length}問）`;
  await renderFilterChips();
  await renderProblems();
}

async function renderFilterChips() {
  const filters = await getFilters();
  for (const chip of document.querySelectorAll(".chip[data-filter]")) {
    const key = chip.dataset.filter;
    const value = chip.dataset.value;
    // difficulty は数値、audience は文字列
    const v = key === "difficulty" ? Number(value) : value;
    chip.classList.toggle("active", filters[key].includes(v));
    chip.onclick = async () => {
      const f = await getFilters();
      const arr = f[key];
      const idx = arr.indexOf(v);
      if (idx >= 0) arr.splice(idx, 1); else arr.push(v);
      await setFilters({ [key]: arr });
      await renderFilterChips();
      await renderProblems();
    };
  }
}

async function renderProblems() {
  const filters = await getFilters();
  const items = problems
    .filter(p => p.chapter_id === currentChapter)
    .filter(p => filters.difficulty.includes(p.difficulty))
    .filter(p => filters.audience.includes(p.audience));

  const list = document.getElementById("problemList");
  list.innerHTML = "";
  if (items.length === 0) {
    list.innerHTML = `<p style="color:var(--text-mid); text-align:center; padding:1rem">条件に合う問題がないよ〜</p>`;
    return;
  }
  for (const p of items) {
    const pr = await getProgress(p.n);
    const row = document.createElement("div");
    row.className = "problem-row";
    row.dataset.status = pr.status;
    row.innerHTML = `
      <span class="problem-n">#${p.n}</span>
      <span class="problem-tags">
        <span>${p.subject}</span>
        <span>${DIFFICULTY_LABEL[p.difficulty]}</span>
        <span>${p.audience}</span>
      </span>
      <span class="status-icon">${STATUS_ICON[pr.status]}</span>
    `;
    row.addEventListener("click", () => openProblem(p.n));
    list.appendChild(row);
  }
}

// ===== 問題詳細 =====
async function openProblem(n) {
  currentProblemN = n;
  await setLastViewed(n);
  showView("detailView");
  const p = problems.find(x => x.n === n);
  document.getElementById("detailTitle").textContent = `問題 ${p.n}`;
  document.getElementById("detailMeta").innerHTML = `
    <span>${p.chapter_id} ${p.chapter_name}</span>
    <span>${p.subject}</span>
    <span>${DIFFICULTY_LABEL[p.difficulty]}</span>
    <span>${p.audience}</span>
    <span style="color:var(--text-mid)">T${p.t_number}</span>
  `;

  // 問題画像
  const qImg = document.getElementById("detailImage");
  qImg.src = "";
  qImg.alt = "読み込み中...";
  try {
    qImg.src = await getImageURL(`questions/q-${String(n).padStart(3, "0")}.jpg`);
  } catch (err) {
    qImg.alt = "画像取得エラー: " + err.message;
  }

  // ステータス
  const pr = await getProgress(n);
  for (const btn of document.querySelectorAll(".status-btn")) {
    btn.classList.toggle("active", btn.dataset.status === pr.status);
  }

  // メモ入力欄は空にして、過去メモは隠す（解いている時には見せない）
  document.getElementById("memoInput").value = "";
  document.getElementById("memoHistory").classList.add("hidden");
  document.getElementById("memoToggleHistoryBtn").textContent = "過去のメモを見る";
}

async function onStatusClick(status) {
  if (currentProblemN == null) return;
  await setStatus(currentProblemN, status);
  for (const btn of document.querySelectorAll(".status-btn")) {
    btn.classList.toggle("active", btn.dataset.status === status);
  }
}

async function onMemoSave() {
  if (currentProblemN == null) return;
  const input = document.getElementById("memoInput");
  const text = input.value.trim();
  if (!text) return;
  await appendMemo(currentProblemN, text);
  input.value = "";
  // 保存後すぐ履歴は開かない（解いてる時には見えない方針を維持）
}

async function onMemoToggleHistory() {
  const box = document.getElementById("memoHistory");
  const btn = document.getElementById("memoToggleHistoryBtn");
  if (box.classList.contains("hidden")) {
    const pr = await getProgress(currentProblemN);
    if (pr.memos.length === 0) {
      box.innerHTML = `<p style="color:var(--text-mid)">過去のメモはまだないよ〜</p>`;
    } else {
      // 新しい順
      const entries = [...pr.memos].reverse().map(m => `
        <div class="memo-entry">
          <div class="at">${new Date(m.at).toLocaleString("ja-JP")}</div>
          <div class="text">${escapeHtml(m.text)}</div>
        </div>
      `).join("");
      box.innerHTML = `<details open><summary>${pr.memos.length}件のメモ</summary>${entries}</details>`;
    }
    box.classList.remove("hidden");
    btn.textContent = "過去のメモを隠す";
  } else {
    box.classList.add("hidden");
    btn.textContent = "過去のメモを見る";
  }
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

// ===== 解答モーダル（複数ページ対応）=====
async function onShowAnswer() {
  if (currentProblemN == null) return;
  const p = problems.find(x => x.n === currentProblemN);
  if (!p.answer_page) return;
  const modal = document.getElementById("answerModal");
  const container = document.getElementById("answerImagesContainer");
  container.innerHTML = `<p style="padding:1rem; color:var(--text-mid)">読み込み中...</p>`;
  modal.classList.add("active");

  // answer_page 〜 answer_end_page の画像を順に並べる
  const start = p.answer_page;
  const end = p.answer_end_page ?? p.answer_page;
  container.innerHTML = "";
  for (let pg = start; pg <= end; pg++) {
    const subpath = `answers/page-${String(pg).padStart(3, "0")}.jpg`;
    const img = document.createElement("img");
    img.className = "answer-image";
    img.alt = `解答 P${pg}`;
    container.appendChild(img);
    try {
      img.src = await getImageURL(subpath);
    } catch (err) {
      const errP = document.createElement("p");
      errP.style.padding = "0.5rem";
      errP.style.color = "var(--red)";
      errP.textContent = `画像エラー (P${pg}): ${err.message}`;
      img.replaceWith(errP);
    }
  }
}

function onCloseAnswer() {
  document.getElementById("answerModal").classList.remove("active");
}

// ===== 認証状態に応じてUI切替 =====
async function refreshAuth() {
  const accountStatus = document.getElementById("accountStatus");
  const accountBtn = document.getElementById("accountBtn");
  if (await isReady()) {
    const user = getUser();
    accountStatus.textContent = "👤";
    accountBtn.title = `ログイン中: ${user.email}（クリックでログアウト）`;
    await loadProblems();
    showView("chaptersView");
    await renderChapters();
  } else {
    accountStatus.textContent = "🔑";
    accountBtn.title = "ログイン";
    showView("loginView");
  }
}

// ===== イベント配線 =====
function wireEvents() {
  document.getElementById("loginBtn").addEventListener("click", async () => {
    try { await window.MathTypical.firebase.signInWithGoogle(); location.reload(); }
    catch (err) {
      if (err.code === "auth/popup-closed-by-user") return;
      alert("ログイン失敗: " + err.message);
    }
  });
  document.getElementById("accountBtn").addEventListener("click", async () => {
    if (getUser()) {
      if (confirm("ログアウトしますか？")) {
        await window.MathTypical.firebase.signOutUser();
        location.reload();
      }
    } else {
      await window.MathTypical.firebase.signInWithGoogle().catch(() => {});
      location.reload();
    }
  });

  document.getElementById("backToChapters").addEventListener("click", async () => {
    showView("chaptersView");
    await renderChapters();
  });
  document.getElementById("backToProblems").addEventListener("click", async () => {
    showView("problemsView");
    await renderProblems();
  });

  for (const btn of document.querySelectorAll(".status-btn")) {
    btn.addEventListener("click", () => onStatusClick(btn.dataset.status));
  }
  document.getElementById("memoSaveBtn").addEventListener("click", onMemoSave);
  document.getElementById("memoToggleHistoryBtn").addEventListener("click", onMemoToggleHistory);
  document.getElementById("showAnswerBtn").addEventListener("click", onShowAnswer);
  document.getElementById("closeAnswerBtn").addEventListener("click", onCloseAnswer);
  document.getElementById("answerModal").addEventListener("click", (e) => {
    if (e.target.id === "answerModal") onCloseAnswer();
  });
}

// ===== エントリポイント =====
async function main() {
  wireEvents();
  // 認証状態の監視で UI を再構築
  window.MathTypical.firebase.watchAuthState(() => refreshAuth());
}

main();

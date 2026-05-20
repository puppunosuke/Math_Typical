// ============================================================
//  Math_Typical - Firebase 初期化（ウェブ版）
//
//  Firebase JS SDK を CDN から ESM 読み込み、
//  認証・Firestore・Storage のヘルパーを window.MathTypical.firebase に公開。
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyBHpJ_kCqyBeeKyAYW7lyXqQnaOahO42Gw",
  authDomain: "punoji-mathtypical.firebaseapp.com",
  projectId: "punoji-mathtypical",
  storageBucket: "punoji-mathtypical.firebasestorage.app",
  messagingSenderId: "765771675549",
  appId: "1:765771675549:web:6f1fc988d556e7f8676174",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const provider = new GoogleAuthProvider();

window.MathTypical = window.MathTypical || {};

window.MathTypical.firebase = {
  // --- 認証 ---
  signInWithGoogle: () => signInWithPopup(auth, provider),
  signOutUser: () => signOut(auth),
  watchAuthState: (callback) => onAuthStateChanged(auth, callback),
  getCurrentUser: () => auth.currentUser,

  // --- Firestore: 全データを1ドキュメントに（同じ思想を Math_Typical でも踏襲）---
  // パス: /users/{uid}/data/main
  loadCloud: async (uid) => {
    const ref = doc(db, "users", uid, "data", "main");
    const snap = await getDoc(ref);
    return snap.exists() ? snap.data() : null;
  },
  saveCloud: async (uid, data) => {
    const ref = doc(db, "users", uid, "data", "main");
    await setDoc(ref, data);
  },

  // --- Storage: 画像のアップロード／URL取得 ---
  // subpath にサブディレクトリ（例: "questions/q-001.jpg"）を含めて呼ぶ
  uploadImage: async (uid, subpath, file) => {
    const r = storageRef(storage, `users/${uid}/images/${subpath}`);
    await uploadBytes(r, file);
  },
  getImageURL: async (uid, subpath) => {
    const r = storageRef(storage, `users/${uid}/images/${subpath}`);
    return getDownloadURL(r);
  },
};

window.dispatchEvent(new Event("MathTypical:firebase-ready"));

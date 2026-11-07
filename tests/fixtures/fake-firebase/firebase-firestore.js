import g from './shared.js';
const clone = o => JSON.parse(JSON.stringify(o));
export const persistentLocalCache = o => o, persistentMultipleTabManager = () => ({});
export function initializeFirestore(app) { return { app }; }
export function getFirestore(app) { return { app }; }
export function doc(db, ...parts) { return { kind: 'doc', path: parts.join('/'), id: parts[parts.length - 1] }; }
export function collection(db, ...parts) { return { kind: 'col', path: parts.join('/') }; }
const later = fn => new Promise(res => setTimeout(() => { fn(); res(); }, 20));
// Like the real rules, a shared deck can only be changed or removed by the account that shared it.
const notYours = ref => ref.path.startsWith('shares/') && g.store[ref.path] && (!g.user || g.store[ref.path].owner !== g.user.uid);
const denied = () => Promise.reject(Object.assign(new Error('permission-denied'), { code: 'permission-denied' }));
export function setDoc(ref, data) { if (notYours(ref)) return denied(); return later(() => { g.store[ref.path] = clone(data); g.save(); g.notify(); }); }
export function deleteDoc(ref) { if (notYours(ref)) return denied(); return later(() => { delete g.store[ref.path]; g.save(); g.notify(); }); }
// Several writes that land together, as one change.
export function writeBatch() {
  const ops = [];
  const batch = {
    set(ref, data) { ops.push([ref.path, clone(data)]); return batch; },
    delete(ref) { ops.push([ref.path, undefined]); return batch; },
    commit() { g.writes = (g.writes || 0) + ops.length; return later(() => { for (const [p, v] of ops) { if (v === undefined) delete g.store[p]; else g.store[p] = v; } g.save(); g.notify(); }); },
  };
  return batch;
}
const meta = { fromCache: false, hasPendingWrites: false };
const docSnap = (id, data) => ({ id, exists: () => data !== undefined, data: () => (data === undefined ? undefined : clone(data)), metadata: meta });
// One read of one record. The stand-in for the database rules: signed out, only shared decks can be read.
export function getDoc(ref) {
  return new Promise((res, rej) => setTimeout(() => {
    if (!g.user && !ref.path.startsWith('shares/')) return rej(Object.assign(new Error('permission-denied'), { code: 'permission-denied' }));
    g.reads = (g.reads || 0) + 1; res(docSnap(ref.id, g.store[ref.path]));
  }, 20));
}
export function onSnapshot(ref, opts, next) {
  if (typeof opts === 'function') next = opts;
  let prev = null;
  const listener = { check() {
    if (ref.kind === 'doc') {
      const cur = g.store[ref.path]; const s = JSON.stringify(cur);
      if (prev !== null && prev === s) return; prev = s;
      g.reads = (g.reads || 0) + 1; // what Firestore would bill as reads
      next(docSnap(ref.id, cur));
      return;
    }
    const depth = ref.path.split('/').length + 1;
    const now = {};
    for (const [p, v] of Object.entries(g.store)) if (p.startsWith(ref.path + '/') && p.split('/').length === depth) now[p.split('/').pop()] = JSON.stringify(v);
    const before = prev || {}; const changes = [];
    for (const id of Object.keys(now)) if (!(id in before)) changes.push({ type: 'added', doc: docSnap(id, JSON.parse(now[id])) }); else if (before[id] !== now[id]) changes.push({ type: 'modified', doc: docSnap(id, JSON.parse(now[id])) });
    for (const id of Object.keys(before)) if (!(id in now)) changes.push({ type: 'removed', doc: docSnap(id, JSON.parse(before[id])) });
    const first = prev === null; prev = now;
    if (!first && !changes.length) return;
    g.reads = (g.reads || 0) + Math.max(first ? 1 : 0, changes.filter(c => c.type !== 'removed').length);
    next({ docChanges: () => changes, size: Object.keys(now).length, metadata: meta });
  } };
  g.snapListeners.push(listener);
  setTimeout(() => listener.check(), 10);
  return () => { g.snapListeners = g.snapListeners.filter(l => l !== listener); };
}

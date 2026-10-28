import g from './shared.js';
const clone = o => JSON.parse(JSON.stringify(o));
export const persistentLocalCache = o => o, persistentMultipleTabManager = () => ({});
export function initializeFirestore(app) { return { app }; }
export function getFirestore(app) { return { app }; }
export function doc(db, ...parts) { return { kind: 'doc', path: parts.join('/'), id: parts[parts.length - 1] }; }
export function collection(db, ...parts) { return { kind: 'col', path: parts.join('/') }; }
const later = fn => new Promise(res => setTimeout(() => { fn(); res(); }, 20));
export function setDoc(ref, data) { return later(() => { g.store[ref.path] = clone(data); g.save(); g.notify(); }); }
export function deleteDoc(ref) { return later(() => { delete g.store[ref.path]; g.save(); g.notify(); }); }
const meta = { fromCache: false, hasPendingWrites: false };
const docSnap = (id, data) => ({ id, exists: () => data !== undefined, data: () => (data === undefined ? undefined : clone(data)), metadata: meta });
export function onSnapshot(ref, opts, next) {
  if (typeof opts === 'function') next = opts;
  let prev = null;
  const listener = { check() {
    if (ref.kind === 'doc') {
      const cur = g.store[ref.path]; const s = JSON.stringify(cur);
      if (prev !== null && prev === s) return; prev = s;
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
    next({ docChanges: () => changes, size: Object.keys(now).length, metadata: meta });
  } };
  g.snapListeners.push(listener);
  setTimeout(() => listener.check(), 10);
  return () => { g.snapListeners = g.snapListeners.filter(l => l !== listener); };
}

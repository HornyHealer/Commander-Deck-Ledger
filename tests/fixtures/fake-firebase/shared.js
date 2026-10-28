// Shared in-memory state for the stand-in Firebase used by the tests. It is kept in
// localStorage so it survives page reloads, like a real account would.
const KEY = 'fake-fb-store', UKEY = 'fake-fb-user';
const g = window.__fakeFirebase || (window.__fakeFirebase = {
  store: JSON.parse(localStorage.getItem(KEY) || '{}'),
  user: JSON.parse(localStorage.getItem(UKEY) || 'null'),
  authListeners: [], snapListeners: [],
});
g.save = () => { localStorage.setItem(KEY, JSON.stringify(g.store)); localStorage.setItem(UKEY, JSON.stringify(g.user)); };
g.notify = () => g.snapListeners.forEach(l => l.check());
// Lets a test act like another device writing to the account.
g.remoteSet = (path, data) => { g.store[path] = JSON.parse(JSON.stringify(data)); g.save(); g.notify(); };
export default g;

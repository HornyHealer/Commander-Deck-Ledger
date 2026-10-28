import g from './shared.js';
const TEST_USER = { uid: 'u-test', displayName: 'Test Player', email: 'test@example.com' };
export function getAuth(app) { return { app }; }
export class GoogleAuthProvider {}
export function onAuthStateChanged(auth, cb) { g.authListeners.push(cb); setTimeout(() => cb(g.user), 10); return () => {}; }
const announce = () => { g.save(); g.authListeners.forEach(cb => cb(g.user)); };
export async function signInWithPopup() { g.user = TEST_USER; announce(); return { user: g.user }; }
export async function signInWithRedirect() { return signInWithPopup(); }
export async function signOut() { g.user = null; announce(); }

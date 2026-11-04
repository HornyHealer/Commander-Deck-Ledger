import g from './shared.js';
export class ReCaptchaEnterpriseProvider { constructor(key) { this.key = key; } }
export function initializeAppCheck(app, opts) { g.appCheck = { key: opts.provider.key, autoRefresh: opts.isTokenAutoRefreshEnabled }; return {}; }

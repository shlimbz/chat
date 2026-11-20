// 서버 REST API (로그인 · 캐릭터 관리)
export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export class ApiClient {
  constructor(baseUrl, token = null) {
    this.base = baseUrl.replace(/\/$/, '');
    this.token = token;
  }

  async _req(method, path, body) {
    let res;
    try {
      res = await fetch(`${this.base}${path}`, {
        method,
        headers: {
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new ApiError('NETWORK', 0, 'NETWORK');
    }
    let data = {};
    try { data = await res.json(); } catch { /* 빈 응답 */ }
    if (!res.ok) throw new ApiError(data.error || `요청 실패 (${res.status})`, res.status, data.code);
    return data;
  }

  register(username, password) { return this._req('POST', '/api/auth/register', { username, password }); }
  login(username, password) { return this._req('POST', '/api/auth/login', { username, password }); }
  guest() { return this._req('POST', '/api/auth/guest', {}); }
  upgrade(username, password) { return this._req('POST', '/api/auth/upgrade', { username, password }); }
  logout() { return this._req('POST', '/api/auth/logout', {}).catch(() => {}); }
  me() { return this._req('GET', '/api/me'); }
  createCharacter(nickname, appearance) { return this._req('POST', '/api/characters', { nickname, appearance }); }
  updateCharacter(id, appearance) { return this._req('PUT', `/api/characters/${id}`, { appearance }); }
  deleteCharacter(id) { return this._req('DELETE', `/api/characters/${id}`); }
  claim(tokens) { return this._req('POST', '/api/characters/claim', { tokens }); }

  /** 서버 깨우기 (무료 서버가 잠들어 있을 때 최대 ~70초 대기) */
  async wake(timeoutMs = 70000) {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 8000);
        const r = await fetch(`${this.base}/health`, { signal: ctrl.signal });
        clearTimeout(t);
        if (r.ok) return true;
      } catch { /* 아직 깨어나는 중 */ }
      await new Promise((r) => setTimeout(r, 2000));
    }
    return false;
  }
}

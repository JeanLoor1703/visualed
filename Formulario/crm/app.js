'use strict';

(() => {
  const config = window.VISUALED_CRM_CONFIG;
  const sdk = window.supabase;
  const views = [...document.querySelectorAll('.auth-view')];
  const messageBox = document.querySelector('#global-message');
  const pendingEmailKey = 'visualed-crm-otp-email';
  const genericAccessError = 'No pudimos completar el acceso. Revisa el código e inténtalo nuevamente.';
  const genericSendMessage = 'Si el correo está autorizado, recibirás un código temporal en unos instantes.';

  let client;
  let pendingEmail = '';
  let routingPromise = null;

  const elements = {
    loginForm: document.querySelector('#login-form'),
    emailVerifyForm: document.querySelector('#email-verify-form'),
    emailLabel: document.querySelector('#otp-email-label'),
    emailOtp: document.querySelector('#email-otp'),
    memberName: document.querySelector('#member-name'),
    memberRole: document.querySelector('#member-role'),
    resendOtp: document.querySelector('#resend-otp')
  };

  function showMessage(text, type = 'info') {
    messageBox.textContent = text;
    messageBox.dataset.type = type;
    messageBox.hidden = false;
  }

  function clearMessage() {
    messageBox.textContent = '';
    messageBox.removeAttribute('data-type');
    messageBox.hidden = true;
  }

  function showView(id, options = {}) {
    views.forEach((view) => { view.hidden = view.id !== id; });
    clearMessage();
    if (options.message) showMessage(options.message, options.type);

    window.requestAnimationFrame(() => {
      const view = document.querySelector(`#${id}`);
      const focusTarget = view?.querySelector('input:not([type="hidden"]), button');
      focusTarget?.focus({ preventScroll: true });
    });
  }

  function setBusy(form, busy) {
    [...form.elements].forEach((control) => { control.disabled = busy; });
    form.setAttribute('aria-busy', String(busy));
  }

  function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
  }

  function savePendingEmail(email) {
    pendingEmail = normalizeEmail(email);
    if (pendingEmail) window.sessionStorage.setItem(pendingEmailKey, pendingEmail);
  }

  function loadPendingEmail() {
    return pendingEmail || window.sessionStorage.getItem(pendingEmailKey) || '';
  }

  function clearPendingEmail() {
    pendingEmail = '';
    window.sessionStorage.removeItem(pendingEmailKey);
  }

  function scrubAuthUrl() {
    if (window.location.pathname !== '/' || window.location.search || window.location.hash) {
      window.history.replaceState({}, document.title, '/');
    }
  }

  function readCallback() {
    const url = new URL(window.location.href);
    const query = url.searchParams;
    const hash = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.hash);

    return {
      code: query.get('code'),
      accessToken: hash.get('access_token'),
      refreshToken: hash.get('refresh_token'),
      hasError: Boolean(query.get('error') || hash.get('error')),
      hadAuthData: Boolean(query.get('code') || hash.get('access_token') || query.get('error') || hash.get('error') || query.get('flow'))
    };
  }

  async function consumeCallback() {
    const callback = readCallback();
    if (!callback.hadAuthData) return { handled: false, error: false };

    scrubAuthUrl();
    if (callback.hasError) return { handled: true, error: true };

    if (callback.code) {
      const { error } = await client.auth.exchangeCodeForSession(callback.code);
      return { handled: true, error: Boolean(error) };
    }

    if (callback.accessToken && callback.refreshToken) {
      const { error } = await client.auth.setSession({
        access_token: callback.accessToken,
        refresh_token: callback.refreshToken
      });
      return { handled: true, error: Boolean(error) };
    }

    return { handled: true, error: false };
  }

  async function getCurrentSession() {
    const { data, error } = await client.auth.getSession();
    if (error) return null;
    return data.session;
  }

  async function showProtectedArea(session) {
    const { data, error } = await client
      .from('crm_members')
      .select('display_name, role')
      .eq('user_id', session.user.id)
      .eq('active', true)
      .maybeSingle();

    if (error || !data) {
      showView('view-denied');
      return;
    }

    const roleLabels = { admin: 'Administrador', agent: 'Agente', viewer: 'Consulta' };
    elements.memberName.textContent = data.display_name;
    elements.memberRole.textContent = roleLabels[data.role] || 'Miembro';
    showView('view-ready');
  }

  async function routeSession() {
    if (routingPromise) return routingPromise;

    routingPromise = (async () => {
      const session = await getCurrentSession();
      if (!session) {
        showView('view-login');
        return;
      }

      await showProtectedArea(session);
    })()
      .catch(() => {
        showView('view-login', { message: genericAccessError, type: 'error' });
      })
      .finally(() => { routingPromise = null; });

    return routingPromise;
  }

  async function sendOtp(email, form = null) {
    const normalizedEmail = normalizeEmail(email);
    savePendingEmail(normalizedEmail);
    if (form) setBusy(form, true);
    clearMessage();

    try {
      const { error } = await client.auth.signInWithOtp({
        email: normalizedEmail,
        options: { shouldCreateUser: false }
      });

      if (error) {
        showView('view-login', { message: genericSendMessage, type: 'info' });
        return false;
      }

      elements.emailLabel.textContent = normalizedEmail;
      elements.emailOtp.value = '';
      showView('view-email-verify', { message: genericSendMessage, type: 'success' });
      return true;
    } catch {
      showView('view-login', { message: genericSendMessage, type: 'info' });
      return false;
    } finally {
      if (form) setBusy(form, false);
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;

    const email = new FormData(form).get('email');
    await sendOtp(email, form);
  }

  async function handleOtpVerification(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;

    const code = String(new FormData(form).get('code') || '').trim();
    const email = loadPendingEmail();

    if (!/^\d{6}$/.test(code) || !email) {
      showMessage(genericAccessError, 'error');
      return;
    }

    setBusy(form, true);
    clearMessage();

    try {
      const { error } = await client.auth.verifyOtp({ email, token: code, type: 'email' });
      if (error) {
        showMessage(genericAccessError, 'error');
        return;
      }

      clearPendingEmail();
      form.reset();
      showView('view-loading');
      await routeSession();
    } catch {
      showMessage(genericAccessError, 'error');
    } finally {
      setBusy(form, false);
    }
  }

  async function signOut() {
    clearPendingEmail();
    clearMessage();
    await client.auth.signOut({ scope: 'local' });
    showView('view-login');
  }

  function bindEvents() {
    elements.loginForm.addEventListener('submit', handleLogin);
    elements.emailVerifyForm.addEventListener('submit', handleOtpVerification);
    elements.resendOtp.addEventListener('click', () => sendOtp(loadPendingEmail()));

    document.querySelectorAll('[data-go-login]').forEach((button) => {
      button.addEventListener('click', () => {
        clearPendingEmail();
        showView('view-login');
      });
    });

    document.querySelectorAll('.sign-out-action').forEach((button) => {
      button.addEventListener('click', signOut);
    });

    document.querySelectorAll('.otp-input').forEach((input) => {
      input.addEventListener('input', () => {
        input.value = input.value.replace(/\D/g, '').slice(0, 6);
      });
    });
  }

  async function initialize() {
    document.querySelector('#current-year').textContent = String(new Date().getFullYear());
    bindEvents();

    if (!config?.supabaseUrl || !config?.supabasePublishableKey || !sdk?.createClient) {
      showView('view-login', { message: 'El servicio de acceso no está disponible en este momento.', type: 'error' });
      return;
    }

    client = sdk.createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: {
        flowType: 'pkce',
        detectSessionInUrl: false,
        persistSession: true,
        autoRefreshToken: true,
        storageKey: config.storageKey
      },
      global: {
        headers: { 'X-Client-Info': 'visualed-crm/1.1.0' }
      }
    });

    client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') window.setTimeout(() => showView('view-login'), 0);
    });

    try {
      const callback = await consumeCallback();
      if (callback.error) {
        await client.auth.signOut({ scope: 'local' });
        showView('view-login', { message: 'El enlace no es válido o ya venció.', type: 'error' });
        return;
      }

      await routeSession();
    } catch {
      scrubAuthUrl();
      showView('view-login', { message: genericAccessError, type: 'error' });
    }
  }

  initialize();
})();

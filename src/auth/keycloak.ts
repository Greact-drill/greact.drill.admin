import Keycloak, { type KeycloakInitOptions } from 'keycloak-js';

const keycloakUrl = import.meta.env.VITE_KEYCLOAK_URL;
const keycloakRealm = import.meta.env.VITE_KEYCLOAK_REALM;
const keycloakClientId = import.meta.env.VITE_KEYCLOAK_CLIENT_ID;

const authEnabled = Boolean(keycloakUrl && keycloakRealm && keycloakClientId);

let keycloak: Keycloak | null = authEnabled
  ? new Keycloak({
      url: keycloakUrl,
      realm: keycloakRealm,
      clientId: keycloakClientId
    })
  : null;

let initPromise: Promise<boolean> | null = null;
let refreshPromise: Promise<string | null> | null = null;

export interface AuthState {
  initialized: boolean;
  authenticated: boolean;
  enabled: boolean;
  username: string | null;
  fullName: string | null;
  email: string | null;
}

const defaultState: AuthState = {
  initialized: !authEnabled,
  authenticated: !authEnabled,
  enabled: authEnabled,
  username: null,
  fullName: null,
  email: null
};

type Listener = (state: AuthState) => void;

let authState: AuthState = defaultState;
const listeners = new Set<Listener>();

function getIdentityState(): Pick<AuthState, 'username' | 'fullName' | 'email'> {
  const tokenParsed = keycloak?.tokenParsed as
    | { preferred_username?: string; name?: string; email?: string }
    | undefined;

  return {
    username: tokenParsed?.preferred_username ?? null,
    fullName: tokenParsed?.name ?? null,
    email: tokenParsed?.email ?? null
  };
}

function setState(partial: Partial<AuthState>) {
  authState = { ...authState, ...partial };
  listeners.forEach((listener) => listener(authState));
}

function bindKeycloakEvents() {
  if (!keycloak) {
    return;
  }

  keycloak.onAuthSuccess = () => {
    setState({
      initialized: true,
      authenticated: true,
      ...getIdentityState()
    });
  };

  keycloak.onAuthLogout = () => {
    setState({
      initialized: true,
      authenticated: false,
      username: null,
      fullName: null,
      email: null
    });
  };

  keycloak.onTokenExpired = () => {
    void refreshToken(30);
  };
}

bindKeycloakEvents();

export function subscribeAuth(listener: Listener): () => void {
  listeners.add(listener);
  listener(authState);
  return () => {
    listeners.delete(listener);
  };
}

export function getAuthState(): AuthState {
  return authState;
}

export async function initAuth(): Promise<AuthState> {
  if (!keycloak) {
    return authState;
  }

  if (!initPromise) {
    const initOptions: KeycloakInitOptions = {
      onLoad: 'login-required',
      pkceMethod: 'S256',
      checkLoginIframe: false
    };

    initPromise = keycloak.init(initOptions).then((authenticated) => {
      setState({
        initialized: true,
        authenticated,
        ...getIdentityState()
      });
      return authenticated;
    });
  }

  await initPromise;
  return authState;
}

export async function refreshToken(minValidity = 30): Promise<string | null> {
  if (!keycloak) {
    return null;
  }

  if (!refreshPromise) {
    refreshPromise = keycloak
      .updateToken(minValidity)
      .then(() => {
        setState({
          authenticated: Boolean(keycloak?.authenticated),
          ...getIdentityState()
        });
        return keycloak?.token ?? null;
      })
      .catch(async () => {
        setState({
          authenticated: false,
          username: null,
          fullName: null,
          email: null
        });
        await login();
        return null;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

export async function getAccessToken(): Promise<string | null> {
  if (!keycloak || !keycloak.authenticated) {
    return null;
  }

  await refreshToken(30);
  return keycloak.token ?? null;
}

export async function login(redirectUri = window.location.href): Promise<void> {
  if (!keycloak) {
    return;
  }

  await keycloak.login({ redirectUri });
}

export async function logout(redirectUri = window.location.origin): Promise<void> {
  if (!keycloak) {
    return;
  }

  await keycloak.logout({ redirectUri });
}

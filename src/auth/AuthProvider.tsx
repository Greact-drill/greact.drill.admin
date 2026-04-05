import { type ReactNode, createContext, useContext, useEffect, useState } from 'react';
import { Button } from 'primereact/button';
import {
  type AuthState,
  getAuthState,
  initAuth,
  login,
  logout,
  subscribeAuth
} from './keycloak';

interface AuthContextValue extends AuthState {
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(getAuthState());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeAuth(setState);

    void initAuth().catch((error) => {
      console.error('Keycloak init failed', error);
      setErrorMessage('Не удалось подключиться к Keycloak. Проверьте параметры VITE_KEYCLOAK_* и доступность SSO.');
    });

    return unsubscribe;
  }, []);

  if (!state.initialized) {
    return (
      <div className="auth-screen">
        <div className="auth-screen-card">
          <h1>Drill</h1>
          <p>Проверяем сессию Keycloak...</p>
        </div>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="auth-screen">
        <div className="auth-screen-card">
          <h1>Ошибка авторизации</h1>
          <p>{errorMessage}</p>
          <Button label="Повторить вход" icon="pi pi-sign-in" onClick={() => void login()} />
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login: () => login(),
        logout: () => logout()
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}

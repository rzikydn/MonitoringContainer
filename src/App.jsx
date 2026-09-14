import React, { useState } from 'react';
import LoginPage from './components/LoginPage';
import DashboardPage from './components/DashboardPage';

function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const savedLocal = localStorage.getItem('monitoring_auth_user');
      if (savedLocal) return JSON.parse(savedLocal);
      const savedSession = sessionStorage.getItem('monitoring_auth_user');
      if (savedSession) return JSON.parse(savedSession);
    } catch {
      // ignore
    }
    return null;
  });

  const handleLoginSuccess = (userData, rememberMe) => {
    try {
      if (rememberMe) {
        localStorage.setItem('monitoring_auth_user', JSON.stringify(userData));
      } else {
        sessionStorage.setItem('monitoring_auth_user', JSON.stringify(userData));
      }
    } catch {
      // ignore
    }
    setCurrentUser(userData);
  };

  const handleLogout = () => {
    try {
      localStorage.removeItem('monitoring_auth_user');
      sessionStorage.removeItem('monitoring_auth_user');
    } catch {
      // ignore
    }
    setCurrentUser(null);
  };

  return currentUser ? (
    <DashboardPage user={currentUser} onLogout={handleLogout} />
  ) : (
    <LoginPage onLogin={handleLoginSuccess} />
  );
}

export default App;

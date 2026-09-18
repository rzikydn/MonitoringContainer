import React, { useState } from 'react';
import { AtSign, Check } from 'lucide-react';
import serverIllustration from '../assets/server1.svg';
import SmoothInput from './SmoothInput';
import AnimatedLock from './AnimatedLock';
import { loginUser } from '../services/api';

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isShaking, setIsShaking] = useState(false);

  const triggerShake = () => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 500);
  };

  const handleLogin = (e) => {
    e.preventDefault();

    const u = username.trim();
    const p = password.trim();

    if (!u || !p) {
      triggerShake();
      return;
    }

    setIsLoading(true);

    setTimeout(() => {
      setIsLoading(true);
      loginUser(u, p)
        .then((res) => {
          setIsLoading(false);
          if (onLogin) onLogin(res.user, rememberMe);
        })
        .catch((err) => {
          setIsLoading(false);
          triggerShake();
          alert(err.message);
        });
    }, 450);
  };

  return (
    <div className="login-page-wrapper">
      {/* Background Layer: background2.svg Wavy Shape */}
      <div className="background-svg-layer" aria-hidden="true">
        <svg
          viewBox="0 0 960 540"
          preserveAspectRatio="none"
          className="background-svg-img"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect x="0" y="0" width="960" height="540" fill="#FFFFFF" />
          <path
            d="M618 0L597.2 15C576.3 30 534.7 60 535 90C535.3 120 577.7 150 565.5 180C553.3 210 486.7 240 455.3 270C424 300 428 330 459.8 360C491.7 390 551.3 420 528.7 450C506 480 401 510 348.5 525L296 540L0 540L0 525C0 510 0 480 0 450C0 420 0 390 0 360C0 330 0 300 0 270C0 240 0 210 0 180C0 150 0 120 0 90C0 60 0 30 0 15L0 0Z"
            fill="#254a6e"
            strokeLinecap="round"
            strokeLinejoin="miter"
          />
        </svg>
      </div>

      {/* Main Content Layer */}
      <div className="login-content-container">
        {/* Server Monitoring Illustration */}
        <div className="illustration-wrapper">
          <img
            src={serverIllustration}
            alt="Container Server Monitoring"
            className="server-illustration"
          />
        </div>

        {/* Right Section: Login Form */}
        <div className="login-form-wrapper">
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.72rem',
              fontWeight: 600,
              color: '#B45309',
              backgroundColor: '#FFFBEB',
              border: '1px solid #FDE68A',
              borderRadius: '6px',
              padding: '4px 10px',
              marginBottom: '12px',
              width: 'fit-content',
            }}
            title="Kredensial belum divalidasi — username/password apapun akan diterima. Jangan expose dashboard ini ke jaringan publik sampai auth sungguhan terpasang."
          >
            ⚠ Development Mode — No Auth Validation
          </div>
          <form
            onSubmit={handleLogin}
            className={`login-form ${isShaking ? 'form-shake' : ''}`}
            noValidate
            autoComplete="off"
          >
            {/* User Input with Smooth Caret Input & Floating Notch */}
            <SmoothInput
              id="operator-user"
              name="operator_usr"
              type="text"
              label="User"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck="false"
              data-lpignore="true"
              data-1p-ignore="true"
              data-bwignore="true"
              data-form-type="other"
              rightIcon={
                <span className="input-icon-right" aria-hidden="true">
                  <AtSign size={18} strokeWidth={2.2} />
                </span>
              }
            />

            {/* Password Input with Smooth Caret, Visual Masking & Animated Lock */}
            <SmoothInput
              id="operator-key"
              name="operator_key"
              type="text"
              isMasked={!showPassword}
              label="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck="false"
              data-lpignore="true"
              data-1p-ignore="true"
              data-bwignore="true"
              data-form-type="other"
              rightIcon={
                <button
                  type="button"
                  className="input-icon-btn"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Sembunyikan password' : 'Lihat password'}
                  title={showPassword ? 'Sembunyikan password' : 'Lihat password'}
                  tabIndex={-1}
                >
                  <AnimatedLock isOpen={showPassword} size={18} strokeWidth={2.2} />
                </button>
              }
            />

            {/* Remember Me Checkbox Row */}
            <div className="form-remember-row">
              <label className="custom-checkbox-label">
                <input
                  type="checkbox"
                  id="remember-me-checkbox"
                  className="custom-checkbox-input"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span className="custom-checkbox-box" aria-hidden="true">
                  <Check className="checkbox-check-icon" strokeWidth={3} />
                </span>
                <span className="remember-text">Remember Me</span>
              </label>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              id="login-submit-button"
              className="login-submit-btn"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  <span>Memverifikasi...</span>
                </>
              ) : (
                'Login'
              )}
            </button>
          </form>

          {/* Footer Copyright */}
          <p className="login-copyright">&copy; 2026 BSMR. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}

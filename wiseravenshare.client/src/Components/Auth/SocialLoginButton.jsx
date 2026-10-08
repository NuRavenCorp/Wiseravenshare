import React from 'react';
import api from '../../Services/api';

const SocialLoginButton = ({ provider = 'google', label, className = '', returnUrl = '' }) => {
  const handleClick = () => {
    const baseUrl = (api.defaults.baseURL ?? '').replace(/\/api\/?$/, '');
    const query = returnUrl ? `?returnUrl=${encodeURIComponent(returnUrl)}` : '';
    window.location.href = `${baseUrl}/api/auth/oauth/${provider}/start${query}`;
  };

  const defaultLabel = provider === 'youtube' ? 'Connect YouTube' : 'Sign in with Google';

  return (
    <button className={`social-login-button social-login-button--${provider} ${className}`} onClick={handleClick} type="button">
      {label ?? defaultLabel}
    </button>
  );
};

export default SocialLoginButton;

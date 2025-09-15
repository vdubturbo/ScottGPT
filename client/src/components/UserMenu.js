/**
 * UserMenu - Dropdown menu component for user account actions
 */

import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './UserMenu.css';

const UserMenu = () => {
  const { user, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  const profile = user?.profile;
  const displayName = profile?.display_name || profile?.full_name || user?.email?.split('@')[0] || 'User';
  const email = user?.email || '';

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    setIsOpen(false);
    logout();
  };

  const handleSubscriptionClick = () => {
    setIsOpen(false);
    // TODO: Navigate to subscription page when available
    console.log('Subscription clicked');
  };

  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };

  return (
    <div className="user-menu" ref={menuRef}>
      <button
        className="user-menu-trigger"
        onClick={toggleMenu}
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <div className="user-avatar">
          <span className="avatar-placeholder">
            {displayName.charAt(0).toUpperCase()}
          </span>
        </div>
        <div className="user-info">
          <div className="user-name">{displayName}</div>
          <div className="user-email">{email}</div>
        </div>
        <div className="dropdown-arrow">
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            className={isOpen ? 'rotated' : ''}
          >
            <path
              d="M3 4.5L6 7.5L9 4.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </button>

      {isOpen && (
        <div className="user-menu-dropdown">
          <div className="menu-header">
            <div className="menu-avatar">
              <span className="avatar-placeholder large">
                {displayName.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="menu-user-info">
              <div className="menu-user-name">{displayName}</div>
              <div className="menu-user-email">{email}</div>
            </div>
          </div>

          <div className="menu-divider"></div>

          <div className="menu-items">
            <button
              className="menu-item"
              onClick={handleSubscriptionClick}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M8 2L10.5 5H13.5L11 8L13.5 11H10.5L8 14L5.5 11H2.5L5 8L2.5 5H5.5L8 2Z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>Subscription</span>
            </button>

            <button
              className="menu-item logout"
              onClick={handleLogout}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M6 14H3C2.44772 14 2 13.5523 2 13V3C2 2.44772 2.44772 2 3 2H6M10 11L13 8L10 5M13 8H6"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>Logout</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserMenu;
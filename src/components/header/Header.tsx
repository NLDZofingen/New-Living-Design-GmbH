import React, { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { HeaderProps, NavigationItem } from '../../types';
import './Header.css';
import logo from '../../assets/S__2_-removebg-preview_edited.avif';

const defaultNavigationItems: NavigationItem[] = [
  { name: 'Bad', href: '/produkte#bad' },
  { name: 'Küchen', href: '/produkte#kuechen' },
  { name: 'Platten', href: '/produkte#platten' },
  { name: 'Wellness', href: '/produkte#wellness' },
  { name: 'Badplaner', href: '/badplaner' },
  { name: 'Referenzen', href: '/referenzen' },
  { name: 'Über uns', href: '/ueber-uns' },
];

const Header: React.FC<HeaderProps> = ({ className = '', navigationItems }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const menuToggleRef = useRef<HTMLButtonElement>(null);
  const mobileNavigationId = useId();
  const location = useLocation();

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location]);

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1100px)');
    const closeOnDesktop = () => {
      if (desktop.matches) setIsMobileMenuOpen(false);
    };
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);

  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setIsMobileMenuOpen(false);
      menuToggleRef.current?.focus();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [isMobileMenuOpen]);

  const navItems = navigationItems ?? defaultNavigationItems;
  const isActive = (href: string) => {
    const [pathAndQuery, hash] = href.split('#');
    const pathname = pathAndQuery.split('?')[0];
    if (hash !== undefined) {
      return location.pathname === pathname && location.hash === `#${hash}`;
    }
    return pathname === '/'
      ? location.pathname === '/'
      : location.pathname === pathname || location.pathname.startsWith(`${pathname}/`);
  };
  const currentLocation = (href: string) =>
    isActive(href) ? (href.includes('#') ? 'location' as const : 'page' as const) : undefined;

  return (
    <header className={`header ${className}`}>
      <div className="header-container">
        <div className="header-content">
          {/* Logo */}
          <div className="logo">
            <Link to="/" aria-label="New Living Design – Startseite" onClick={() => setIsMobileMenuOpen(false)}>
              <img 
                src={logo} 
                alt="New Living Design Logo" 
                className="logo-image"
              />
            </Link>
          </div>

          {/* Desktop Navigation */}
          <nav className="nav-desktop" aria-label="Hauptnavigation">
            {navItems.map((item) => (
              <Link
                key={item.name}
                to={item.href}
                className={`nav-link ${isActive(item.href) ? 'nav-link-active' : ''}`}
                aria-current={currentLocation(item.href)}
              >
                {item.name}
              </Link>
            ))}
          </nav>

          <div className="contact-button-desktop">
            <Link to="/kontakt" className="contact-button" aria-current={currentLocation('/kontakt')}>
              Beratung anfragen
            </Link>
          </div>

          {/* Mobile menu button */}
          <div className="mobile-menu-button">
            <button
              ref={menuToggleRef}
              type="button"
              onClick={() => setIsMobileMenuOpen((open) => !open)}
              className="menu-toggle"
              aria-label={isMobileMenuOpen ? 'Menü schliessen' : 'Menü öffnen'}
              aria-expanded={isMobileMenuOpen}
              aria-controls={mobileNavigationId}
            >
              <span>Menü</span>
              <svg className="menu-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                {isMobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation */}
      <nav id={mobileNavigationId} className="nav-mobile" aria-label="Mobile Hauptnavigation" hidden={!isMobileMenuOpen}>
        <div className="nav-mobile-content">
          {navItems.map((item) => (
            <Link
              key={item.name}
              to={item.href}
              className={`nav-mobile-link ${isActive(item.href) ? 'nav-mobile-link-active' : ''}`}
              aria-current={currentLocation(item.href)}
              onClick={() => setIsMobileMenuOpen(false)}
            >
              {item.name}
            </Link>
          ))}
          <Link
            to="/kontakt"
            className="contact-button contact-button-full"
            aria-current={currentLocation('/kontakt')}
            onClick={() => setIsMobileMenuOpen(false)}
          >
            Beratung anfragen
          </Link>
        </div>
      </nav>
    </header>
  );
};

export default Header;

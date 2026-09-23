import React from 'react';
import { Link } from 'react-router-dom';
import type { FooterProps } from '../../types';
import { business, localBusinessJsonLd } from '../../config/business';
import './Footer.css';
import logo from '../../assets/S__2_-removebg-preview_edited.avif';

const Footer: React.FC<FooterProps> = ({ className = '' }) => {
  return (
    <footer className={`footer ${className}`}>
      {/* Main Footer Content */}
      <div className="footer-main">
        <div className="footer-container">
          <div className="footer-content">
            {/* Company Section */}
            <div className="footer-section footer-company">
              <div className="footer-logo">
                <img
                  src={logo}
                  alt="New Living Design Logo"
                  className="footer-logo-image"
                />
                <h3 className="footer-brand-name">New Living Design</h3>
              </div>
              <p className="footer-tagline">
                Bad, Küchen, Platten und Wellness. Materialien vergleichen, persönlich auswählen und
                passend zum Raum zusammenstellen – in unserer Ausstellung in Zofingen.
              </p>
              <nav className="footer-quicklinks" aria-label="Wichtige Seiten">
                <Link to="/badplaner" className="footer-quicklink">Badplaner</Link>
                <Link to="/badumbau-zofingen" className="footer-quicklink">Badumbau Zofingen</Link>
                <Link to="/dienstleistungen" className="footer-quicklink">Dienstleistungen</Link>
                <Link to="/partner" className="footer-quicklink">Partner</Link>
                <Link to="/referenzen" className="footer-quicklink">Referenzen</Link>
                <Link to="/blog" className="footer-quicklink">Blog</Link>
                <Link to="/booking" className="footer-quicklink">Termin anfragen</Link>
                <Link to="/kontakt" className="footer-quicklink">Kontakt</Link>
              </nav>
              <div className="footer-social-links">
                <a href="https://www.facebook.com/NewLDGMBH/" className="footer-social-link" aria-label="Facebook">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                  </svg>
                </a>
                <a href="https://www.instagram.com/new_living_design/" className="footer-social-link" aria-label="Instagram">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                  </svg>
                </a>
                <a href="https://www.linkedin.com/in/diego-verdile-56727064/" className="footer-social-link" aria-label="LinkedIn">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                  </svg>
                </a>
              </div>
            </div>

            {/* Contact Section */}
            <div className="footer-section">
              <h4 className="footer-section-title">Kontakt</h4>
              <div className="footer-contact">
                <div className="footer-contact-item">
                  <div className="footer-contact-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                  </div>
                  <div className="footer-contact-content">
                    <a href="https://maps.app.goo.gl/ZyhcBb3qb2JXkgny9" target="_blank" rel="noopener noreferrer" className="footer-contact-link">
                      Im Römerquartier 4A<br />
                      4800 Zofingen, Schweiz
                    </a>
                  </div>
                </div>

                <div className="footer-contact-item">
                  <div className="footer-contact-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                    </svg>
                  </div>
                  <div className="footer-contact-content">
                    <a href={`tel:${business.phone.e164}`} className="footer-contact-link">
                      {business.phone.display}
                    </a>
                    <a href={`tel:${business.phoneSecondary.e164}`} className="footer-contact-link">
                      {business.phoneSecondary.display}
                    </a>
                  </div>
                </div>

                <div className="footer-contact-item">
                  <div className="footer-contact-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                      <polyline points="22,6 12,13 2,6" />
                    </svg>
                  </div>
                  <div className="footer-contact-content">
                    <a href="mailto:emanuel.verdile@newlivingdesign.ch" className="footer-contact-link">
                      emanuel.verdile@newlivingdesign.ch
                    </a>
                  </div>
                </div>
              </div>
            </div>

            {/* Hours Section */}
            <div className="footer-section">
              <h4 className="footer-section-title">Öffnungszeiten</h4>
              <div className="footer-hours">
                <div className="footer-hours-item">
                  <span className="footer-hours-days">Mo - Fr</span>
                  <span className="footer-hours-time">{business.openingHours[0].opens} - {business.openingHours[0].closes}</span>
                </div>
                <div className="footer-hours-item">
                  <span className="footer-hours-days">Samstag</span>
                  <span className="footer-hours-time">{business.openingHours[1].opens} - {business.openingHours[1].closes}</span>
                </div>
                <div className="footer-hours-item">
                  <span className="footer-hours-days">Sonntag</span>
                  <span className="footer-hours-time">Geschlossen</span>
                </div>
                <p className="footer-hours-note">{business.openingHoursNote}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Bottom */}
      <div className="footer-bottom">
        <div className="footer-container">
          <div className="footer-bottom-content">
            <div className="footer-copyright">
              <p>© {new Date().getFullYear()} New Living Design GmbH. Alle Rechte vorbehalten.</p>
            </div>
            <div className="footer-bottom-links">
              <a href="/datenschutz" className="footer-bottom-link">Datenschutz</a>
              <span className="footer-divider">|</span>
              <a href="/impressum" className="footer-bottom-link">Impressum</a>
              <span className="footer-divider">|</span>
              <a href="/agb" className="footer-bottom-link">AGB</a>
            </div>
          </div>
        </div>
      </div>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessJsonLd) }} />
    </footer>
  );
};

export default Footer;

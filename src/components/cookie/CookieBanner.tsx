import React, { useState } from 'react';
import CookieConsent from 'react-cookie-consent';
import { BANNER_COOKIE, saveConsent } from '../../utils/tracking';
import './CookieBanner.css';

const CookieBanner: React.FC = () => {
    // Statistik und Marketing sind zwei getrennte Entscheidungen. Der dritte
    // Knopf nimmt nur die Statistik an; die Werbesignale bleiben gesperrt.
    // react-cookie-consent blendet sich nur bei den eigenen zwei Knoepfen aus,
    // darum hier der eigene Sichtbarkeitsschalter.
    const [hidden, setHidden] = useState(false);

    // Blendet sich das Banner aus, faellt der Tastaturfokus sonst auf <body>
    // zurueck und die naechste Tabulatortaste beginnt wieder ganz oben.
    const moveFocusToPage = () => {
        const main = document.getElementById('main-content');
        if (!main) return;
        if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
        main.focus({ preventScroll: true });
    };

    const handleAccept = () => {
        saveConsent({ analytics: true, marketing: true });
        moveFocusToPage();
    };

    const handleDecline = () => {
        saveConsent({ analytics: false, marketing: false });
        moveFocusToPage();
    };

    const handleStatistikOnly = () => {
        saveConsent({ analytics: true, marketing: false });
        setHidden(true);
        moveFocusToPage();
    };

    // ariaAcceptLabel und ariaDeclineLabel: ohne sie liest ein Screenreader die
    // englischen Vorgaben der Bibliothek ("Accept cookies") statt der Beschriftung.
    return (
        <CookieConsent
            location="bottom"
            visible={hidden ? 'hidden' : 'byCookieValue'}
            buttonText="Alle Cookies akzeptieren"
            declineButtonText="Nur notwendige"
            ariaAcceptLabel="Alle Cookies akzeptieren"
            ariaDeclineLabel="Nur notwendige Cookies"
            enableDeclineButton
            onAccept={handleAccept}
            onDecline={handleDecline}
            cookieName={BANNER_COOKIE}
            style={{
                background: "linear-gradient(135deg, rgba(10, 10, 10, 0.95) 0%, rgba(17, 17, 17, 0.98) 100%)",
                color: "#e5e7eb",
                fontSize: "14px",
                fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
                boxShadow: "0 -8px 32px rgba(0, 0, 0, 0.4), 0 -2px 8px rgba(0, 0, 0, 0.3)",
                backdropFilter: "blur(15px)",
                borderTop: "2px solid rgba(255, 255, 255, 0.15)",
                padding: "10px 16px",
                alignItems: "center",
                zIndex: 999999
            }}
            buttonStyle={{
                background: "linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)",
                color: "#111",
                fontSize: "14px",
                fontWeight: "600",
                border: "none",
                borderRadius: "8px",
                padding: "12px 24px",
                cursor: "pointer",
                transition: "all 0.3s ease",
                boxShadow: "0 4px 15px rgba(255, 255, 255, 0.2)",
                marginLeft: "15px"
            }}
            declineButtonStyle={{
                background: "transparent",
                color: "#9ca3af",
                fontSize: "14px",
                fontWeight: "500",
                border: "2px solid rgba(255, 255, 255, 0.15)",
                borderRadius: "8px",
                padding: "10px 20px",
                cursor: "pointer",
                transition: "all 0.3s ease",
                marginLeft: "10px"
            }}
            contentStyle={{
                flex: "1 1 300px",
                margin: "0",
                minWidth: "0",
                width: "100%",
                maxWidth: "none"
            }}
            customContainerAttributes={{
                role: 'region',
                'aria-label': 'Cookie-Einwilligung',
                'aria-live': 'polite',
            }}
            containerClasses="cookie-banner-container"
            buttonClasses="cookie-banner-accept"
            declineButtonClasses="cookie-banner-decline"
        >
            <div className="cookie-banner-content">
                <div className="cookie-banner-text">
                    <p>
                        Statistik (Google Analytics) und Marketing (Meta Pixel) nur mit Ihrer Zustimmung, je einzeln.{' '}
                        <button type="button" className="cookie-banner-link" onClick={handleStatistikOnly}>
                            Nur Statistik
                        </button>
                        {' · '}
                        <a href="/datenschutz#cookie-settings" style={{ color: "#ffffff", textDecoration: "underline" }}>Datenschutz</a>
                    </p>
                </div>
            </div>
        </CookieConsent>
    );
};

export default CookieBanner;

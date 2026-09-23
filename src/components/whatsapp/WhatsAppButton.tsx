import React from 'react';
import { business } from '../../config/business';
import './WhatsAppButton.css';

const message = encodeURIComponent('Guten Tag, ich interessiere mich für Ihre Produkte und eine Beratung in Ihrer Ausstellung. Können Sie mich kontaktieren?');
const href = `https://wa.me/${business.whatsapp.e164.replace('+', '')}?text=${message}`;

/** Fester WhatsApp-Knopf unten rechts, auf allen Seiten. Klick wird über installLeadClickTracking gemeldet (lead_whatsapp). */
const WhatsAppButton: React.FC = () => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="whatsapp-button"
    aria-label={`WhatsApp schreiben: ${business.whatsapp.display}`}
    data-lead="whatsapp-button"
  >
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M16 3C8.8 3 3 8.7 3 15.8c0 2.6.8 5.1 2.2 7.2L3 29l6.2-2.1c2 1.1 4.4 1.7 6.8 1.7 7.2 0 13-5.7 13-12.8S23.2 3 16 3zm0 23.4c-2.2 0-4.3-.6-6.1-1.7l-.4-.3-3.7 1.2 1.2-3.5-.3-.4A10.5 10.5 0 0 1 5.3 15.8C5.3 10 10.1 5.3 16 5.3S26.7 10 26.7 15.8 21.9 26.4 16 26.4zm5.8-7.8c-.3-.2-1.9-.9-2.2-1-.3-.1-.5-.2-.7.2l-1 1.2c-.2.2-.4.2-.7.1-.3-.2-1.3-.5-2.5-1.6-.9-.8-1.6-1.8-1.8-2.1-.2-.3 0-.5.1-.6l.5-.6.3-.5c.1-.2 0-.4 0-.6l-1-2.3c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-.3.3-1.2 1.1-1.2 2.8s1.2 3.2 1.4 3.5c.2.2 2.4 3.6 5.8 5 .8.3 1.4.5 1.9.7.8.3 1.5.2 2.1.1.6-.1 1.9-.8 2.2-1.5.3-.7.3-1.4.2-1.5-.1-.2-.3-.3-.6-.4z"
      />
    </svg>
    <span>WhatsApp</span>
  </a>
);

export default WhatsAppButton;

import type { LocalBusinessSEO, ProductSEO, ServiceSEO, BreadcrumbItem } from '../types/seo';
import { business } from '../config/business';

export const generateOrganizationStructuredData = () => ({
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": `${business.siteUrl}/#organization`,
  "name": business.legalName,
  "url": business.siteUrl,
  "logo": `${business.siteUrl}/logo.png`,
  "description": "Bad, Küchen, Platten und Wellness: Produkte entdecken, Projekte planen und persönlich beraten lassen in unserer Ausstellung in Zofingen.",
  "telephone": business.phone.e164,
  "email": business.email,
  "sameAs": [business.social.facebook, business.social.instagram, business.social.linkedin],
  "address": {
    "@type": "PostalAddress",
    "streetAddress": business.address.street,
    "postalCode": business.address.zip,
    "addressLocality": business.address.city,
    "addressRegion": business.address.region,
    "addressCountry": business.address.country
  },
  "contactPoint": {
    "@type": "ContactPoint",
    "telephone": business.phone.e164,
    "contactType": "customer service",
    "availableLanguage": ["de", "it", "en"]
  }
});

export const generateLocalBusinessStructuredData = (business: LocalBusinessSEO) => ({
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "@id": business.url,
  "name": business.name,
  "description": business.description,
  "url": business.url,
  "telephone": business.telephone,
  "priceRange": business.priceRange,
  "image": business.image,
  "address": {
    "@type": "PostalAddress",
    "streetAddress": business.address.streetAddress,
    "addressLocality": business.address.addressLocality,
    "addressRegion": business.address.addressRegion,
    "postalCode": business.address.postalCode,
    "addressCountry": business.address.addressCountry
  },
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": business.geo.latitude,
    "longitude": business.geo.longitude
  },
  "openingHoursSpecification": business.openingHours.map(hours => ({
    "@type": "OpeningHoursSpecification",
    "dayOfWeek": hours
  }))
});

export const generateProductStructuredData = (product: ProductSEO) => ({
  "@context": "https://schema.org",
  "@type": "Product",
  "name": product.title || "Produkt",
  "description": product.description,
  "image": product.image,
  "url": product.url,
  ...(product.brand && { "brand": { "@type": "Brand", "name": product.brand } }),
  ...(product.sku && { "sku": product.sku }),
  ...(product.category && { "category": product.category }),
  ...(product.price && {
    "offers": {
      "@type": "Offer",
      "price": product.price,
      "priceCurrency": "CHF",
      "availability": `https://schema.org/${product.availability || 'InStock'}`,
      "seller": {
        "@type": "Organization",
        "name": "New Living Design GmbH"
      }
    }
  })
});

export const generateServiceStructuredData = (service: ServiceSEO) => ({
  "@context": "https://schema.org",
  "@type": "Service",
  "name": service.title || "Dienstleistung",
  "description": service.description,
  "url": service.url,
  ...(service.serviceType && { "serviceType": service.serviceType }),
  ...(service.areaServed && { "areaServed": service.areaServed }),
  "provider": {
    "@type": "Organization",
    "name": service.provider?.name || "New Living Design GmbH",
    "url": service.provider?.url || "https://newlivingdesign.ch"
  }
});

export const generateBreadcrumbStructuredData = (breadcrumbs: BreadcrumbItem[]) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": breadcrumbs.map((item, index) => ({
    "@type": "ListItem",
    "position": index + 1,
    "name": item.name,
    "item": item.url.startsWith('http') ? item.url : `https://newlivingdesign.ch${item.url}`
  }))
});

export const generateWebsiteStructuredData = () => ({
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "New Living Design GmbH",
  "url": "https://newlivingdesign.ch",
  "description": "Bad, Küchen, Platten und Wellness: Produkte entdecken, Projekte planen und persönlich beraten lassen in unserer Ausstellung in Zofingen.",
  "inLanguage": "de-CH",
  "potentialAction": {
    "@type": "SearchAction",
    "target": {
      "@type": "EntryPoint",
      "urlTemplate": "https://newlivingdesign.ch/search?q={search_term_string}"
    },
    "query-input": "required name=search_term_string"
  }
});

export const generateFAQStructuredData = (faqs: { question: string; answer: string }[]) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": faqs.map(faq => ({
    "@type": "Question",
    "name": faq.question,
    "acceptedAnswer": {
      "@type": "Answer",
      "text": faq.answer
    }
  }))
});

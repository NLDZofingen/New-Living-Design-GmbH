import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { BreadcrumbItem } from '../../types/seo';
import { generateBreadcrumbStructuredData } from '../../utils/structuredData';
import SEOHead from './SEOHead';
import './Breadcrumbs.css';

interface BreadcrumbsProps {
  customBreadcrumbs?: BreadcrumbItem[];
}

const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ customBreadcrumbs }) => {
  const location = useLocation();
  
  const pathMap: { [key: string]: string } = {
    '/': 'Home',
    '/blog': 'Blog',
    '/produkte': 'Produkte',
    '/dienstleistungen': 'Dienstleistungen',
    '/partner': 'Partner',
    '/booking': 'Termin anfragen',
    '/ueber-uns': 'Über uns',
    '/kontakt': 'Kontakt',
    '/datenschutz': 'Datenschutz',
    '/impressum': 'Impressum',
    '/agb': 'AGB'
  };

  const generateBreadcrumbs = (): BreadcrumbItem[] => {
    if (customBreadcrumbs) {
      return [{ name: 'Home', url: '/' }, ...customBreadcrumbs];
    }

    const pathSegments = location.pathname.split('/').filter(segment => segment);
    const breadcrumbs: BreadcrumbItem[] = [{ name: 'Home', url: '/' }];

    let currentPath = '';
    pathSegments.forEach(segment => {
      currentPath += `/${segment}`;
      const name = pathMap[currentPath] || segment.charAt(0).toUpperCase() + segment.slice(1);
      breadcrumbs.push({ name, url: currentPath });
    });

    return breadcrumbs;
  };

  const breadcrumbs = generateBreadcrumbs();
  
  if (breadcrumbs.length <= 1) {
    return null;
  }

  const structuredData = generateBreadcrumbStructuredData(breadcrumbs);

  return (
    <>
      <SEOHead structuredData={structuredData} />
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <ol className="breadcrumb-list">
          {breadcrumbs.map((breadcrumb, index) => (
            <li key={breadcrumb.url} className="breadcrumb-item">
              {index < breadcrumbs.length - 1 ? (
                <>
                  <Link 
                    to={breadcrumb.url} 
                    className="breadcrumb-link"
                    aria-label={`Navigate to ${breadcrumb.name}`}
                  >
                    {breadcrumb.name}
                  </Link>
                  <span className="breadcrumb-separator" aria-hidden="true">/</span>
                </>
              ) : (
                <span 
                  className="breadcrumb-current" 
                  aria-current="page"
                >
                  {breadcrumb.name}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>
    </>
  );
};

export default Breadcrumbs;
import { useEffect, useMemo } from 'react';
import featuresHtml from '../../../features.html?raw';
import pricingHtml from '../../../pricing.html?raw';
import '../styles/legacy-marketing.css';

function extractContent(html, mainClass) {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const main = document.querySelector('main') || document.body;
  main.querySelectorAll('script, iframe, form').forEach((element) => element.remove());
  main.querySelectorAll('a').forEach((anchor) => {
    const href = anchor.getAttribute('href') || '';
    if (href.startsWith('index.html#/markets/crypto')) anchor.setAttribute('href', '/markets/crypto');
    else if (href.startsWith('index.html')) anchor.setAttribute('href', '/');
    else if (href.startsWith('signin.html')) anchor.setAttribute('href', '/signin');
    else if (href.startsWith('signup.html')) anchor.setAttribute('href', '/signup');
    else if (href.startsWith('pricing.html')) anchor.setAttribute('href', '/pricing');
    else if (href.startsWith('features.html')) anchor.setAttribute('href', '/features');
  });
  return `<div class="${mainClass}">${main.innerHTML}</div>`;
}

function MarketingPage({ type }) {
  const isFeatures = type === 'features';
  useEffect(() => {
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = isFeatures ? '/legacy/css/features.css' : '/legacy/css/pricing.css';
    style.dataset.marketingStyle = type;
    document.head.appendChild(style);
    return () => style.remove();
  }, [isFeatures, type]);
  const markup = useMemo(() => extractContent(isFeatures ? featuresHtml : pricingHtml, isFeatures ? 'features-main' : 'pricing-main'), [isFeatures]);
  return <main className="legacy-marketing-content" dangerouslySetInnerHTML={{ __html: markup }} />;
}

export const Features = () => <MarketingPage type="features" />;
export const Pricing = () => <MarketingPage type="pricing" />;

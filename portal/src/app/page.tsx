import type { Metadata, Viewport } from 'next';
import { GITHUB_URL, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '@/lib/site';
import { Developers } from '@/components/landing/developers';
import { Ethiopia } from '@/components/landing/ethiopia';
import { Faq, FinalCta, Footer } from '@/components/landing/closing';
import { Features } from '@/components/landing/features';
import { Hero } from '@/components/landing/hero';
import { HowItWorks } from '@/components/landing/how-it-works';
import { LandingNav } from '@/components/landing/nav';
import { OneLineVerify } from '@/components/landing/one-line-verify';
import { OpenSource } from '@/components/landing/open-source';
import { Savings } from '@/components/landing/savings';
import { Sdk } from '@/components/landing/sdk';
import { UseCases } from '@/components/landing/use-cases';
import { VerifySection } from '@/components/landing/verify-section';

export const metadata: Metadata = { alternates: { canonical: '/' } };
export const viewport: Viewport = { themeColor: '#01061a', viewportFit: 'cover' };

// Structured data so search engines know this is a software product with a free plan.
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: SITE_NAME,
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'Web',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'ETB', description: 'Free and open source (AGPL-3.0); hosted service with a fair-use limit' },
  license: 'https://www.gnu.org/licenses/agpl-3.0.html',
  codeRepository: GITHUB_URL,
};

// Hides the hero's parts before first paint so the entrance can reveal them. Only when
// Web Animations and matchMedia exist and motion is allowed; gives up after 3.5 s.
const introScript = `(function(){try{var d=document.documentElement;if(d.dataset.intro||!('animate' in d)||!window.matchMedia||matchMedia('(prefers-reduced-motion: reduce)').matches)return;d.classList.add('intro');setTimeout(function(){if(!d.dataset.intro)d.classList.remove('intro')},3500)}catch(e){}})()`;

export default function LandingPage() {
  return (
    <div className="landing overflow-x-clip">
      <script dangerouslySetInnerHTML={{ __html: introScript }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <LandingNav />
      <main>
        <Hero />
        <UseCases />
        <Ethiopia />
        <VerifySection />
        <OneLineVerify />
        <Savings />
        <Features />
        <HowItWorks />
        <Developers />
        <Sdk />
        <OpenSource />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}

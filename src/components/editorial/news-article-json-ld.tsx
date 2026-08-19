import type { PublicNews } from "@/modules/communications/news";
import { getCanonicalUrl } from "@/platform/config/discoverability";

export function NewsArticleJsonLd({ news }: { news: PublicNews }) {
  const canonicalUrl = getCanonicalUrl(`/news/${news.slug}`);
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: news.headline,
    description: news.summary,
    datePublished: news.publishedAt.toISOString(),
    ...(canonicalUrl ? { mainEntityOfPage: canonicalUrl } : {}),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
      }}
    />
  );
}

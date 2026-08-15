import type { PublicNews } from "@/modules/communications/news";

function canonicalNewsUrl(slug: string) {
  return new URL(
    `/news/${slug}`,
    process.env.APP_BASE_URL ?? "http://localhost:3000",
  ).toString();
}

export function NewsArticleJsonLd({ news }: { news: PublicNews }) {
  const canonicalUrl = canonicalNewsUrl(news.slug);
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: news.headline,
    description: news.summary,
    datePublished: news.publishedAt.toISOString(),
    mainEntityOfPage: canonicalUrl,
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

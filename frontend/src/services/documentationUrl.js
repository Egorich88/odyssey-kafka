const publishedDocumentation = 'https://egorich88.github.io/odyssey-kafka/';

export function documentationUrl(language) {
  const base = import.meta.env.DEV && import.meta.env.VITE_ODYSSEY_DOCS_URL || publishedDocumentation;
  return new URL(language === 'en' ? 'en/' : './', base).href;
}

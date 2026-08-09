interface PublishedArticle {
  data: {
    publishedAt: Date | string;
  };
}

function publishedTimestamp(article: PublishedArticle): number {
  const value = new Date(article.data.publishedAt).getTime();
  return Number.isNaN(value) ? 0 : value;
}

/** Article ordering always follows original publication date, newest first. */
export function byOriginalPublicationDateDesc(
  left: PublishedArticle,
  right: PublishedArticle,
): number {
  return publishedTimestamp(right) - publishedTimestamp(left);
}

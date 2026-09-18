export type ExploreFeedItem = {
  id: string;
  type: "image" | "video" | string;
  title: string;
  prompt: string;
  mediaUrl: string;
  thumbnailUrl: string;
  /** Reference media used for the original generation (from generation_params). */
  referenceUrls: string[];
  modelId: string | null;
  likeCount: number;
  favoriteCount: number;
  viewCount: number;
  recreateCount: number;
  author: {
    nickname: string;
    avatarUrl: string | null;
  };
  aspectRatio: string | null;
  width: number | null;
  height: number | null;
  tags: string[];
  createdAt: string | null;
};

export type ExploreFeedResult = {
  items: ExploreFeedItem[];
  nextCursor: string | null;
  hasMore: boolean;
};

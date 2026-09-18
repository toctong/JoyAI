export type ExploreFeedItem = {
  id: string;
  type: string;
  title: string;
  prompt: string;
  mediaUrl: string;
  thumbnailUrl: string;
  /** Reference media from upstream generation_params.image_inputs etc. */
  referenceUrls?: string[];
  modelId: string | null;
  likeCount: number;
  recreateCount?: number;
  author: {
    nickname: string;
    avatarUrl: string | null;
  };
  aspectRatio: string | null;
  width: number | null;
  height: number | null;
  tags: string[];
};

export type ExploreFeedResult = {
  items: ExploreFeedItem[];
  nextCursor: string | null;
  hasMore: boolean;
};

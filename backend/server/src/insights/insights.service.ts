import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SEEDED_INSIGHT_POSTS } from './insights.seed';

type InsightRow = {
  id: string;
  slug: string;
  title: string;
  introduction: string;
  summary: string;
  articleUrl: string;
  publishedAt: Date | string;
  readingMinutes: number;
  source: string;
  institution: string;
  tags: string[];
  savedBy?: { caregiverId: string }[];
};

@Injectable()
export class InsightsService {
  constructor(private readonly prisma: PrismaService) {}

  async listPosts(caregiverId: string) {
    try {
      await this.ensureSeeded();
      const posts = await (this.prisma as any).insightPost.findMany({
        orderBy: { publishedAt: 'desc' },
        include: { savedBy: { where: { caregiverId } } },
      });
      return posts.map((post: InsightRow) => this.serialize(post));
    } catch {
      return SEEDED_INSIGHT_POSTS.map((post) => ({ ...post, saved: false }));
    }
  }

  async listSavedPosts(caregiverId: string) {
    try {
      await this.ensureSeeded();
      const saved = await (this.prisma as any).savedInsightPost.findMany({
        where: { caregiverId },
        orderBy: { savedAt: 'desc' },
        include: { post: true },
      });
      return saved.map((item: { post: InsightRow }) => this.serialize({ ...item.post, savedBy: [{ caregiverId }] }));
    } catch {
      return [];
    }
  }

  async savePost(caregiverId: string, postId: string) {
    await this.ensureSeeded();
    await (this.prisma as any).savedInsightPost.upsert({
      where: { caregiverId_postId: { caregiverId, postId } },
      create: { caregiverId, postId },
      update: {},
    });
    return { saved: true };
  }

  async unsavePost(caregiverId: string, postId: string) {
    await (this.prisma as any).savedInsightPost.deleteMany({
      where: { caregiverId, postId },
    });
    return { saved: false };
  }

  private serialize(post: InsightRow) {
    return {
      id: post.id,
      slug: post.slug,
      title: post.title,
      introduction: post.introduction,
      summary: post.summary,
      articleUrl: post.articleUrl,
      publishedAt: post.publishedAt instanceof Date ? post.publishedAt.toISOString() : post.publishedAt,
      readingMinutes: post.readingMinutes,
      source: post.source,
      institution: post.institution,
      tags: post.tags,
      saved: (post.savedBy?.length ?? 0) > 0,
    };
  }

  private async ensureSeeded() {
    await Promise.all(SEEDED_INSIGHT_POSTS.map((post) => (
      (this.prisma as any).insightPost.upsert({
        where: { slug: post.slug },
        create: {
          ...post,
          publishedAt: new Date(post.publishedAt),
        },
        update: {
          title: post.title,
          introduction: post.introduction,
          summary: post.summary,
          articleUrl: post.articleUrl,
          publishedAt: new Date(post.publishedAt),
          readingMinutes: post.readingMinutes,
          source: post.source,
          institution: post.institution,
          tags: post.tags,
        },
      })
    )));
  }
}

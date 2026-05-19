import { Controller, Delete, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { InsightsService } from './insights.service';

@UseGuards(JwtAuthGuard)
@Controller('insights')
export class InsightsController {
  constructor(private readonly insightsService: InsightsService) {}

  @Get()
  listPosts(@Request() req: any) {
    return this.insightsService.listPosts(req.user.userId);
  }

  @Get('saved')
  listSavedPosts(@Request() req: any) {
    return this.insightsService.listSavedPosts(req.user.userId);
  }

  @Post(':id/save')
  savePost(@Request() req: any, @Param('id') id: string) {
    return this.insightsService.savePost(req.user.userId, id);
  }

  @Delete(':id/save')
  unsavePost(@Request() req: any, @Param('id') id: string) {
    return this.insightsService.unsavePost(req.user.userId, id);
  }
}

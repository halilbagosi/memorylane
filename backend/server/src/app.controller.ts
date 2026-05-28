import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  getHome() {
    return {
      name: 'MemoryLane API',
      status: 'healthy',
      version: '1.0.0',
    };
  }
}

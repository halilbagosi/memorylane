import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('Auth endpoints (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/auth/login (POST) rejects invalid credentials with 401', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'nonexistent@test.com', password: 'WrongPassword1!' })
      .expect(401);
  });

  it('/auth/login (POST) rejects missing fields with 400', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({})
      .expect(400);
  });

  it('/auth/signup (POST) rejects weak password with 400', () => {
    return request(app.getHttpServer())
      .post('/auth/signup')
      .send({ name: 'Test', surname: 'User', email: 'test@example.com', password: 'weak' })
      .expect(400);
  });
});

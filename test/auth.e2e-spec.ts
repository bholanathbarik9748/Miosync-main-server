import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './app.module';

describe('Authentication (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/api/v2/auth/register (POST)', () => {
    return request(app.getHttpServer())
      .post('/api/v2/auth/register')
      .send({
        email: 'test@example.com',
        password: 'password123',
        firstName: 'John',
        lastName: 'Doe',
      })
      .expect(201)
      .expect((res) => {
        expect(res.body).toHaveProperty('access_token');
        expect(res.body).toHaveProperty('user');
        expect(res.body.user.email).toBe('test@example.com');
      });
  });

  it('/api/v2/auth/login (POST)', () => {
    return request(app.getHttpServer())
      .post('/api/v2/auth/login')
      .send({
        email: 'test@example.com',
        password: 'password123',
      })
      .expect(201)
      .expect((res) => {
        expect(res.body).toHaveProperty('access_token');
        expect(res.body.user);
      });
  });

  it('/api/v2/auth/profile (GET) - should require authentication', () => {
    return request(app.getHttpServer())
      .get('/api/v2/auth/profile')
      .expect(401);
  });
});

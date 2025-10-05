const request = require('supertest');
const app = require('../src/app');
const setup = require('./setup');
const mongoose = require('mongoose');
const User = require('../src/models/User');

beforeAll(async () => {
  await setup.connect();
});

afterAll(async () => {
  await setup.closeDatabase();
});

afterEach(async () => {
  await setup.clearDatabase();
});

describe('Auth', () => {
  test('signup and login flow', async () => {
    const signupRes = await request(app).post('/api/auth/signup').send({
      first_name: 'Jane',
      last_name: 'Doe',
      email: 'jane@example.com',
      password: 'password123'
    });
    expect(signupRes.status).toBe(201);
    expect(signupRes.body.token).toBeDefined();

    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'jane@example.com',
      password: 'password123'
    });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.token).toBeDefined();
  });

  test('cannot signup with existing email', async () => {
    await User.create({ first_name: 'A', last_name: 'B', email: 'x@y.com', password: 'pass' });
    const res = await request(app).post('/api/auth/signup').send({
      first_name: 'A',
      last_name: 'B',
      email: 'x@y.com',
      password: 'pass'
    });
    expect(res.status).toBe(409);
  });
});

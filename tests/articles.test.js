const request = require('supertest');
const app = require('../src/app');
const setup = require('./setup');
const User = require('../src/models/User');
const Article = require('../src/models/Article');

let token;
let userId;

beforeAll(async () => {
  await setup.connect();
  // create user and token
  const res = await request(app).post('/api/auth/signup').send({
    first_name: 'Author',
    last_name: 'One',
    email: 'author@example.com',
    password: 'password'
  });
  token = res.body.token;
  // get user id
  const user = await User.findOne({ email: 'author@example.com' });
  userId = user._id;
});

afterAll(async () => {
  await setup.closeDatabase();
});

afterEach(async () => {
  await setup.clearDatabase();
});

test('create article (draft) and publish and read', async () => {
  // signup returns token but the in-memory DB was cleared by afterEach; so create again
  const r1 = await request(app).post('/api/auth/signup').send({
    first_name: 'Author',
    last_name: 'One',
    email: 'author2@example.com',
    password: 'password'
  });
  const t = r1.body.token;

  // create article
  const createRes = await request(app)
    .post('/api/articles')
    .set('Authorization', `Bearer ${t}`)
    .send({
      title: 'My Article',
      description: 'desc',
      body: 'This is the article body. '.repeat(50),
      tags: ['tag1', 'tag2']
    });
  expect(createRes.status).toBe(201);
  const articleId = createRes.body._id;
  expect(createRes.body.state).toBe('draft');

  // cannot get by public
  const getPublic = await request(app).get(`/api/articles/${articleId}`);
  expect(getPublic.status).toBe(403);

  // publish
  const publishRes = await request(app)
    .patch(`/api/articles/${articleId}/publish`)
    .set('Authorization', `Bearer ${t}`)
    .send();
  expect(publishRes.status).toBe(200);
  expect(publishRes.body.state).toBe('published');

  // public can fetch and read_count increments
  const firstFetch = await request(app).get(`/api/articles/${articleId}`);
  expect(firstFetch.status).toBe(200);
  expect(firstFetch.body.read_count).toBe(1);

  const secondFetch = await request(app).get(`/api/articles/${articleId}`);
  expect(secondFetch.body.read_count).toBe(2);
});

test('list published articles pagination & search', async () => {
  const r = await request(app).post('/api/auth/signup').send({
    first_name: 'A',
    last_name: 'B',
    email: 'searcher@example.com',
    password: 'password'
  });
  const t = r.body.token;

  // create 30 articles; publish half
  for (let i = 1; i <= 30; i++) {
    const cr = await request(app).post('/api/articles').set('Authorization', `Bearer ${t}`).send({
      title: `Title ${i}`,
      description: `Desc ${i}`,
      body: `Body ${i} `.repeat(40),
      tags: i % 2 === 0 ? ['even'] : ['odd']
    });
    if (i % 3 === 0) {
      await request(app).patch(`/api/articles/${cr.body._id}/publish`).set('Authorization', `Bearer ${t}`).send();
    }
  }

  // list published (should be those with i % 3 === 0)
  const listRes = await request(app).get('/api/articles').query({ page: 1, limit: 10 });
  expect(listRes.status).toBe(200);
  expect(listRes.body.results.length).toBeLessThanOrEqual(10);

  // search by title
  const searchRes = await request(app).get('/api/articles').query({ search: 'Title 3' });
  expect(searchRes.status).toBe(200);
  // results contain title 3 if published
});

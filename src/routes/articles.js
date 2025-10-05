const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const articleController = require('../controllers/articleController');

// public list and create
router.get('/', async (req, res, next) => {
  // attach user if header present (optional)
  // we pass through to controller which reads req.user (populated by auth middleware). To allow listing both for anonymous and for authenticated users, attempt to set req.user if token exists.
  const header = req.header('Authorization') || '';
  if (header.startsWith('Bearer ')) {
    try {
      // lazy require to avoid circular deps
      const jwt = require('jsonwebtoken');
      const payload = jwt.verify(header.replace('Bearer ', ''), process.env.JWT_SECRET);
      const User = require('../models/User');
      const user = await User.findById(payload.id).select('-password');
      if (user) req.user = user;
    } catch (err) {
      // ignore token errors for public list
    }
  }
  return require('../controllers/articleController').listArticles(req, res, next);
});

router.get('/:id', async (req, res, next) => {
  // similar token attach to allow owner to read unpublished
  const header = req.header('Authorization') || '';
  if (header.startsWith('Bearer ')) {
    try {
      const jwt = require('jsonwebtoken');
      const payload = jwt.verify(header.replace('Bearer ', ''), process.env.JWT_SECRET);
      const User = require('../models/User');
      const user = await User.findById(payload.id).select('-password');
      if (user) req.user = user;
    } catch (err) {
      // ignore
    }
  }
  return require('../controllers/articleController').getArticle(req, res, next);
});

// protected routes below
router.use(auth);

router.post('/', articleController.createArticle);
router.get('/me', articleController.getMyArticles);
router.patch('/:id', articleController.updateArticle);
router.patch('/:id/publish', articleController.publishArticle);
router.delete('/:id', articleController.deleteArticle);

module.exports = router;

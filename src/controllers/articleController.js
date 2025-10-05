const Article = require('../models/Article');
const { computeReadingTime } = require('../utils/readingTime');
const mongoose = require('mongoose');

// create article
exports.createArticle = async (req, res, next) => {
  try {
    const { title, description, body, tags } = req.body;
    if (!title || !body) return res.status(400).json({ message: 'title and body are required' });
    const existing = await Article.findOne({ title });
    if (existing) return res.status(409).json({ message: 'title already exists' });
    const reading_time = computeReadingTime(body);
    const article = new Article({
      title,
      description,
      body,
      tags: Array.isArray(tags) ? tags : (tags ? String(tags).split(',').map(t => t.trim()) : []),
      author: req.user._id,
      reading_time,
      state: 'draft'
    });
    await article.save();
    res.status(201).json(article);
  } catch (err) {
    next(err);
  }
};

// list articles (public - only published by default unless filters and auth)
exports.listArticles = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      state,
      search,
      sort // e.g. -read_count or reading_time
    } = req.query;

    const query = {};
    // default: only published for anonymous requests
    if (!req.user) {
      query.state = 'published';
    }
    if (state) {
      // if state provided and user is not owner/authenticated, restrict to published
      if (!req.user && state !== 'published') {
        return res.status(401).json({ message: 'Unauthorized to view non-published articles' });
      }
      query.state = state;
    }
    // search by title, description, tags, or author name/email
    if (search) {
      const regex = new RegExp(search, 'i');
      query.$or = [
        { title: regex },
        { description: regex },
        { tags: regex }
      ];
      // for author search we will join later in aggregate - but simple approach: populate author and filter by $or via aggregation
    }

    // build mongoose query
    let mongooseQuery = Article.find(query).populate('author', 'first_name last_name email');

    // if search includes author, we need to filter after population; easiest is to filter in JS for small sets. For pagination correctness, better to use aggregation - but for simplicity use aggregation if search provided
    if (search) {
      const regex = new RegExp(search, 'i');
      // aggregation to match author name/email too
      const agg = Article.aggregate([
        { $match: query },
        {
          $lookup: {
            from: 'users',
            localField: 'author',
            foreignField: '_id',
            as: 'author'
          }
        },
        { $unwind: '$author' },
        {
          $match: {
            $or: [
              { title: regex },
              { description: regex },
              { tags: regex },
              { 'author.first_name': regex },
              { 'author.last_name': regex },
              { 'author.email': regex }
            ]
          }
        }
      ]);
      // sorting, pagination on aggregation
      // sort
      if (sort) {
        const direction = sort.startsWith('-') ? -1 : 1;
        const key = sort.replace(/^-/, '');
        agg.sort({ [key]: direction });
      } else {
        agg.sort({ createdAt: -1 });
      }
      const p = parseInt(page, 10);
      const l = Math.min(parseInt(limit, 10) || 20, 100);
      const skip = (p - 1) * l;
      const results = await agg.skip(skip).limit(l);
      // convert author._id to string - Mongoose will handle but we are in aggregation result
      const totalAgg = await Article.aggregate([
        { $match: query },
        {
          $lookup: { from: 'users', localField: 'author', foreignField: '_id', as: 'author' }
        },
        { $unwind: '$author' },
        {
          $match: {
            $or: [
              { title: regex },
              { description: regex },
              { tags: regex },
              { 'author.first_name': regex },
              { 'author.last_name': regex },
              { 'author.email': regex }
            ]
          }
        },
        { $count: 'count' }
      ]);
      const total = totalAgg[0] ? totalAgg[0].count : 0;
      return res.json({
        page: p,
        limit: l,
        total,
        results
      });
    }

    // if not aggregate search:
    // sort
    if (sort) {
      mongooseQuery = mongooseQuery.sort(sort);
    } else {
      mongooseQuery = mongooseQuery.sort({ createdAt: -1 });
    }

    const p = parseInt(page, 10);
    const l = Math.min(parseInt(limit, 10) || 20, 100);
    const skip = (p - 1) * l;

    const [results, total] = await Promise.all([
      mongooseQuery.skip(skip).limit(l).exec(),
      Article.countDocuments(query)
    ]);

    res.json({ page: p, limit: l, total, results });
  } catch (err) {
    next(err);
  }
};

// get single article
exports.getArticle = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });
    const article = await Article.findById(id).populate('author', 'first_name last_name email bio');
    if (!article) return res.status(404).json({ message: 'Article not found' });
    // if not published and not owner -> forbidden
    if (article.state !== 'published') {
      if (!req.user || article.author._id.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Article is not published' });
      }
    }
    // increment read count only when published and when requester is not the author
    if (article.state === 'published' && (!req.user || article.author._id.toString() !== req.user._id.toString())) {
      article.read_count = (article.read_count || 0) + 1;
      await article.save();
    }
    res.json(article);
  } catch (err) {
    next(err);
  }
};

// get user's own articles
exports.getMyArticles = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, state, sort } = req.query;
    const query = { author: req.user._id };
    if (state) query.state = state;
    let q = Article.find(query).populate('author', 'first_name last_name email');
    if (sort) q = q.sort(sort);
    else q = q.sort({ createdAt: -1 });
    const p = parseInt(page, 10);
    const l = Math.min(parseInt(limit, 10) || 20, 100);
    const results = await q.skip((p - 1) * l).limit(l).exec();
    const total = await Article.countDocuments(query);
    res.json({ page: p, limit: l, total, results });
  } catch (err) {
    next(err);
  }
};

// update article (owner only)
exports.updateArticle = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const article = await Article.findById(id);
    if (!article) return res.status(404).json({ message: 'Article not found' });
    if (article.author.toString() !== req.user._id.toString()) return res.status(403).json({ message: 'Not allowed' });
    // update reading_time if body changed
    if (updates.body) {
      updates.reading_time = computeReadingTime(updates.body);
    }
    Object.assign(article, updates);
    await article.save();
    res.json(article);
  } catch (err) {
    next(err);
  }
};

// publish article - owner only
exports.publishArticle = async (req, res, next) => {
  try {
    const { id } = req.params;
    const article = await Article.findById(id);
    if (!article) return res.status(404).json({ message: 'Article not found' });
    if (article.author.toString() !== req.user._id.toString()) return res.status(403).json({ message: 'Not allowed' });
    article.state = 'published';
    await article.save();
    res.json(article);
  } catch (err) {
    next(err);
  }
};

// delete article - owner only
exports.deleteArticle = async (req, res, next) => {
  try {
    const { id } = req.params;
    const article = await Article.findById(id);
    if (!article) return res.status(404).json({ message: 'Article not found' });
    if (article.author.toString() !== req.user._id.toString()) return res.status(403).json({ message: 'Not allowed' });
    await article.deleteOne();
    res.json({ message: 'Deleted' });
  } catch (err) {
    next(err);
  }
};

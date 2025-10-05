const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const authRoutes = require('./routes/auth');
const articleRoutes = require('./routes/articles');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(morgan('dev'));

app.get('/', (req, res) => res.send({ status: 'ok', message: 'Blog API' }));
app.use('/api/auth', authRoutes);
app.use('/api/articles', articleRoutes);

// error handler
app.use(errorHandler);

module.exports = app;

// API routes only for Vercel serverless functions
require('dotenv').config();

const express = require('express');
const path = require('path');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();

// Vercel 환경에서 trust proxy 설정
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

// CORS 설정
const corsOptions = {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3001'],
    credentials: true,
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Rate Limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    message: '너무 많은 요청이 발생했습니다. 잠시 후 다시 시도해주세요.'
});
app.use('/api/', limiter);

// Serverless functions don't need logging middleware

// Body Parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API 라우트 only
const patentApiRoutes = require('../routes/api');
app.use('/', patentApiRoutes);

// 404 에러 처리
app.use((req, res, next) => {
    res.status(404).render('404', {
        title: '페이지를 찾을 수 없습니다'
    });
});

// 에러 처리 미들웨어
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500).render('error', {
        title: '오류가 발생했습니다',
        message: err.message || '서버 오류가 발생했습니다.',
        error: process.env.NODE_ENV === 'development' ? err : {}
    });
});

// Vercel serverless function export
module.exports = app;
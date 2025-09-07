// routes/web.js - 웹 페이지 라우트
const express = require('express');
const router = express.Router();

// 메인 페이지 (등록특허 현황)
router.get('/', (req, res) => {
    res.render('registered', {
        title: '등록특허 현황'
    });
});

// 등록특허 현황
router.get('/registered', (req, res) => {
    res.render('registered', {
        title: '등록특허 현황'
    });
});

// 등록특허 조회 (크롤링 기반)
router.get('/patent-search', (req, res) => {
    res.render('patent-search', {
        title: '등록특허 조회'
    });
});

// 출원특허 현황
router.get('/application', (req, res) => {
    res.render('application', {
        title: '출원특허 현황'
    });
});

// 연차료 조회
router.get('/fee-search', (req, res) => {
    res.render('fee-search', {
        title: '연차료 조회'
    });
});

// 감사 페이지 (연차료 납부의뢰 완료 후)
router.get('/thanks', (req, res) => {
    res.render('thanks', {
        title: '신청 완료'
    });
});

module.exports = router;
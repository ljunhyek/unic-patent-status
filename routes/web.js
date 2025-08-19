// routes/web.js - 웹 페이지 라우트
const express = require('express');
const router = express.Router();

// 메인 페이지 (등록특허 현황)
router.get('/', (req, res) => {
    res.render('registered', {
        title: '등록특허 현황',
        defaultCustomerNumber: process.env.DEFAULT_CUSTOMER_NUMBER || '120190612244'
    });
});

// 등록특허 현황
router.get('/registered', (req, res) => {
    res.render('registered', {
        title: '등록특허 현황',
        defaultCustomerNumber: process.env.DEFAULT_CUSTOMER_NUMBER || '120190612244'
    });
});

// 출원특허 현황
router.get('/application', (req, res) => {
    res.render('application', {
        title: '출원특허 현황',
        defaultCustomerNumber: process.env.DEFAULT_CUSTOMER_NUMBER || '120190612244'
    });
});

module.exports = router;
// routes/api.js - API 라우트
const express = require('express');
const router = express.Router();
const patentService = require('../services/patentService');

// 등록특허 검색 API
router.post('/search-registered', async (req, res) => {
    try {
        const { customerNumber } = req.body;
        
        if (!customerNumber) {
            return res.status(400).json({
                success: false,
                error: '고객번호를 입력해주세요.'
            });
        }

        // 고객번호 형식 정리
        const cleanedNumber = customerNumber.replace(/-/g, '');
        
        // 등록특허 정보 조회
        const result = await patentService.searchRegisteredPatents(cleanedNumber);
        
        res.json({
            success: true,
            ...result
        });

    } catch (error) {
        console.error('등록특허 검색 오류:', error);
        
        if (process.env.NODE_ENV === 'development') {
            return res.status(500).json({
                success: false,
                error: error.message,
                stack: error.stack
            });
        }
        
        res.status(500).json({
            success: false,
            error: '특허 정보를 조회하는 중 오류가 발생했습니다.'
        });
    }
});

// 출원특허 검색 API
router.post('/search-application', async (req, res) => {
    try {
        const { customerNumber } = req.body;
        
        if (!customerNumber) {
            return res.status(400).json({
                success: false,
                error: '고객번호를 입력해주세요.'
            });
        }

        // 고객번호 형식 정리
        const cleanedNumber = customerNumber.replace(/-/g, '');
        
        // 출원특허 정보 조회
        const result = await patentService.searchApplicationPatents(cleanedNumber);
        
        res.json({
            success: true,
            ...result
        });

    } catch (error) {
        console.error('출원특허 검색 오류:', error);
        
        if (process.env.NODE_ENV === 'development') {
            return res.status(500).json({
                success: false,
                error: error.message,
                stack: error.stack
            });
        }
        
        res.status(500).json({
            success: false,
            error: '특허 정보를 조회하는 중 오류가 발생했습니다.'
        });
    }
});

// 특허 상세 정보 조회 API (출원번호별)
router.post('/get-patent-details', async (req, res) => {
    try {
        const { applicationNumbers } = req.body;
        
        if (!applicationNumbers || !Array.isArray(applicationNumbers)) {
            return res.status(400).json({
                success: false,
                error: '출원번호 목록이 필요합니다.'
            });
        }

        // 각 출원번호에 대해 상세 정보 조회
        const detailsPromises = applicationNumbers.map(async (appNumber) => {
            try {
                return await patentService.getPatentDetailsByApplicationNumber(appNumber);
            } catch (error) {
                console.error(`출원번호 ${appNumber} 처리 중 오류:`, error.message);
                return null;
            }
        });
        
        const details = await Promise.all(detailsPromises);
        
        // 결과를 출원번호를 키로 하는 객체로 변환
        const detailsMap = {};
        details.forEach((detail, index) => {
            if (detail) {
                detailsMap[applicationNumbers[index]] = detail;
            }
        });
        
        res.json({
            success: true,
            details: detailsMap
        });

    } catch (error) {
        console.error('특허 상세 정보 조회 오류:', error);
        
        if (process.env.NODE_ENV === 'development') {
            return res.status(500).json({
                success: false,
                error: error.message,
                stack: error.stack
            });
        }
        
        res.status(500).json({
            success: false,
            error: '특허 상세 정보를 조회하는 중 오류가 발생했습니다.'
        });
    }
});

// 엑셀 다운로드 API
router.post('/export-excel', async (req, res) => {
    try {
        const { patents, type } = req.body;
        
        if (!patents || !Array.isArray(patents)) {
            return res.status(400).json({
                success: false,
                error: '다운로드할 특허 데이터가 없습니다.'
            });
        }

        // CSV 생성
        const csv = patentService.generateCSV(patents, type);
        
        // 파일명 생성 (현재 날짜 포함)
        const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const filename = type === 'registered' 
            ? `등록특허현황_${currentDate}.csv` 
            : `출원특허현황_${currentDate}.csv`;
        
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=${encodeURIComponent(filename)}`);
        res.send('\ufeff' + csv); // BOM 추가 (한글 깨짐 방지)

    } catch (error) {
        console.error('엑셀 다운로드 오류:', error);
        res.status(500).json({
            success: false,
            error: '엑셀 파일 생성 중 오류가 발생했습니다.'
        });
    }
});

module.exports = router;
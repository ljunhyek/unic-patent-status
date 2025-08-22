// routes/api.js - API 라우트
const express = require('express');
const router = express.Router();
const patentService = require('../services/patentService');
const axios = require('axios');

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

        // 고객번호 검증 (12자리 숫자)
        const cleanedNumber = customerNumber.trim();
        
        // 12자리 숫자 검증
        if (!/^\d{12}$/.test(cleanedNumber)) {
            return res.status(400).json({
                success: false,
                error: '고객번호는 12자리 숫자여야 합니다.'
            });
        }
        
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

// 출원특허 검색 API (개선된 버전)
router.post('/search-application', async (req, res) => {
    try {
        const { customerNumber } = req.body;
        
        if (!customerNumber) {
            return res.status(400).json({
                success: false,
                error: '고객번호를 입력해주세요.'
            });
        }

        // 고객번호 검증 (12자리 숫자)
        const cleanedNumber = customerNumber.trim();
        
        // 12자리 숫자 검증
        if (!/^\d{12}$/.test(cleanedNumber)) {
            return res.status(400).json({
                success: false,
                error: '고객번호는 12자리 숫자여야 합니다.'
            });
        }
        
        // 1단계: 기본 출원특허 정보 조회
        const result = await patentService.searchApplicationPatents(cleanedNumber);
        
        // 2단계: 각 출원번호에 대해 상세 정보 조회
        if (result.patents && result.patents.length > 0) {
            const applicationNumbers = result.patents.map(p => p.applicationNumber).filter(num => num && num !== '-');
            
            if (applicationNumbers.length > 0) {
                try {
                    // 상세 정보 조회
                    const detailsPromises = applicationNumbers.map(async (appNumber) => {
                        try {
                            return await patentService.getPatentDetailsByApplicationNumber(appNumber);
                        } catch (error) {
                            console.error(`출원번호 ${appNumber} 상세 정보 조회 오류:`, error.message);
                            return null;
                        }
                    });
                    
                    const details = await Promise.all(detailsPromises);
                    
                    // 상세 정보를 기본 특허 정보에 병합
                    result.patents = result.patents.map((patent, index) => {
                        const detail = details[index];
                        if (detail) {
                            return {
                                ...patent,
                                registrationNumber: detail.registrationNumber || patent.registrationNumber,
                                registrationDate: detail.registrationDate || patent.registrationDate,
                                expirationDate: detail.expirationDate || patent.expirationDate,
                                claimCount: detail.claimCount || patent.claimCount
                            };
                        }
                        return patent;
                    });
                } catch (detailError) {
                    console.error('상세 정보 조회 중 오류:', detailError);
                    // 상세 정보 조회 실패는 무시하고 기본 정보만 반환
                }
            }
        }
        
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

        // Excel 생성
        const excelBuffer = patentService.generateExcel(patents, type);
        
        // 파일명 생성 (현재 날짜 포함)
        const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const filename = type === 'registered' 
            ? `등록특허현황_${currentDate}.xlsx` 
            : `출원특허현황_${currentDate}.xlsx`;
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${encodeURIComponent(filename)}`);
        res.send(excelBuffer);

    } catch (error) {
        console.error('엑셀 다운로드 오류:', error);
        res.status(500).json({
            success: false,
            error: '엑셀 파일 생성 중 오류가 발생했습니다.'
        });
    }
});

// 연차료 납부의뢰 API
router.post('/send-renewal-request', async (req, res) => {
    try {
        const { customerNumber, name, email, phone, privacyConsent } = req.body;
        
        // 필수 필드 검증
        if (!customerNumber || !name || !email || !phone || !privacyConsent) {
            return res.status(400).json({
                success: false,
                error: '필수 항목을 모두 입력해주세요.'
            });
        }

        // 이메일 형식 검증
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                error: '올바른 이메일 주소를 입력해주세요.'
            });
        }

        // 개인정보 동의 확인
        if (!privacyConsent) {
            return res.status(400).json({
                success: false,
                error: '개인정보 수집 및 이용에 동의해주세요.'
            });
        }

        // 이메일 내용 구성
        const emailSubject = '연차료 납부의뢰';
        const emailBody = `
새로운 연차료 납부의뢰가 접수되었습니다.

■ 고객 정보
- 고객번호: ${customerNumber}
- 이름: ${name}
- 이메일: ${email}
- 연락처: ${phone}

■ 개인정보 수집 및 이용 동의
- 동의 여부: 동의함
- 동의 시간: ${new Date().toLocaleString('ko-KR')}

■ 처리 요청사항
연차료 납부 대행 서비스를 요청합니다.
대리인 수수료: 건당 20,000원 (부가세 별도)

담당자는 고객에게 연락하여 상세 사항을 안내해 주시기 바랍니다.
        `.trim();

        // Web3Forms API를 사용하여 이메일 전송 (contact.ejs와 동일한 방식)
        const formData = new URLSearchParams();
        formData.append('access_key', 'dd3c9ad5-1802-4bd1-b7e6-397002308afa');
        formData.append('name', name);
        formData.append('email', email);
        formData.append('phone', phone);
        formData.append('inquiry_type', '연차료 납부의뢰');
        formData.append('message', emailBody);
        formData.append('privacy_consent', 'on');

        const response = await axios.post('https://api.web3forms.com/submit', formData.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        const result = response.data;

        if (result.success) {
            res.json({
                success: true,
                message: '연차료 납부의뢰가 성공적으로 전송되었습니다.'
            });
        } else {
            throw new Error(result.message || '이메일 전송에 실패했습니다.');
        }

    } catch (error) {
        console.error('연차료 납부의뢰 전송 오류:', error);
        
        if (process.env.NODE_ENV === 'development') {
            return res.status(500).json({
                success: false,
                error: error.message,
                stack: error.stack
            });
        }
        
        res.status(500).json({
            success: false,
            error: '연차료 납부의뢰 전송 중 오류가 발생했습니다.'
        });
    }
});

module.exports = router;
// routes/api.js - API 라우트
const express = require('express');
const router = express.Router();
const patentService = require('../services/patentService');
const axios = require('axios');

// 크롤링 API 임포트
const crawlPatents = require('../api/crawl-patents');
const getPatentDetailsBulk = require('../api/get-patent-details-bulk');

// 등록특허 검색 API
router.post('/search-registered', async (req, res) => {
    try {
        console.log('🔍 API 호출 시작:', req.body);
        console.log('🌍 환경변수 확인:', {
            hasApiKey: !!process.env.KIPRIS_API_KEY,
            apiBaseUrl: process.env.KIPRIS_API_BASE_URL,
            nodeEnv: process.env.NODE_ENV
        });
        
        const { customerNumber } = req.body;
        
        if (!customerNumber) {
            console.log('❌ 고객번호 없음');
            return res.status(400).json({
                success: false,
                error: '고객번호를 입력해주세요.'
            });
        }

        // 고객번호 정리 및 검증
        const cleanedCustomerNumber = customerNumber.trim();
        console.log('🔢 정리된 고객번호:', cleanedCustomerNumber);
        
        // 고객번호: 12자리 숫자 검증
        if (!/^\d{12}$/.test(cleanedCustomerNumber)) {
            console.log('❌ 고객번호 형식 오류:', cleanedCustomerNumber);
            return res.status(400).json({
                success: false,
                error: '고객번호는 12자리 숫자여야 합니다.'
            });
        }
        
        console.log('🚀 특허 서비스 호출 시작');
        // 등록특허 정보 조회
        const result = await patentService.searchRegisteredPatents(cleanedCustomerNumber);
        console.log('✅ 특허 서비스 결과:', { 
            totalCount: result?.totalCount, 
            patentsLength: result?.patents?.length 
        });
        
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
            : type === 'fee-search'
            ? `연차료조회_${currentDate}.xlsx`
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

// 크롤링 기반 특허 검색 API
router.post('/crawl-patents', crawlPatents);

// 벌크 상세정보 조회 API  
router.post('/get-patent-details-bulk', getPatentDetailsBulk);

// 크롤링 테스트 API
router.get('/test-crawling', async (req, res) => {
    try {
        console.log('🧪 크롤링 테스트 API 호출');
        
        const { chromium } = require('playwright');
        
        let browser;
        try {
            browser = await chromium.launch({ headless: true });
            console.log('✅ Playwright 브라우저 실행 성공');
            
            const page = await browser.newPage();
            await page.goto('https://www.google.com');
            const title = await page.title();
            
            await browser.close();
            
            res.json({
                success: true,
                message: 'Playwright 테스트 성공',
                pageTitle: title,
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            if (browser) await browser.close();
            throw error;
        }
        
    } catch (error) {
        console.error('❌ 크롤링 테스트 오류:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// 크롤링 + 상세정보 조회 통합 API (크롤링3.py 방식)
router.post('/search-patents-by-customer', async (req, res) => {
    try {
        console.log('🔍 통합 특허 검색 API 호출:', req.body);
        
        const { customerNumber } = req.body;
        
        if (!customerNumber) {
            return res.status(400).json({
                success: false,
                error: '고객번호를 입력해주세요.'
            });
        }
        
        // 고객번호 형식 검증
        if (!/^\d{12}$/.test(customerNumber.trim())) {
            return res.status(400).json({
                success: false,
                error: '고객번호는 12자리 숫자여야 합니다.'
            });
        }
        
        console.log('🚀 1단계: KIPRIS 크롤링으로 출원번호 수집');
        
        // 1단계: 크롤링으로 출원번호 수집
        const crawlReq = { 
            method: 'POST',
            body: { customerNumber: customerNumber.trim() }
        };
        
        let crawlResult;
        try {
            crawlResult = await new Promise((resolve, reject) => {
                const mockRes = {
                    json: (data) => resolve(data),
                    status: (code) => ({ json: (data) => resolve({ ...data, statusCode: code }) }),
                    setHeader: () => {},
                    end: () => {}
                };
                
                crawlPatents(crawlReq, mockRes).catch(reject);
            });
        } catch (error) {
            console.error('❌ 크롤링 단계 오류:', error);
            return res.status(500).json({
                success: false,
                error: '출원번호 크롤링 중 오류가 발생했습니다.',
                details: error.message
            });
        }
        
        if (!crawlResult.success || !crawlResult.applicationNumbers || crawlResult.applicationNumbers.length === 0) {
            return res.json({
                success: true,
                customerNumber: customerNumber,
                applicationNumbers: [],
                patents: [],
                totalCount: 0,
                message: '해당 고객번호로 등록된 특허를 찾을 수 없습니다.',
                crawledAt: new Date().toISOString()
            });
        }
        
        console.log(`✅ 크롤링 완료: ${crawlResult.applicationNumbers.length}건의 출원번호 발견`);
        console.log('🔍 2단계: 출원번호별 상세정보 조회');
        
        // 2단계: 상세정보 조회
        const detailReq = {
            method: 'POST',
            body: { applicationNumbers: crawlResult.applicationNumbers }
        };
        
        let detailResult;
        try {
            detailResult = await new Promise((resolve, reject) => {
                const mockRes = {
                    json: (data) => resolve(data),
                    status: (code) => ({ json: (data) => resolve({ ...data, statusCode: code }) }),
                    setHeader: () => {},
                    end: () => {}
                };
                
                getPatentDetailsBulk(detailReq, mockRes).catch(reject);
            });
        } catch (error) {
            console.error('❌ 상세정보 조회 단계 오류:', error);
            return res.status(500).json({
                success: false,
                error: '특허 상세정보 조회 중 오류가 발생했습니다.',
                details: error.message
            });
        }
        
        if (!detailResult.success) {
            return res.status(500).json({
                success: false,
                error: '특허 상세정보 조회에 실패했습니다.',
                details: detailResult.error
            });
        }
        
        console.log(`✅ 상세정보 조회 완료: ${detailResult.patents.length}건`);
        
        // 3단계: 결과 통합 및 반환
        const result = {
            success: true,
            customerNumber: customerNumber,
            applicationNumbers: crawlResult.applicationNumbers,
            patents: detailResult.patents || [],
            totalCount: detailResult.patents ? detailResult.patents.length : 0,
            crawlingInfo: {
                method: crawlResult.method,
                crawledCount: crawlResult.count,
                validCount: detailResult.validCount,
                retrievedCount: detailResult.retrievedCount
            },
            crawledAt: new Date().toISOString()
        };
        
        console.log(`🎉 통합 검색 완료: ${result.totalCount}건의 특허 정보 반환`);
        
        res.json(result);
        
    } catch (error) {
        console.error('❌ 통합 특허 검색 오류:', error);
        
        res.status(500).json({
            success: false,
            error: '통합 특허 검색 중 오류가 발생했습니다.',
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// 연차료 조회 API
router.post('/search-fee', async (req, res) => {
    try {
        const { customerNumber } = req.body;
        
        if (!customerNumber) {
            return res.status(400).json({
                success: false,
                error: '고객번호를 입력해주세요.'
            });
        }

        // 고객번호 정리 및 검증
        const cleanedCustomerNumber = customerNumber.trim();
        
        // 고객번호: 12자리 숫자 검증
        if (!/^\d{12}$/.test(cleanedCustomerNumber)) {
            return res.status(400).json({
                success: false,
                error: '고객번호는 12자리 숫자여야 합니다.'
            });
        }
        
        console.log('🔍 연차료 조회 API 호출:', cleanedCustomerNumber);
        
        // CSV 파일에서 데이터 검색
        const feeData = await searchFeeFromCSV(cleanedCustomerNumber);
        
        res.json({
            success: true,
            customerNumber: cleanedCustomerNumber,
            totalCount: feeData.length,
            feeRecords: feeData
        });

    } catch (error) {
        console.error('연차료 조회 오류:', error);
        
        if (process.env.NODE_ENV === 'development') {
            return res.status(500).json({
                success: false,
                error: error.message,
                stack: error.stack
            });
        }
        
        res.status(500).json({
            success: false,
            error: '연차료 정보를 조회하는 중 오류가 발생했습니다.'
        });
    }
});

// CSV 파일에서 연차료 데이터 검색 함수
async function searchFeeFromCSV(customerNumber) {
    const fs = require('fs').promises;
    const path = require('path');
    
    try {
        const csvPath = path.join(__dirname, '..', 'result_fee.csv');
        const csvContent = await fs.readFile(csvPath, 'utf-8');
        
        // CSV 파싱 (간단한 방식)
        const lines = csvContent.split('\n');
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        
        console.log('📋 CSV 헤더:', headers);
        
        const results = [];
        
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            // CSV 파싱 (콤마로 분할, 따옴표 처리)
            const values = parseCSVLine(line);
            
            if (values.length > 0 && values[0] === customerNumber) {
                const record = {};
                
                // 첫 번째 컬럼(고객번호)을 제외한 나머지 컬럼들을 객체로 변환
                for (let j = 1; j < headers.length; j++) {
                    const key = headers[j];
                    const value = values[j] || '-';
                    record[key] = value;
                }
                
                results.push(record);
            }
        }
        
        console.log(`✅ 고객번호 ${customerNumber}에 대한 연차료 데이터 ${results.length}건 조회됨`);
        return results;
        
    } catch (error) {
        console.error('CSV 파일 읽기 오류:', error);
        throw error;
    }
}

// 간단한 CSV 라인 파싱 함수 (콤마와 따옴표 처리)
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim().replace(/^"|"$/g, ''));
            current = '';
        } else {
            current += char;
        }
    }
    
    // 마지막 값 추가
    result.push(current.trim().replace(/^"|"$/g, ''));
    
    return result;
}

module.exports = router;
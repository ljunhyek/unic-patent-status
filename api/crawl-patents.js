// api/crawl-patents.js - KIPRIS 크롤링 API (Node.js Playwright 기반)
const { chromium } = require('playwright');

module.exports = async (req, res) => {
    // CORS 헤더 설정
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({
            success: false,
            error: 'POST 메서드만 지원합니다.'
        });
    }

    try {
        console.log('🔍 크롤링 API 호출:', req.body);

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

        console.log('🎭 Playwright 크롤링 시작');
        
        // 강제로 Mock 데이터를 사용하려면 FORCE_MOCK=true 환경변수 설정
        if (process.env.FORCE_MOCK === 'true') {
            console.log('⚡ 강제 Mock 모드: Mock 데이터 사용');
            const applicationNumbers = getMockApplicationNumbers(customerNumber);
            
            res.json({
                success: true,
                customerNumber: customerNumber,
                applicationNumbers: applicationNumbers,
                count: applicationNumbers.length,
                crawledAt: new Date().toISOString(),
                method: 'Mock 데이터 (강제 모드)'
            });
            return;
        }
        
        // KIPRIS 크롤링 실행
        const applicationNumbers = await getApplicationNumbers(customerNumber);
        
        console.log('✅ 크롤링 완료:', applicationNumbers.length, '건');
        
        res.json({
            success: true,
            customerNumber: customerNumber,
            applicationNumbers: applicationNumbers,
            count: applicationNumbers.length,
            crawledAt: new Date().toISOString(),
            method: 'KIPRIS 크롤링 (Playwright)'
        });

    } catch (error) {
        console.error('❌ 크롤링 오류:', error);
        
        res.status(500).json({
            success: false,
            error: error.message || '크롤링 중 오류가 발생했습니다.',
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

/**
 * KIPRIS에서 고객번호로 검색하여 출원번호를 추출하는 함수 (크롤링3.py 포팅)
 * 
 * @param {string} customerNumber - 12자리 고객번호
 * @returns {Promise<string[]>} - 출원번호 리스트
 */
async function getApplicationNumbers(customerNumber) {
    let browser;
    
    try {
        console.log(`🎭 KIPRIS 크롤링 시작 - 고객번호: ${customerNumber}`);
        
        // 브라우저 실행 (headless=true로 설정)
        console.log('📱 Playwright Chromium 브라우저 실행 중...');
        browser = await chromium.launch({ 
            headless: true,
            timeout: 60000,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ]
        });
        console.log('✅ 브라우저 실행 성공');
        
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        const page = await context.newPage();
        console.log('✅ 새 페이지 생성 성공');
        
        // 1. KIPRIS 홈페이지 접속
        console.log('🌐 KIPRIS 홈페이지 접속 중...');
        await page.goto("https://www.kipris.or.kr/khome/main.do", { 
            waitUntil: "networkidle",
            timeout: 60000
        });
        console.log('✅ KIPRIS 홈페이지 접속 성공');
        
        // 2. 검색어 입력
        const searchQuery = `TRH=[${customerNumber}]`;
        console.log(`🔍 검색어 준비: ${searchQuery}`);
        
        // 검색어 입력란 찾기
        console.log('📝 검색 입력란 찾는 중...');
        const searchInput = page.locator("#inputQuery");
        await searchInput.waitFor({ timeout: 15000 });
        console.log('✅ 검색 입력란 발견');
        
        await searchInput.fill(searchQuery);
        console.log('✅ 검색어 입력 완료');
        
        // 3. 검색 버튼 클릭 (Enter 키 사용)
        console.log("🚀 검색 실행 중...");
        await searchInput.press("Enter");
        console.log('✅ Enter 키 입력 완료');
        
        // 검색 결과 페이지 로딩 대기
        console.log('⏳ 검색 결과 로딩 대기 중...');
        await page.waitForLoadState("networkidle", { timeout: 30000 });
        await page.waitForTimeout(5000); // 추가 대기 시간
        console.log('✅ 검색 결과 페이지 로딩 완료');
        
        // 4. 출원번호 추출
        console.log("📋 출원번호 추출 중...");
        const applicationNumbers = [];
        
        // 출원번호가 포함된 요소들 찾기 (여러 가능한 셀렉터 시도)
        const selectors = [
            "p.txt",  // 제공된 셀렉터
            "td:has-text('20')",  // 출원번호가 20으로 시작하는 경우가 많음
            "[class*='application']",  // application이 포함된 클래스
            "span:has-text('20')"  // span 태그 내 출원번호
        ];
        
        for (const selector of selectors) {
            try {
                const elements = await page.locator(selector).all();
                
                for (const element of elements) {
                    const text = await element.innerText();
                    // 12자리 또는 13자리 숫자 패턴 찾기 (출원번호)
                    const matches = text.match(/\b(\d{12,13})\b/g);
                    
                    if (matches) {
                        for (const match of matches) {
                            if (!applicationNumbers.includes(match)) {
                                applicationNumbers.push(match);
                                console.log(`  ✅ 찾은 출원번호: ${match}`);
                            }
                        }
                    }
                }
            } catch (error) {
                // 특정 셀렉터에서 오류가 발생해도 계속 진행
                console.log(`⚠️ 셀렉터 ${selector} 처리 중 오류 (무시): ${error.message}`);
            }
        }
        
        // 결과가 없는 경우 페이지 내용 확인
        if (applicationNumbers.length === 0) {
            console.log("❌ 출원번호를 찾을 수 없습니다. 페이지 구조를 확인 중...");
            
            try {
                // 현재 페이지 URL 확인
                const currentUrl = page.url();
                console.log(`📍 현재 페이지 URL: ${currentUrl}`);
                
                // 페이지 제목 확인
                const pageTitle = await page.title();
                console.log(`📄 페이지 제목: ${pageTitle}`);
                
                // 디버깅을 위해 페이지 내용 일부 확인
                const content = await page.content();
                if (content.includes("검색결과가 없습니다") || content.includes("검색 결과가 없습니다")) {
                    console.log("📭 KIPRIS에서 검색 결과가 없다고 응답했습니다.");
                } else if (content.includes("오류") || content.includes("Error")) {
                    console.log("⚠️ 페이지에서 오류 메시지가 감지되었습니다.");
                } else {
                    console.log("🔍 페이지 내용이 있지만 출원번호 패턴을 찾지 못했습니다.");
                    // 페이지 내용의 일부를 로그에 출력 (처음 500자)
                    console.log("📄 페이지 내용 샘플:", content.substring(0, 500));
                }
            } catch (debugError) {
                console.log("⚠️ 디버그 정보 수집 중 오류:", debugError.message);
            }
        } else {
            console.log(`✅ 출원번호 추출 성공: ${applicationNumbers.join(', ')}`);
        }
        
        console.log(`🎯 크롤링 완료 - 총 ${applicationNumbers.length}건의 출원번호 발견`);
        return applicationNumbers;
        
    } catch (error) {
        console.error('❌ 크롤링 중 상세 오류 정보:');
        console.error('   오류 유형:', error.name);
        console.error('   오류 메시지:', error.message);
        console.error('   오류 스택:', error.stack);
        
        // 특정 오류 유형에 따른 안내
        if (error.message.includes('browser.newPage is not a function') || error.message.includes('chromium.launch')) {
            throw new Error('Playwright Chromium 브라우저가 설치되지 않았습니다. "npx playwright install chromium" 명령어를 실행해주세요.');
        } else if (error.message.includes('timeout')) {
            throw new Error(`KIPRIS 사이트 접속 시간 초과 - 네트워크 상태를 확인해주세요. (${error.message})`);
        } else if (error.message.includes('net::ERR_')) {
            throw new Error(`네트워크 연결 오류 - 인터넷 연결을 확인해주세요. (${error.message})`);
        } else {
            throw new Error(`KIPRIS 크롤링 오류: ${error.message}`);
        }
    } finally {
        if (browser) {
            try {
                await browser.close();
                console.log('✅ 브라우저 종료 완료');
            } catch (closeError) {
                console.log('⚠️ 브라우저 종료 중 오류:', closeError.message);
            }
        }
    }
}

// 개발용 Mock 데이터 생성 함수
function getMockApplicationNumbers(customerNumber) {
    console.log('📋 Mock 출원번호 생성:', customerNumber);
    
    // 고객번호별 테스트 출원번호
    const mockData = {
        '120190612244': [
            '1020220121591',
            '1020220063779', 
            '1020220063778',
            '1020200001867'
        ],
        '120230740981': [
            '1020230098765',
            '1020230098766',
            '1020230098767'
        ],
        '120200312345': [
            '1020200312345',
            '1020200312346',
            '1020200312347',
            '1020200312348'
        ],
        '120210412345': [
            '1020210412345',
            '1020210412346'
        ]
    };
    
    // 해당 고객번호의 Mock 데이터 반환 (없으면 기본 데이터)
    const applicationNumbers = mockData[customerNumber] || [
        '1020220000001',
        '1020220000002',
        '1020220000003'
    ];
    
    console.log('✅ Mock 데이터 생성 완료:', applicationNumbers.length, '건');
    return applicationNumbers;
}
/**
 * crawler.js : KIPRIS 목록(1단계) + 특허로 상세(2단계)
 * - 등록상태/청구범위 항수/존속기간 만료일자: 기본정보 테이블에서 직접 추출 (고정)
 * - 연차등록정보: "연차등록정보" 헤더 다음 테이블에서 마지막/이전 행 파싱
 */

const { chromium } = require('playwright');

const CONFIG = {
  headless: true,
  timeout: 30_000,
  slowMo: 0,
};

const KIPRIS_RESULT_URL =
  'https://www.kipris.or.kr/khome/search/searchResult.do';
const PATENTGO_START_URL =
  'https://www.patent.go.kr/smart/jsp/kiponet/ma/mamarkapply/infomodifypatent/ReadMyPatApplInfo.do';

// ──────────────────────────────────────────────
// utils
// ──────────────────────────────────────────────
const wait = (ms) => new Promise((res) => setTimeout(res, ms));
function norm(t = '') {
  return String(t).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}
function normalizeDate(text = '') {
  const s = String(text);
  const m = s.match(/(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/);
  if (!m) return norm(s);
  const y = m[1];
  const mm = m[2].padStart(2, '0');
  const dd = m[3].padStart(2, '0');
  return `${y}.${mm}.${dd}`;
}
function normalizeAmount(text = '') {
  // 연차료 원본 텍스트를 보존하면서 처리
  // 특허로 사이트에서 '56,000원50%28,000원' 같은 형태로 붙어서 오는 경우 처리
  const fullText = String(text).trim();

  // 원본 텍스트 그대로 반환 (공백 정리만)
  // 실제 포맷팅은 프론트엔드에서 처리
  return fullText;
}


// 기본정보 테이블에서 라벨 옆 td 값을 Locator로 안전 추출
async function getBaseInfoField(page, label) {
  const baseTable = page
    .locator(
      '#docBase1 table.board_list:has(caption:has-text("등록정보 상세정보조회"))'
    )
    .first();
  await baseTable.waitFor({ state: 'visible', timeout: CONFIG.timeout });

  const cell = baseTable.locator(`th:has-text("${label}") + td`).first();
  await cell.waitFor({ state: 'visible', timeout: CONFIG.timeout });

  return norm(await cell.innerText());
}

// "연차등록정보" 헤더 바로 다음 테이블에서 행 파싱 (결제 이력)
async function getAnnualRows(page) {
  const annualTable = page
    .locator(
      'div.board_header:has(h5:has-text("연차등록정보")) + div.board_body table.board_list'
    )
    .first();

  if (!(await annualTable.count())) return { last: null, prev: null };

  const rows = annualTable.locator('tbody > tr');
  const n = await rows.count();
  if (n === 0) return { last: null, prev: null };

  const parseRow = async (tr) => {
    const tds = tr.locator('td');
    return {
      year: norm(await tds.nth(0).innerText()), // '-' 포함하여 전체 연차수 유지 - 사용자 요구사항
      paidDate: normalizeDate(await tds.nth(1).innerText()),
      paidAmount: normalizeAmount(await tds.nth(2).innerText()),
    };
  };

  const last = await parseRow(rows.nth(n - 1));
  const prev = n >= 2 ? await parseRow(rows.nth(n - 2)) : null;
  return { last, prev };
}


// 재시도 래퍼 (네트워크/렌더 지연 대비)
async function withRetry(fn, { tries = 3, delayMs = 1500, tag = '' } = {}) {
  let lastErr;
  for (let i = 1; i <= tries; i++) {
    try {
      return await fn(i);
    } catch (e) {
      lastErr = e;
      if (i < tries) await wait(delayMs);
    }
  }
  throw lastErr;
}

// ──────────────────────────────────────────────
// 1단계: KIPRIS 목록 (crawl-patents.js 로직 적용)
// ──────────────────────────────────────────────
async function crawlKiprisList(query) {
  return withRetry(
    async () => {
      const browser = await chromium.launch({
        headless: CONFIG.headless,
        slowMo: CONFIG.slowMo,
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
      
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });
      const page = await context.newPage();

      // 1. KIPRIS 홈페이지 접속
      await page.goto("https://www.kipris.or.kr/khome/main.do", { 
        waitUntil: "networkidle",
        timeout: 60000
      });
      
      // 2. 검색어 입력
      const searchInput = page.locator("#inputQuery");
      await searchInput.waitFor({ timeout: 15000 });
      await searchInput.fill(query);
      
      // 3. 검색 실행
      await searchInput.press("Enter");
      await page.waitForLoadState("networkidle", { timeout: 30000 });
      await page.waitForTimeout(5000);
      
      // 4. 서지정보 모드 활성화
      try {
        const seojiButton = await page.locator("button[data-view-option='seoji']").first();
        const seojiButtonExists = await seojiButton.isVisible().catch(() => false);
        
        if (seojiButtonExists) {
          const classList = await seojiButton.getAttribute('class') || '';
          if (!classList.includes('active')) {
            await seojiButton.click();
            await page.waitForTimeout(2000);
          }
        } else {
          const altSeojiButton = await page.locator("button:has-text('서지정보')").first();
          const altButtonExists = await altSeojiButton.isVisible().catch(() => false);
          if (altButtonExists) {
            await altSeojiButton.click();
            await page.waitForTimeout(2000);
          }
        }
      } catch (error) {
        // 서지정보 모드 설정 실패해도 계속 진행
      }

      // 5. 특허 정보 추출
      const items = [];
      const resultItems = await page.locator("article.result-item").all();
      
      for (let idx = 0; idx < resultItems.length; idx++) {
        const item = resultItems[idx];
        const patentInfo = {};
        
        try {
          // 제목 추출 (영어 부분 제거) - 사용자 요구사항
          const titleElement = await item.locator("h1.title button").first();
          const titleExists = await titleElement.isVisible().catch(() => false);
          if (titleExists) {
            let title = await titleElement.innerText();
            title = title.replace(/^\[\d+\]\s*/, ''); // [1] 같은 번호 제거
            title = title.replace(/\([^)]*\)$/, '').trim(); // 괄호 안 영어 부분 제거
            patentInfo.title = title;
          }
          
          // 출원번호 및 출원일 추출
          const appElement = await item.locator("em[data-lang-id='srlt.patent.an'] ~ div p.txt").first();
          const appExists = await appElement.isVisible().catch(() => false);
          if (appExists) {
            const appText = await appElement.innerText();
            const match = appText.match(/(\d+)\((\d{4}-\d{2}-\d{2})\)/);
            if (match) {
              patentInfo.appNo = match[1];
              patentInfo.appDate = match[2];
            }
          }
          
          // 등록번호 및 등록일 추출
          const regElement = await item.locator("em[data-lang-id='srlt.patent.rn'] ~ div p.txt").first();
          const regExists = await regElement.isVisible().catch(() => false);
          if (regExists) {
            const regText = await regElement.innerText();
            const match = regText.match(/(\d+)\((\d{4}-\d{2}-\d{2})\)/);
            if (match) {
              patentInfo.regNo = match[1];
              patentInfo.regDate = match[2];
            }
          }
          
          // 출원인 추출 (첫 번째 1명만) - 사용자 요구사항
          let firstApplicant = '';
          const firstAppPersonElement = await item.locator("em[data-lang-id='srlt.patent.ap'] ~ div button").first();
          const firstExists = await firstAppPersonElement.isVisible().catch(() => false);
          
          if (firstExists) {
            const text = await firstAppPersonElement.innerText();
            firstApplicant = text.trim();
          } else {
            const appPersonElement = await item.locator("em[data-lang-id='srlt.patent.ap'] ~ div p.txt").first();
            const appPersonExists = await appPersonElement.isVisible().catch(() => false);
            if (appPersonExists) {
              const fullText = await appPersonElement.innerText();
              const names = fullText.split(',');
              firstApplicant = names[0].trim();
            }
          }
          patentInfo.applicant = firstApplicant;
          
          // 최종권리자(대표권리자) 추가 - 사용자 요구사항
          let finalRightsHolder = '';
          try {
            // 최종권리자는 TRH 필드에서 추출
            const rightsHolderElement = await item.locator("em[data-lang-id='srlt.patent.trh'] ~ div button").first();
            const rightsExists = await rightsHolderElement.isVisible().catch(() => false);
            
            if (rightsExists) {
              const text = await rightsHolderElement.innerText();
              finalRightsHolder = text.trim();
            } else {
              // 권리자 정보가 버튼이 아닌 경우
              const rightsTextElement = await item.locator("em[data-lang-id='srlt.patent.trh'] ~ div p.txt").first();
              const rightsTextExists = await rightsTextElement.isVisible().catch(() => false);
              if (rightsTextExists) {
                const fullText = await rightsTextElement.innerText();
                const names = fullText.split(',');
                finalRightsHolder = names[0].trim();
              } else {
                // 권리자 정보가 없으면 출원인을 대표권리자로 사용
                finalRightsHolder = firstApplicant;
              }
            }
          } catch (error) {
            // 최종권리자 추출 실패 시 출원인을 대표권리자로 사용
            finalRightsHolder = firstApplicant;
          }
          patentInfo.finalRightsHolder = finalRightsHolder;
          
          items.push(patentInfo);
          
        } catch (error) {
          console.log(`특허 ${idx + 1} 정보 추출 오류: ${error.message}`);
          continue;
        }
      }

      await browser.close();
      return items;
    },
    { tag: 'KIPRIS 목록' }
  );
}

// ──────────────────────────────────────────────
// 출원특허 전용 크롤링 함수 (application.ejs용)
// ──────────────────────────────────────────────
async function crawlKiprisApplicationList(customerNumber) {
  return withRetry(
    async () => {
      const browser = await chromium.launch({
        headless: CONFIG.headless,
        slowMo: CONFIG.slowMo,
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

      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });
      const page = await context.newPage();

      // 1. KIPRIS 홈페이지 접속
      await page.goto("https://www.kipris.or.kr/khome/main.do", {
        waitUntil: "networkidle",
        timeout: 60000
      });

      // 2. 검색어 입력 (TRH=[고객번호] 형식)
      const searchQuery = `TRH=[${customerNumber}]`;
      const searchInput = page.locator("#inputQuery");
      await searchInput.waitFor({ timeout: 15000 });
      await searchInput.fill(searchQuery);

      // 3. 검색 실행
      await searchInput.press("Enter");
      await page.waitForLoadState("networkidle", { timeout: 30000 });
      await page.waitForTimeout(5000);

      // 4. 서지정보 모드 활성화
      try {
        const seojiButton = await page.locator("button[data-view-option='seoji']").first();
        const seojiButtonExists = await seojiButton.isVisible().catch(() => false);

        if (seojiButtonExists) {
          const classList = await seojiButton.getAttribute('class') || '';
          if (!classList.includes('active')) {
            await seojiButton.click();
            await page.waitForTimeout(2000);
          }
        } else {
          const altSeojiButton = await page.locator("button:has-text('서지정보')").first();
          const altButtonExists = await altSeojiButton.isVisible().catch(() => false);
          if (altButtonExists) {
            await altSeojiButton.click();
            await page.waitForTimeout(2000);
          }
        }
      } catch (error) {
        console.log('서지정보 모드 설정 실패, 계속 진행');
      }

      // 5. 출원특허 정보 추출
      const items = [];
      const resultItems = await page.locator("article.result-item").all();

      for (let idx = 0; idx < resultItems.length; idx++) {
        const item = resultItems[idx];
        const patentInfo = {
          // 기본값 설정 (나머지 필드는 빈칸)
          applicationNumber: '',
          applicationDate: '',
          registrationNumber: '',
          registrationDate: '',
          inventionTitle: '',
          inventorName: '',
          publicationNumber: '',
          publicationDate: '',
          applicantName: '',
          examStatus: '',
          ipcCode: '',
          abstract: ''
        };

        try {
          // 발명의 명칭 (제목) 추출
          const titleElement = await item.locator("h1.title button").first();
          const titleExists = await titleElement.isVisible().catch(() => false);
          if (titleExists) {
            let title = await titleElement.innerText();
            title = title.replace(/^\[\d+\]\s*/, ''); // [1] 같은 번호 제거
            title = title.replace(/\([^)]*\)$/, '').trim(); // 괄호 안 영어 부분 제거
            patentInfo.inventionTitle = title;
          }

          // 출원번호 및 출원일 추출
          const appElement = await item.locator("em[data-lang-id='srlt.patent.an'] ~ div p.txt").first();
          const appExists = await appElement.isVisible().catch(() => false);
          if (appExists) {
            const appText = await appElement.innerText();
            const match = appText.match(/(\d+)\((\d{4}-\d{2}-\d{2})\)/);
            if (match) {
              patentInfo.applicationNumber = match[1];
              patentInfo.applicationDate = match[2];
            }
          }

          // 등록번호 및 등록일 추출
          const regElement = await item.locator("em[data-lang-id='srlt.patent.rn'] ~ div p.txt").first();
          const regExists = await regElement.isVisible().catch(() => false);
          if (regExists) {
            const regText = await regElement.innerText();
            const match = regText.match(/(\d+)\((\d{4}-\d{2}-\d{2})\)/);
            if (match) {
              patentInfo.registrationNumber = match[1];
              patentInfo.registrationDate = match[2];
            }
          }

          // 발명자 추출 (첫 번째 발명자만)
          let firstInventor = '';
          const inventorElement = await item.locator("em[data-lang-id='srlt.patent.in'] ~ div button").first();
          const inventorExists = await inventorElement.isVisible().catch(() => false);

          if (inventorExists) {
            const text = await inventorElement.innerText();
            firstInventor = text.trim();
          } else {
            const inventorTextElement = await item.locator("em[data-lang-id='srlt.patent.in'] ~ div p.txt").first();
            const inventorTextExists = await inventorTextElement.isVisible().catch(() => false);
            if (inventorTextExists) {
              const fullText = await inventorTextElement.innerText();
              const names = fullText.split(',');
              firstInventor = names[0].trim();
            }
          }
          patentInfo.inventorName = firstInventor;

          // 출원인 추출
          let applicantName = '';
          const applicantElement = await item.locator("em[data-lang-id='srlt.patent.ap'] ~ div button").first();
          const applicantExists = await applicantElement.isVisible().catch(() => false);

          if (applicantExists) {
            const text = await applicantElement.innerText();
            applicantName = text.trim();
          } else {
            const applicantTextElement = await item.locator("em[data-lang-id='srlt.patent.ap'] ~ div p.txt").first();
            const applicantTextExists = await applicantTextElement.isVisible().catch(() => false);
            if (applicantTextExists) {
              const fullText = await applicantTextElement.innerText();
              const names = fullText.split(',');
              applicantName = names[0].trim();
            }
          }
          patentInfo.applicantName = applicantName;

          // 최종권리자(대표권리자) 추가
          let finalRightsHolder = '';
          try {
            // 최종권리자는 TRH 필드에서 추출
            const rightsHolderElement = await item.locator("em[data-lang-id='srlt.patent.trh'] ~ div button").first();
            const rightsExists = await rightsHolderElement.isVisible().catch(() => false);

            if (rightsExists) {
              const text = await rightsHolderElement.innerText();
              finalRightsHolder = text.trim();
            } else {
              // 권리자 정보가 버튼이 아닌 경우
              const rightsTextElement = await item.locator("em[data-lang-id='srlt.patent.trh'] ~ div p.txt").first();
              const rightsTextExists = await rightsTextElement.isVisible().catch(() => false);
              if (rightsTextExists) {
                const fullText = await rightsTextElement.innerText();
                const names = fullText.split(',');
                finalRightsHolder = names[0].trim();
              } else {
                // 권리자 정보가 없으면 출원인을 대표권리자로 사용
                finalRightsHolder = applicantName;
              }
            }
          } catch (error) {
            // 최종권리자 추출 실패 시 출원인을 대표권리자로 사용
            finalRightsHolder = applicantName;
          }
          patentInfo.finalRightsHolder = finalRightsHolder;

          items.push(patentInfo);

        } catch (error) {
          console.log(`출원특허 ${idx + 1} 정보 추출 오류: ${error.message}`);
          continue;
        }
      }

      await browser.close();

      console.log(`✅ KIPRIS 출원특허 크롤링 완료: ${items.length}건`);
      return items;
    },
    { tag: 'KIPRIS 출원특허 목록' }
  );
}

// ──────────────────────────────────────────────
/** 등록번호 3분할: 화면은 앞 2자 자동, 나머지 11자 = 7/2/2 */
function splitRegNo3(raw) {
  const digits = String(raw).replace(/\D/g, '');
  const rest = (digits.length === 13 ? digits.slice(2) : digits).padStart(
    11,
    '0'
  );
  return { p2: rest.slice(0, 7), p3: rest.slice(7, 9), p4: rest.slice(9, 11) };
}

// 2단계: 특허로 상세
async function crawlPatentgoDetails(regNoRaw) {
  return withRetry(
    async () => {
      const regNo = String(regNoRaw).trim();
      const browser = await chromium.launch({ headless: CONFIG.headless });
      const page = await browser.newPage();

      await page.goto(PATENTGO_START_URL, {
        waitUntil: 'load',
        timeout: CONFIG.timeout,
      });

      // 사건번호별검색 → 등록번호 선택 → 3분할 입력 → fnSearch(1)
      const tab = page.locator('a:has-text("사건번호별검색")').first();
      if (await tab.count()) await tab.click();

      await page.selectOption('#selectNum2', 'rgst');
      await page.waitForSelector('#txtRgstNo02', {
        state: 'visible',
        timeout: CONFIG.timeout,
      });

      const { p2, p3, p4 } = splitRegNo3(regNo);
      await page.fill('#txtRgstNo02', p2);
      await page.fill('#txtRgstNo03', p3);
      await page.fill('#txtRgstNo04', p4);

      await page.evaluate(() => {
        try {
          if (typeof fnSearch === 'function') fnSearch(1);
        } catch (_) {}
      });

      await page.waitForURL(
        (u) => u.href.includes('ReadChgFrmRgstInfo.do'),
        { timeout: CONFIG.timeout }
      );
      await page.waitForLoadState('networkidle', { timeout: CONFIG.timeout });

      // ── 기본정보 테이블에서 필드 읽기 (고정)
      const registrationStatus = await getBaseInfoField(page, '등록상태'); // e.g., "등록유지"
      const claimCountRaw = await getBaseInfoField(page, '청구범위 항수'); // e.g., "3"
      const expireDateRaw = await getBaseInfoField(
        page,
        '존속기간 만료일자'
      ); // e.g., "2036.04.07"

      const claimCount = claimCountRaw.match(/\d+/)?.[0] || '';
      const expireDate = normalizeDate(expireDateRaw);
      const validityStatus = registrationStatus; // 동일값

      // ── 연차등록정보: 등록유지일 때만 추출
      let lastRow = null,
        prevRow = null;
      if (registrationStatus === '등록유지') {
        const rows = await getAnnualRows(page);
        lastRow = rows.last; // 해당연도
        prevRow = rows.prev; // 전년도
      }

      await page.close();
      await browser.close();

      return {
        registrationStatus,
        validityStatus,
        claimCount,
        expireDate,
        lastRow,
        prevRow,
      };
    },
    { tag: `상세조회(${regNoRaw})` }
  );
}

// ──────────────────────────────────────────────
module.exports = { crawlKiprisList, crawlKiprisApplicationList, crawlPatentgoDetails };

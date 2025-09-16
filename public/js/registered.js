// registered.js - 등록특허 현황 검색 기능
console.log('🔄 등록특허 검색 스크립트 로드됨 - 버전: 2025.08.21.v4');

let currentPatents = [];
let currentPage = 1;
const itemsPerPage = 5;


// 연차료 정보 처리 함수
function processPatentAnnualInfo(patent) {
    try {
        // 크롤링된 상세정보가 있는 경우 (currentAnnualInfo 또는 previousAnnualInfo가 있으면)
        if (patent.currentAnnualInfo || patent.previousAnnualInfo) {
            return {
                previousPaymentMonth: formatPreviousPaymentMonth(patent.previousAnnualInfo),
                dueDate: patent.currentAnnualInfo ? formatDate(patent.currentAnnualInfo.dueDate) : '-',
                annualYear: patent.currentAnnualInfo ? (patent.currentAnnualInfo.annualYear || '-') : '-',
                annualFee: patent.currentAnnualInfo ? formatAnnualFeeDisplay(patent.currentAnnualInfo.annualFee) : '-',
                validityStatus: patent.validityStatus || '-',
                paymentStatus: determinePaymentStatus(patent),
                latePaymentPeriod: calculateLatePaymentPeriod(patent),
                recoveryPeriod: calculateRecoveryPeriod(patent)
            };
        }

        // 데이터가 없는 경우 기본값 반환
        return {
            previousPaymentMonth: '-',
            dueDate: '-',
            annualYear: '-',
            annualFee: '-',
            validityStatus: '-',
            paymentStatus: '-',
            latePaymentPeriod: '-',
            recoveryPeriod: '-'
        };

    } catch (error) {
        console.error('❌ 연차료 정보 처리 오류:', error);
        return {
            previousPaymentMonth: '-',
            dueDate: '-',
            annualYear: '-',
            annualFee: '-',
            validityStatus: '-',
            paymentStatus: '-',
            latePaymentPeriod: '-',
            recoveryPeriod: '-'
        };
    }
}

// 연차료 표시 형식 처리 함수
function formatAnnualFeeDisplay(annualFee) {
    if (!annualFee || annualFee === '-') return '-';

    const feeText = String(annualFee).trim();

    // 첫 번째 '원'까지의 금액 추출
    const firstWonIndex = feeText.indexOf('원');
    if (firstWonIndex === -1) return feeText;

    const mainAmount = feeText.substring(0, firstWonIndex).trim();

    // '%' 또는 '감면' 키워드 확인
    if (feeText.includes('%') || feeText.includes('감면')) {
        // 감면 후 금액 추출
        const discountMatch = feeText.match(/감면 후 금액:\s*([\d,]+)\s*원/);
        if (discountMatch && discountMatch[1]) {
            // 4-1, 4-2 형식: 정상금액 (감면 후 금액: xxx원)
            return `${mainAmount}원 ( 감면 후 금액: ${discountMatch[1]}원 )`;
        } else {
            // 감면 정보는 있지만 금액이 명시되지 않은 경우
            return feeText; // 원본 반환
        }
    } else {
        // 감면 정보가 없는 경우 - 3-1, 3-2 형식
        const numericAmount = parseInt(mainAmount.replace(/,/g, ''));
        if (!isNaN(numericAmount)) {
            const discountAmount = Math.round(numericAmount * 0.5);
            const discountFormatted = discountAmount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
            return `${mainAmount}원 ( 감면 예상액: ${discountFormatted}원 )`;
        }
        return `${mainAmount}원`;
    }
}

// 직전년도 납부연월 포맷팅 (요구사항: paymentDate (annualYear / paymentAmount) 형식)
function formatPreviousPaymentMonth(previousInfo) {
    if (!previousInfo) return '-';

    // 요구사항에 따른 형식: paymentDate (annualYear / paymentAmount)
    if (previousInfo.paymentDate) {
        const yearInfo = previousInfo.annualYear || '-';
        const amountInfo = previousInfo.paymentAmount || '-';
        return `${previousInfo.paymentDate} (${yearInfo} / ${amountInfo})`;
    }

    return '-';
}

// 납부상태 결정
function determinePaymentStatus(patent) {
    if (patent.validityStatus === '유효') return '정상납부';
    if (patent.validityStatus === '불납') return '미납';
    if (patent.validityStatus === '추납기간') return '미납';
    if (patent.validityStatus === '회복기간') return '미납';
    return '-';
}

// 추납기간 계산
function calculateLatePaymentPeriod(patent) {
    if (patent.validityStatus === '추납기간') {
        // 크롤링된 정보가 있으면 사용
        if (patent.currentAnnualInfo && patent.currentAnnualInfo.dueDate) {
            const dueDate = new Date(patent.currentAnnualInfo.dueDate);
            const endDate = new Date(dueDate);
            endDate.setMonth(endDate.getMonth() + 6);
            return `진행중 (${formatDate(endDate.toISOString().split('T')[0])} 마감)`;
        }
    }
    return '-';
}

// 회복기간 계산
function calculateRecoveryPeriod(patent) {
    if (patent.validityStatus === '회복기간') {
        // 크롤링된 정보가 있으면 사용
        if (patent.currentAnnualInfo && patent.currentAnnualInfo.dueDate) {
            const dueDate = new Date(patent.currentAnnualInfo.dueDate);
            const startDate = new Date(dueDate);
            startDate.setMonth(startDate.getMonth() + 6);
            const endDate = new Date(dueDate);
            endDate.setMonth(endDate.getMonth() + 18);
            return `진행중 (${formatDate(endDate.toISOString().split('T')[0])} 마감)`;
        }
    }
    return '-';
}

// 상태에 따른 CSS 클래스 반환
function getStatusClass(status) {
    switch(status) {
        case '유효': return 'status-valid';
        case '불납': return 'status-invalid';
        case '추납기간': return 'status-late';
        case '회복기간': return 'status-recovery';
        default: return '';
    }
}

// 연차료 계산 로직은 크롤링 데이터를 사용하므로 fallback 제거됨

// 출원인 첫 번째 이름만 추출 (예: '김성배, 더보기, 박정수, 닫기' → '김성배')
function getFirstApplicantName(fullName) {
    if (!fullName || fullName === '-') return '-';
    
    // 콤마로 분리하여 첫 번째 이름만 추출
    const names = fullName.split(',');
    const firstName = names[0].trim();
    
    // '더보기', '닫기' 등의 UI 텍스트 제거
    if (firstName === '더보기' || firstName === '닫기' || firstName === '') {
        return names.length > 1 ? names[1].trim() : '-';
    }
    
    return firstName;
}

// 특허번호 포맷팅 (하이픈 추가)
function formatPatentNumber(number, type = 'application') {
    if (!number || number === '-') return '-';
    
    // 숫자만 추출
    const cleanNumber = number.toString().replace(/\D/g, '');
    
    if (type === 'application') {
        // 출원번호: 10-2016-0042595 형식
        if (cleanNumber.length >= 13) {
            return `${cleanNumber.substring(0, 2)}-${cleanNumber.substring(2, 6)}-${cleanNumber.substring(6)}`;
        }
    } else if (type === 'registration') {
        // 등록번호: 10-1684220-0000 형식
        if (cleanNumber.length >= 8) {
            const part1 = cleanNumber.substring(0, 2);
            const part2 = cleanNumber.substring(2, cleanNumber.length - 4);
            const part3 = cleanNumber.substring(cleanNumber.length - 4);
            return `${part1}-${part2}-${part3}`;
        }
    }
    
    // 포맷팅이 불가능한 경우 원본 반환
    return number;
}

// 전역 변수로 설정하여 다른 스크립트에서 접근 가능하도록 함
window.currentPatents = currentPatents;
window.currentPage = currentPage;
window.itemsPerPage = itemsPerPage;

// DOM 로드 완료 후 실행
document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ DOM 로드 완료 - 등록특허 검색 초기화');
    
    // 검색 폼 이벤트 리스너
    const searchForm = document.getElementById('searchForm');
    if (searchForm) {
        searchForm.addEventListener('submit', handleSearch);
        console.log('✅ 검색 폼 이벤트 리스너 등록 완료');
    }
    
    // 버튼 이벤트 리스너들
    setupButtonListeners();
});


// 검색 처리 함수
async function handleSearch(e) {
    e.preventDefault();
    console.log('🔍 검색 시작');
    
    // 고객번호 입력값 확인
    const searchValue = document.getElementById('customerNumber').value.trim();
    const searchBtn = document.getElementById('searchBtn');
    
    // 고객번호 검증
    if (!/^\d{12}$/.test(searchValue)) {
        showError('고객번호는 12자리 숫자여야 합니다.');
        return;
    }
    console.log('📝 고객번호:', searchValue);
    
    const originalText = searchBtn.innerHTML;
    hideError();
    showLoading(searchBtn);
    
    try {
        // API 호출
        console.log('🌐 API 호출 시작');
        const requestBody = {
            customerNumber: searchValue
        };
        
        console.log('📤 API 요청 데이터:', requestBody);
        
        const response = await fetch('/api/search-registered', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });
        
        const data = await response.json();
        console.log('📊 API 응답:', data);
        
        if (!data.success) {
            throw new Error(data.error || '검색 중 오류가 발생했습니다.');
        }
        
        // 결과 표시
        displayResults(data);
        console.log('✅ 결과 표시 완료');
        
        // 상세 정보는 이미 크롤링에서 포함되어 제공되므로 별도 API 호출 불필요
        console.log('✅ 크롤링에서 상세정보 포함하여 제공됨 - 별도 API 호출 생략');
        
    } catch (error) {
        console.error('❌ 검색 오류:', error);
        showError(error.message);
        hideResults();
        hideDetailLoadingMessage();
    } finally {
        hideLoading(searchBtn, originalText);
    }
}

// 결과 표시 함수
function displayResults(data) {
    console.log('📋 결과 표시 중...', data);
    currentPatents = data.patents || [];
    window.currentPatents = currentPatents;
    currentPage = 1; // 검색 시 첫 페이지로 초기화
    window.currentPage = currentPage; // 전역변수 동기화
    
    // 현재 날짜 표시
    const currentDate = new Date().toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    
    document.getElementById('resultCurrentDate').textContent = currentDate;
    document.getElementById('resultCustomerNumber').textContent = data.customerNumber;
    document.getElementById('resultApplicantName').textContent = data.finalRightsHolder || data.applicantName || '-';
    document.getElementById('resultTotalCount').textContent = data.totalCount;
    
    const resultsSection = document.getElementById('resultsSection');
    
    if (currentPatents.length === 0) {
        document.getElementById('emptyState').style.display = 'block';
        document.querySelector('.table-container').style.display = 'none';
        console.log('📄 결과 없음 - 빈 상태 표시');
    } else {
        document.getElementById('emptyState').style.display = 'none';
        document.querySelector('.table-container').style.display = 'block';
        displayPaginatedResults();
    }
    
    resultsSection.style.display = 'block';
    console.log('✅ 결과 섹션 표시');
}

function displayPaginatedResults() {
    console.log('📋 displayPaginatedResults() 호출됨');
    console.log('   동기화 전 - currentPatents.length:', currentPatents.length);
    console.log('   동기화 전 - window.currentPatents.length:', window.currentPatents ? window.currentPatents.length : 'undefined');
    console.log('   동기화 전 - currentPatents === window.currentPatents:', currentPatents === window.currentPatents);
    
    // 강화된 전역변수와 로컬변수 동기화
    if (window.currentPatents && window.currentPatents.length > 0) {
        currentPatents = window.currentPatents;
        console.log('   ✅ currentPatents를 window.currentPatents로 동기화');
    } else if (currentPatents.length > 0) {
        window.currentPatents = currentPatents;
        console.log('   ⚠️ window.currentPatents를 currentPatents로 동기화');
    } else {
        console.error('   ❌ 두 변수 모두 비어있음');
        return;
    }
    
    console.log('   동기화 후 - currentPatents.length:', currentPatents.length);
    console.log('   동기화 후 - window.currentPatents.length:', window.currentPatents.length);
    console.log('   동기화 후 - currentPatents === window.currentPatents:', currentPatents === window.currentPatents);
    
    const tableBody = document.getElementById('patentTableBody');
    const totalPages = Math.ceil(currentPatents.length / itemsPerPage);
    
    // 테이블 초기화
    tableBody.innerHTML = '';
    
    // 현재 페이지에 해당하는 데이터 계산
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, currentPatents.length);
    const paginatedPatents = currentPatents.slice(startIndex, endIndex);
    
    console.log('📊 페이지네이션 데이터 생성 중...', `${currentPage}/${totalPages} 페이지, ${paginatedPatents.length}건`);
    
    paginatedPatents.forEach((patent, index) => {
        const row = document.createElement('tr');
        
        // 안전한 문자열 처리
        const safeValue = (value) => value && value !== '-' ? value : '-';
        
        const applicantName = safeValue(patent.applicantName);
        const inventionTitle = safeValue(patent.inventionTitle);
        
        // 연차료 계산 데이터가 있는 경우 표시
        const calculatedData = patent.calculatedData;
        let annualFeeColumns;
        
        if (calculatedData) {
            annualFeeColumns = [
                '<td>' + (calculatedData.previousPaymentMonth || '') + '</td>',
                '<td>' + (calculatedData.dueDate || '-') + '</td>',
                '<td>' + (calculatedData.annualYear || '-') + '</td>',
                '<td>' + (calculatedData.annualFee || '-') + '</td>',
                '<td>' + (calculatedData.validityStatus || '-') + '</td>',
                '<td>' + (calculatedData.paymentStatus || '-') + '</td>',
                '<td>' + (calculatedData.latePaymentPeriod || '-') + '</td>',
                '<td>' + (calculatedData.recoveryPeriod || '-') + '</td>'
            ];
            console.log('🔄 페이지네이션 - 계산된 데이터 표시 (페이지 ' + currentPage + '):', patent.applicationNumber, {
                annualYear: calculatedData.annualYear,
                annualFee: calculatedData.annualFee,
                validityStatus: calculatedData.validityStatus
            });
        } else {
            annualFeeColumns = [
                '<td>-</td>', '<td>-</td>', '<td>-</td>', '<td>-</td>',
                '<td>-</td>', '<td>-</td>', '<td>-</td>', '<td>-</td>'
            ];
            console.log('⚠️ 페이지네이션 - 계산된 데이터 없음 (페이지 ' + currentPage + '):', patent.applicationNumber);
        }
        
        // 데이터 디버깅 로그
        console.log('🔍 특허 데이터 확인:', {
            applicationNumber: patent.applicationNumber,
            registrationNumber: patent.registrationNumber,
            claimCount: patent.claimCount,
            expirationDate: patent.expirationDate,
            validityStatus: patent.validityStatus,
            currentAnnualInfo: patent.currentAnnualInfo,
            previousAnnualInfo: patent.previousAnnualInfo
        });
        
        // 연차료 정보 처리
        const annualInfo = processPatentAnnualInfo(patent);
        console.log('📊 연차료 정보 처리 결과:', annualInfo);
        
        // 출원인 첫 번째 이름만 추출
        const firstApplicantName = getFirstApplicantName(applicantName);
        
        // 번호 포맷팅
        const formattedApplicationNumber = formatPatentNumber(patent.applicationNumber, 'application');
        const formattedRegistrationNumber = formatPatentNumber(patent.registrationNumber, 'registration');
        
        row.innerHTML = [
            '<td class="patent-number">' + formattedApplicationNumber + '</td>',
            '<td class="patent-number">' + formattedRegistrationNumber + '</td>',
            '<td class="applicant-name-clean applicant-name">' + firstApplicantName + '</td>',
            '<td>' + formatDate(patent.applicationDate) + '</td>',
            '<td>' + formatDate(patent.registrationDate) + '</td>',
            '<td class="invention-title-natural invention-title">' + inventionTitle + '</td>',
            '<td>' + safeValue(patent.claimCount) + '</td>',
            '<td>' + formatDate(patent.expirationDate) + '</td>',
            '<td class="status-cell status-validity ' + getStatusClass(annualInfo.validityStatus) + '">' + safeValue(annualInfo.validityStatus) + '</td>',
            '<td>' + safeValue(annualInfo.previousPaymentMonth) + '</td>',
            '<td>' + safeValue(annualInfo.dueDate) + '</td>',
            '<td>' + safeValue(annualInfo.annualYear) + '</td>',
            '<td>' + safeValue(annualInfo.annualFee) + '</td>',
            '<td>' + safeValue(annualInfo.paymentStatus) + '</td>',
            '<td>' + safeValue(annualInfo.latePaymentPeriod) + '</td>',
            '<td>' + safeValue(annualInfo.recoveryPeriod) + '</td>'
        ].join('');
        
        tableBody.appendChild(row);
    });
    
    // 페이지네이션 컨트롤 생성/업데이트
    createPaginationControls(totalPages);
    
    console.log('✅ 페이지네이션 테이블 생성 완료:', `${currentPage}/${totalPages} 페이지, ${paginatedPatents.length}건`);
}

function createPaginationControls(totalPages) {
    let paginationContainer = document.getElementById('paginationContainer');
    
    // 페이지네이션 컨테이너가 없으면 생성
    if (!paginationContainer) {
        paginationContainer = document.createElement('div');
        paginationContainer.id = 'paginationContainer';
        paginationContainer.className = 'pagination-container';
        
        // 테이블 컨테이너 다음에 삽입
        const tableContainer = document.querySelector('.table-container');
        tableContainer.parentNode.insertBefore(paginationContainer, tableContainer.nextSibling);
    }
    
    // 페이지가 1개 이하면 숨김
    if (totalPages <= 1) {
        paginationContainer.style.display = 'none';
        return;
    }
    
    paginationContainer.style.display = 'flex';
    
    let paginationHTML = '<div class="pagination-info">총 ' + currentPatents.length + '건 (페이지 ' + currentPage + '/' + totalPages + ')</div>';
    paginationHTML += '<div class="pagination-controls">';
    
    // 이전 버튼
    if (currentPage > 1) {
        paginationHTML += '<button class="pagination-btn" data-page="' + (currentPage - 1) + '">‹ 이전</button>';
    } else {
        paginationHTML += '<button class="pagination-btn disabled">‹ 이전</button>';
    }
    
    // 페이지 번호 (최대 5개 표시)
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, startPage + 4);
    
    for (let i = startPage; i <= endPage; i++) {
        if (i === currentPage) {
            paginationHTML += '<button class="pagination-btn active">' + i + '</button>';
        } else {
            paginationHTML += '<button class="pagination-btn" data-page="' + i + '">' + i + '</button>';
        }
    }
    
    // 다음 버튼
    if (currentPage < totalPages) {
        paginationHTML += '<button class="pagination-btn" data-page="' + (currentPage + 1) + '">다음 ›</button>';
    } else {
        paginationHTML += '<button class="pagination-btn disabled">다음 ›</button>';
    }
    
    paginationHTML += '</div>';
    paginationContainer.innerHTML = paginationHTML;
    
    // 페이지네이션 버튼에 이벤트 리스너 추가
    const paginationBtns = paginationContainer.querySelectorAll('.pagination-btn[data-page]');
    paginationBtns.forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            const targetPage = parseInt(this.getAttribute('data-page'));
            if (targetPage && targetPage !== currentPage) {
                changePage(targetPage);
            }
        });
    });
}

function changePage(page) {
    console.log('🔄 changePage() 호출됨, 페이지:', page);
    console.log('   변경 전 - currentPatents.length:', currentPatents.length);
    console.log('   변경 전 - window.currentPatents.length:', window.currentPatents ? window.currentPatents.length : 'undefined');
    console.log('   변경 전 - currentPatents === window.currentPatents:', currentPatents === window.currentPatents);
    
    // 강화된 전역변수와 로컬변수 동기화
    if (window.currentPatents && window.currentPatents.length > 0) {
        currentPatents = window.currentPatents;
        console.log('   ✅ currentPatents를 window.currentPatents로 동기화');
    } else if (currentPatents.length > 0) {
        window.currentPatents = currentPatents;
        console.log('   ⚠️ window.currentPatents를 currentPatents로 동기화');
    } else {
        console.error('   ❌ 두 변수 모두 비어있음');
        return;
    }
    
    console.log('   변경 후 - currentPatents.length:', currentPatents.length);
    console.log('   변경 후 - window.currentPatents.length:', window.currentPatents.length);
    console.log('   변경 후 - currentPatents === window.currentPatents:', currentPatents === window.currentPatents);
    
    if (page < 1 || page > Math.ceil(currentPatents.length / itemsPerPage)) {
        console.error('   ❌ 잘못된 페이지 번호:', page);
        return;
    }
    
    currentPage = page;
    window.currentPage = currentPage; // 전역변수 동기화
    console.log('   📄 페이지 변경 완료:', currentPage);
    
    displayPaginatedResults();
    
    // 테이블 상단으로 스크롤
    document.querySelector('.table-container').scrollIntoView({ 
        behavior: 'smooth', 
        block: 'start' 
    });
}

// 상세 정보는 크롤링에서 이미 포함되어 제공되므로 별도 조회 함수 제거됨

// 상세 정보 로딩 메시지
function showDetailLoadingMessage() {
    const existingMessage = document.querySelector('.detail-loading-message');
    if (existingMessage) {
        existingMessage.remove();
    }

    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'detail-loading-message';
    loadingDiv.innerHTML = '🔍 상세 정보를 조회 중입니다...';
    loadingDiv.style.cssText = 'background: #e0f2fe; color: #01579b; padding: 1rem; border-radius: 0.5rem; margin: 1rem 0; text-align: center;';
    
    const resultsSection = document.getElementById('resultsSection');
    const tableContainer = resultsSection.querySelector('.table-container');
    if (tableContainer) {
        tableContainer.before(loadingDiv);
    }
}

function hideDetailLoadingMessage() {
    const existingMessage = document.querySelector('.detail-loading-message');
    if (existingMessage) {
        existingMessage.remove();
    }
}

// 결과 숨기기
function hideResults() {
    document.getElementById('resultsSection').style.display = 'none';
}

// 연차료 납부의뢰 함수
function requestRenewalFee() {
    console.log('📄 납부의뢰 버튼 클릭');
    
    if (currentPatents.length === 0) {
        showError('납부의뢰할 특허가 없습니다.');
        return;
    }
    
    // 고객번호만 가져오기 - 이름은 사용자가 직접 입력
    const customerNumber = document.getElementById('resultCustomerNumber').textContent;
    
    console.log('고객정보:', { customerNumber });
    
    showRenewalRequestModal(customerNumber);
}

// 연차료 납부의뢰 모달 표시
function showRenewalRequestModal(customerNumber, applicantName = '') {
    // 모달 닫기 함수를 전역으로 등록
    window.closeRenewalModal = function() {
        const modal = document.getElementById('renewalModal');
        if (modal) {
            modal.remove();
        }
    };
    
    // 모달 HTML 생성 (내부 API 사용)
    const modalHTML = '<div id="renewalModal" class="modal-overlay" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.5); display: flex; justify-content: center; align-items: center; z-index: 1000;">' +
        '<div class="modal-content" style="background: white; border-radius: 8px; padding: 2rem; width: 90%; max-width: 600px; max-height: 90vh; overflow-y: auto; box-shadow: 0 10px 25px rgba(0,0,0,0.15);">' +
        '<div class="modal-header" style="border-bottom: 2px solid #54B435; padding-bottom: 1rem; margin-bottom: 1.5rem;">' +
        '<h2 style="color: #0F172A; font-size: 1.5rem; font-weight: 700; margin: 0; text-align: center;">연차료 납부의뢰</h2></div>' +
        '<div class="guidance-text" style="background: #f0fdf4; padding: 1.5rem; border-radius: 6px; margin-bottom: 1.5rem; border-left: 4px solid #54B435;">' +
        '<div style="color: #047857; line-height: 1.6;">' +
        '<p style="margin: 0 0 0.5rem 0;">1. 연차료 납부를 대행해 드립니다</p>' +
        '<p style="margin: 0 0 1rem 0;">2. 대리인 수수료는 건당 20,000원입니다 (부가세 별도)</p>' +
        '<p style="margin: 0 0 0.3rem 0; font-size: 0.9rem; color: #059669;">- 개인, 중소기업 70% 감면 금액 확인하여 연차료 비용 청구서 발송</p>' +
        '<p style="margin: 0 0 0.5rem 0; font-size: 0.9rem; color: #059669;">- 세금 계산서와 영수증 송부</p>' +
        '<p style="margin: 0; font-size: 0.9rem; color: #059669;">3. 특허청 특허로에 접속하시거나 특허청으로부터 받으신 지로용지로 직접 납부하실 수 있습니다</p>' +
        '</div></div>' +
        '<form action="https://api.web3forms.com/submit" method="POST" id="renewalRequestForm">' +
        '<input type="hidden" name="access_key" value="dd3c9ad5-1802-4bd1-b7e6-397002308afa">' +
        '<input type="hidden" name="redirect" value="' + window.location.origin + '/e_thanks">' +
        '<input type="hidden" name="subject" value="연차료 납부의뢰">' +
        '<div style="margin-bottom: 1rem;"><label style="display: block; color: #374151; font-weight: 500; margin-bottom: 0.5rem;">고객번호</label><input type="text" name="customer_number" id="customer_number" value="' + customerNumber + '" readonly style="width: 100%; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 4px; background: #f9fafb; color: #6b7280;"></div>' +
        '<div style="margin-bottom: 1rem;"><label style="display: block; color: #374151; font-weight: 500; margin-bottom: 0.5rem;">이름 <span style="color: #ef4444;">*</span></label><input type="text" name="name" id="applicant_name" value="" required style="width: 100%; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 4px;" placeholder="이름을 입력하세요"></div>' +
        '<div style="margin-bottom: 1rem;"><label style="display: block; color: #374151; font-weight: 500; margin-bottom: 0.5rem;">이메일 <span style="color: #ef4444;">*</span></label><input type="email" name="email" id="email" required style="width: 100%; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 4px;" placeholder="example@email.com"></div>' +
        '<div style="margin-bottom: 1.5rem;"><label style="display: block; color: #374151; font-weight: 500; margin-bottom: 0.5rem;">연락처 <span style="color: #ef4444;">*</span></label><input type="tel" name="phone" id="phone" required style="width: 100%; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 4px;" placeholder="010-0000-0000"></div>' +
        '<textarea name="message" style="display: none;">연차료 납부의뢰 - 고객번호: ' + customerNumber + '</textarea>' +
        '<div style="margin-bottom: 1.5rem; border: 1px solid #d1d5db; border-radius: 4px; background: #f9fafb; padding: 1rem; font-size: 0.9rem; color: #6b7280; line-height: 1.5;">' +
        '<p style="margin: 0 0 0.5rem 0;"><strong>개인정보 수집 및 이용 동의</strong></p>' +
        '<p style="margin: 0 0 0.5rem 0;">수집·이용 목적: 연차료 납부 대행 처리</p>' +
        '<p style="margin: 0 0 0.5rem 0;">수집 항목: 특허 고객번호, 이름, 연락처, 이메일</p>' +
        '<p style="margin: 0 0 0.75rem 0;">보유 및 이용 기간: 납부료 대행처리 완료 시</p>' +
        '<label style="display: flex; align-items: center; color: #374151; font-size: 0.9rem;">' +
        '<input type="checkbox" name="privacy_consent" id="privacy_consent" required style="margin-right: 0.5rem; width: 16px; height: 16px;">' +
        '개인정보 수집 및 이용에 동의합니다.</label>' +
        '</div>' +
        '<div style="display: flex; gap: 1rem; justify-content: flex-end;">' +
        '<button type="button" id="renewalCancelBtn" style="padding: 0.75rem 1.5rem; border: 1px solid #d1d5db; background: white; color: #374151; border-radius: 4px; cursor: pointer; font-weight: 500;">취소</button>' +
        '<button type="submit" style="padding: 0.75rem 1.5rem; background: #54B435; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 500;">납부의뢰</button>' +
        '</div></form></div></div>';
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // 취소 버튼 이벤트 리스너 추가
    document.getElementById('renewalCancelBtn').addEventListener('click', function() {
        closeRenewalModal();
    });
    
    console.log('✅ 납부의뢰 모달 생성 완료 - Web3Forms 연동');
}


// 버튼 이벤트 리스너 설정
function setupButtonListeners() {
    // 연차료 납부의뢰 버튼
    const renewalBtn = document.getElementById('renewalRequestBtn');
    if (renewalBtn) {
        renewalBtn.addEventListener('click', requestRenewalFee);
    }

    // 엑셀 다운로드 버튼
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', function() {
            console.log('📊 엑셀 다운로드 버튼 클릭');
            if (currentPatents.length === 0) {
                showError('다운로드할 데이터가 없습니다.');
                return;
            }
            if (typeof downloadExcel === 'function') {
                downloadExcel(currentPatents, 'registered');
            } else {
                console.warn('엑셀 다운로드 함수를 찾을 수 없습니다.');
            }
        });
    }
}

// 상태별 CSS 클래스 반환
function getStatusClass(status) {
    const classes = {
        '유효': 'status-valid',
        '불납': 'status-invalid',
        '조회실패': 'status-error'
    };
    return classes[status] || 'status-unknown';
}

// 상태별 아이콘 반환
function getStatusIcon(status) {
    const icons = {
        '유효': '✅',
        '불납': '🚨',
        '조회실패': '❓'
    };
    return icons[status] || '❓';
}

// 성공 메시지 표시
function showSuccessMessage(message) {
    const successElement = document.createElement('div');
    successElement.className = 'success-message';
    successElement.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #10b981;
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 6px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        z-index: 1000;
        font-weight: 500;
    `;
    successElement.textContent = message;
    
    document.body.appendChild(successElement);
    
    // 3초 후 자동 제거
    setTimeout(() => {
        if (successElement.parentNode) {
            successElement.parentNode.removeChild(successElement);
        }
    }, 3000);
}

console.log('✅ 등록특허 검색 스크립트 로드 완료');
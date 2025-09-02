// registered.js - 등록특허 현황 검색 기능
console.log('🔄 등록특허 검색 스크립트 로드됨 - 버전: 2025.08.21.v3');

let currentPatents = [];
let currentPage = 1;
const itemsPerPage = 5;

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
    
    const customerNumber = document.getElementById('customerNumber').value.trim();
    const searchBtn = document.getElementById('searchBtn');
    const originalText = searchBtn.innerHTML;
    
    // 입력 검증
    if (!/^\d{12}$/.test(customerNumber)) {
        showError('고객번호는 12자리 숫자여야 합니다.');
        return;
    }
    
    console.log('📝 고객번호:', customerNumber);
    hideError();
    showLoading(searchBtn);
    
    try {
        // API 호출
        console.log('🌐 API 호출 시작');
        const response = await fetch('/api/search-registered', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ customerNumber })
        });
        
        const data = await response.json();
        console.log('📊 API 응답:', data);
        
        if (!data.success) {
            throw new Error(data.error || '검색 중 오류가 발생했습니다.');
        }
        
        // 결과 표시
        displayResults(data);
        console.log('✅ 결과 표시 완료');
        
        // 상세 정보 조회 (옵션)
        try {
            if (data.patents && data.patents.length > 0) {
                console.log('🔍 상세 정보 조회 시작');
                showDetailLoadingMessage();
                await fetchPatentDetails(data.patents);
                hideDetailLoadingMessage();
                console.log('✅ 상세 정보 조회 완료');
            }
        } catch (detailError) {
            console.warn('⚠️ 상세 정보 조회 실패:', detailError);
            hideDetailLoadingMessage();
        }
        
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
    document.getElementById('resultApplicantName').textContent = data.applicantName;
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
        
        row.innerHTML = [
            '<td class="patent-number">' + safeValue(patent.applicationNumber) + '</td>',
            '<td class="patent-number">' + safeValue(patent.registrationNumber) + '</td>',
            '<td class="applicant-name-clean applicant-name">' + applicantName + '</td>',
            '<td>' + safeValue(patent.inventorName) + '</td>',
            '<td>' + formatDate(patent.applicationDate) + '</td>',
            '<td>' + formatDate(patent.registrationDate) + '</td>',
            '<td>' + formatDate(patent.expirationDate) + '</td>',
            '<td class="invention-title-natural invention-title">' + inventionTitle + '</td>',
            '<td>' + safeValue(patent.claimCount) + '</td>',
            '<td>-</td>', '<td>-</td>', '<td>-</td>', '<td>-</td>',
            '<td>-</td>', '<td>-</td>', '<td>-</td>', '<td>-</td>'
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
    if (page < 1 || page > Math.ceil(currentPatents.length / itemsPerPage)) return;
    
    currentPage = page;
    window.currentPage = currentPage; // 전역변수 동기화
    displayPaginatedResults();
    
    // 테이블 상단으로 스크롤
    document.querySelector('.table-container').scrollIntoView({ 
        behavior: 'smooth', 
        block: 'start' 
    });
}

// 특허 상세 정보 조회
async function fetchPatentDetails(patents) {
    if (!patents || patents.length === 0) return;
    
    try {
        const applicationNumbers = patents.map(p => p.applicationNumber).filter(num => num && num !== '-');
        
        if (applicationNumbers.length === 0) return;
        
        const response = await fetch('/api/get-patent-details', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ applicationNumbers })
        });
        
        const data = await response.json();
        
        if (data.success && data.details) {
            updatePatentTable(data.details);
        }
        
    } catch (error) {
        console.error('상세 정보 조회 오류:', error);
    }
}

// 특허 테이블 업데이트
function updatePatentTable(details) {
    const tableBody = document.getElementById('patentTableBody');
    const rows = tableBody.getElementsByTagName('tr');
    
    currentPatents.forEach((patent, index) => {
        if (index >= rows.length) return;
        
        const row = rows[index];
        const cells = row.getElementsByTagName('td');
        const applicationNumber = patent.applicationNumber;
        
        if (details[applicationNumber]) {
            const detail = details[applicationNumber];
            
            if (detail.registrationNumber && detail.registrationNumber !== '-') {
                cells[1].textContent = detail.registrationNumber;
                currentPatents[index].registrationNumber = detail.registrationNumber;
                window.currentPatents[index].registrationNumber = detail.registrationNumber;
            }
            
            if (detail.registrationDate && detail.registrationDate !== '-') {
                cells[5].textContent = formatDate(detail.registrationDate);
                currentPatents[index].registrationDate = detail.registrationDate;
                window.currentPatents[index].registrationDate = detail.registrationDate;
            }
            
            if (detail.expirationDate && detail.expirationDate !== '-') {
                cells[6].textContent = formatDate(detail.expirationDate);
                currentPatents[index].expirationDate = detail.expirationDate;
                window.currentPatents[index].expirationDate = detail.expirationDate;
            }
            
            if (detail.claimCount && detail.claimCount !== '-') {
                cells[8].textContent = detail.claimCount;
                currentPatents[index].claimCount = detail.claimCount;
                window.currentPatents[index].claimCount = detail.claimCount;
            }
        }
    });
}

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
    
    // 고객번호와 첫 번째 출원인 이름 가져오기
    const customerNumber = document.getElementById('resultCustomerNumber').textContent;
    const applicantName = document.getElementById('resultApplicantName').textContent;
    
    console.log('고객정보:', { customerNumber, applicantName });
    
    showRenewalRequestModal(customerNumber, applicantName);
}

// 연차료 납부의뢰 모달 표시
function showRenewalRequestModal(customerNumber, applicantName) {
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
        '<input type="hidden" name="redirect" value="' + window.location.origin + '/thanks">' +
        '<input type="hidden" name="subject" value="연차료 납부의뢰">' +
        '<div style="margin-bottom: 1rem;"><label style="display: block; color: #374151; font-weight: 500; margin-bottom: 0.5rem;">고객번호</label><input type="text" name="customer_number" id="customer_number" value="' + customerNumber + '" readonly style="width: 100%; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 4px; background: #f9fafb; color: #6b7280;"></div>' +
        '<div style="margin-bottom: 1rem;"><label style="display: block; color: #374151; font-weight: 500; margin-bottom: 0.5rem;">이름</label><input type="text" name="name" id="applicant_name" value="' + applicantName + '" readonly style="width: 100%; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 4px; background: #f9fafb; color: #6b7280;"></div>' +
        '<div style="margin-bottom: 1rem;"><label style="display: block; color: #374151; font-weight: 500; margin-bottom: 0.5rem;">이메일 <span style="color: #ef4444;">*</span></label><input type="email" name="email" id="email" required style="width: 100%; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 4px;" placeholder="example@email.com"></div>' +
        '<div style="margin-bottom: 1.5rem;"><label style="display: block; color: #374151; font-weight: 500; margin-bottom: 0.5rem;">연락처 <span style="color: #ef4444;">*</span></label><input type="tel" name="phone" id="phone" required style="width: 100%; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 4px;" placeholder="010-0000-0000"></div>' +
        '<textarea name="message" style="display: none;">연차료 납부의뢰 - 고객번호: ' + customerNumber + ', 고객명: ' + applicantName + '</textarea>' +
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

// 페이지네이션 테스트용 데이터 생성 함수
function generateTestData(basePatent, count) {
    const testPatents = [];
    for (let i = 0; i < count; i++) {
        testPatents.push({
            ...basePatent,
            applicationNumber: `102022012${String(i + 1).padStart(4, '0')}`,
            registrationNumber: `102823596${String(i + 1).padStart(4, '0')}`,
            applicantName: `테스트 출원자 ${i + 1}호 - 매우 긴 회사명을 가진 주식회사`,
            inventionTitle: `테스트 발명 제목 ${i + 1}번 - 매우 긴 발명의 명칭으로 툴팁 기능을 테스트하기 위한 샘플 데이터입니다`,
            applicationDate: `2022-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
            registrationDate: `2023-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`
        });
    }
    return testPatents;
}

// 페이지네이션 테스트 함수 (개발자 콘솔에서 사용)
window.testPagination = function(count = 23) {
    console.log(`📊 페이지네이션 테스트 시작: ${count}개 데이터`);
    
    const basePatent = currentPatents.length > 0 ? currentPatents[0] : {
        applicationNumber: "1020220000000",
        registrationNumber: "1028235960000",
        applicantName: "테스트 회사",
        inventorName: "-",
        applicationDate: "2022-01-01",
        registrationDate: "2023-01-01",
        publicationDate: "2023-01-07",
        expirationDate: "-",
        inventionTitle: "테스트 발명",
        claimCount: "-",
        registrationStatus: "등록"
    };
    
    const testData = {
        customerNumber: "TEST123456789",
        applicantName: "테스트 출원자",
        totalCount: count,
        patents: generateTestData(basePatent, count)
    };
    
    displayResults(testData);
    console.log(`✅ 테스트 완료: ${count}개 데이터, 총 ${Math.ceil(count / itemsPerPage)}페이지`);
};

// 버튼 이벤트 리스너 설정
function setupButtonListeners() {
    // 연차료 계산 버튼
    const calculateBtn = document.getElementById('calculateAnnuityBtn');
    if (calculateBtn) {
        calculateBtn.addEventListener('click', function() {
            console.log('💰 연차료 계산 버튼 클릭');
            // 연차료 계산 기능은 기존 코드 사용
            if (typeof calculateAnnuityFees === 'function') {
                calculateAnnuityFees();
            } else {
                console.warn('연차료 계산 함수를 찾을 수 없습니다.');
            }
        });
    }
    
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

console.log('✅ 등록특허 검색 스크립트 로드 완료');
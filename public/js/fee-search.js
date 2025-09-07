// fee-search.js - 연차료 조회 기능
console.log('🔄 연차료 조회 스크립트 로드됨 - 버전: 2025.01.01.v1');

let currentFeeRecords = [];
let currentPage = 1;
const itemsPerPage = 5;

// 전역 변수로 설정하여 다른 스크립트에서 접근 가능하도록 함
window.currentFeeRecords = currentFeeRecords;
window.currentPage = currentPage;
window.itemsPerPage = itemsPerPage;

// DOM 로드 완료 후 실행
document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ DOM 로드 완료 - 연차료 조회 초기화');
    
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
    console.log('🔍 연차료 조회 검색 시작');
    
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
        
        const response = await fetch('/api/search-fee', {
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
        
    } catch (error) {
        console.error('❌ 검색 오류:', error);
        showError(error.message);
        hideResults();
    } finally {
        hideLoading(searchBtn, originalText);
    }
}

// 결과 표시 함수
function displayResults(data) {
    console.log('📋 결과 표시 중...', data);
    currentFeeRecords = data.feeRecords || [];
    window.currentFeeRecords = currentFeeRecords;
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
    document.getElementById('resultTotalCount').textContent = data.totalCount;
    
    const resultsSection = document.getElementById('resultsSection');
    
    if (currentFeeRecords.length === 0) {
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
    console.log('   동기화 전 - currentFeeRecords.length:', currentFeeRecords.length);
    console.log('   동기화 전 - window.currentFeeRecords.length:', window.currentFeeRecords ? window.currentFeeRecords.length : 'undefined');
    
    // 강화된 전역변수와 로컬변수 동기화
    if (window.currentFeeRecords && window.currentFeeRecords.length > 0) {
        currentFeeRecords = window.currentFeeRecords;
        console.log('   ✅ currentFeeRecords를 window.currentFeeRecords로 동기화');
    } else if (currentFeeRecords.length > 0) {
        window.currentFeeRecords = currentFeeRecords;
        console.log('   ⚠️ window.currentFeeRecords를 currentFeeRecords로 동기화');
    } else {
        console.error('   ❌ 두 변수 모두 비어있음');
        return;
    }
    
    console.log('   동기화 후 - currentFeeRecords.length:', currentFeeRecords.length);
    console.log('   동기화 후 - window.currentFeeRecords.length:', window.currentFeeRecords.length);
    
    const tableBody = document.getElementById('feeTableBody');
    const totalPages = Math.ceil(currentFeeRecords.length / itemsPerPage);
    
    // 테이블 초기화
    tableBody.innerHTML = '';
    
    // 현재 페이지에 해당하는 데이터 계산
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, currentFeeRecords.length);
    const paginatedRecords = currentFeeRecords.slice(startIndex, endIndex);
    
    console.log('📊 페이지네이션 데이터 생성 중...', `${currentPage}/${totalPages} 페이지, ${paginatedRecords.length}건`);
    
    paginatedRecords.forEach((record, index) => {
        const row = document.createElement('tr');
        
        // 안전한 문자열 처리
        const safeValue = (value) => value && value !== '-' ? value : '-';
        
        // 테이블 행 생성 (result_fee.csv 구조에 맞게)
        row.innerHTML = [
            '<td class="patent-number">' + safeValue(record['출원번호']) + '</td>',
            '<td class="patent-number">' + safeValue(record['등록번호']) + '</td>',
            '<td class="applicant-name">' + safeValue(record['출원인']) + '</td>',
            '<td>' + safeValue(record['발명자']) + '</td>',
            '<td>' + formatDate(record['출원일']) + '</td>',
            '<td>' + formatDate(record['등록일']) + '</td>',
            '<td class="invention-title">' + safeValue(record['발명의명칭']) + '</td>',
            '<td>' + safeValue(record['청구항수']) + '</td>',
            '<td>' + formatDate(record['존속기간 만료일']) + '</td>',
            '<td>' + safeValue(record['직전년도 납부연월']) + '</td>',
            '<td>' + formatDate(record['해당 연차료 납부마감일']) + '</td>',
            '<td>' + safeValue(record['해당연차수']) + '</td>',
            '<td>' + safeValue(record['해당연차료']) + '</td>',
            '<td>' + safeValue(record['유효/불납']) + '</td>',
            '<td>' + safeValue(record['정상납부/미납']) + '</td>',
            '<td>' + safeValue(record['추납기간']) + '</td>',
            '<td>' + safeValue(record['회복기간']) + '</td>'
        ].join('');
        
        tableBody.appendChild(row);
    });
    
    // 페이지네이션 컨트롤 생성/업데이트
    createPaginationControls(totalPages);
    
    console.log('✅ 페이지네이션 테이블 생성 완료:', `${currentPage}/${totalPages} 페이지, ${paginatedRecords.length}건`);
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
    
    let paginationHTML = '<div class="pagination-info">총 ' + currentFeeRecords.length + '건 (페이지 ' + currentPage + '/' + totalPages + ')</div>';
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
    
    // 강화된 전역변수와 로컬변수 동기화
    if (window.currentFeeRecords && window.currentFeeRecords.length > 0) {
        currentFeeRecords = window.currentFeeRecords;
        console.log('   ✅ currentFeeRecords를 window.currentFeeRecords로 동기화');
    } else if (currentFeeRecords.length > 0) {
        window.currentFeeRecords = currentFeeRecords;
        console.log('   ⚠️ window.currentFeeRecords를 currentFeeRecords로 동기화');
    } else {
        console.error('   ❌ 두 변수 모두 비어있음');
        return;
    }
    
    if (page < 1 || page > Math.ceil(currentFeeRecords.length / itemsPerPage)) {
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

// 결과 숨기기
function hideResults() {
    document.getElementById('resultsSection').style.display = 'none';
}

// 버튼 이벤트 리스너 설정
function setupButtonListeners() {
    // 엑셀 다운로드 버튼
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', function() {
            console.log('📊 엑셀 다운로드 버튼 클릭');
            if (currentFeeRecords.length === 0) {
                showError('다운로드할 데이터가 없습니다.');
                return;
            }
            if (typeof downloadExcel === 'function') {
                downloadExcel(currentFeeRecords, 'fee-search');
            } else {
                console.warn('엑셀 다운로드 함수를 찾을 수 없습니다.');
            }
        });
    }
}

// 유틸리티 함수들 (main.js의 함수들을 로컬에서 사용)
function showError(message) {
    alert(message); // 간단한 alert로 대체
}

function hideError() {
    // 로컬 구현 - 필요시 확장
}

function showLoading(button) {
    button.innerHTML = '🔄 검색중...';
    button.disabled = true;
}

function hideLoading(button, originalText) {
    button.innerHTML = originalText;
    button.disabled = false;
}

function formatDate(dateStr) {
    if (!dateStr || dateStr === '-') return '-';
    return dateStr;
}

console.log('✅ 연차료 조회 스크립트 로드 완료');
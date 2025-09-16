// services/patentService.js - 특허 서비스 로직 (크롤링 기반)
const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

class PatentService {
    constructor() {
        // 크롤링 기반 서비스로 전환 - API 키 및 URL 제거
    }



    // Excel 생성
    generateExcel(data, type) {
        const XLSX = require('xlsx');
        let headers = [];
        let rows = [];
        
        if (type === 'registered') {
            // 등록특허 엑셀 생성
            headers = [
                '출원번호', '등록번호', '출원인', '출원일', 
                '등록일', '존속기간 만료일', '발명의명칭', '청구항수',
                '직전년도 납부연월', '해당 연차료 납부마감일', '해당연차수', '해당연차료',
                '유효/불납', '정상납부/미납', '추납기간', '회복기간'
            ];
            
            rows = data.map(p => {
                const calculatedData = p.calculatedData || {};
                return [
                    p.applicationNumber || '-',
                    p.registrationNumber || '-',
                    p.applicantName || '-',
                    p.applicationDate || '-',
                    p.registrationDate || '-',
                    p.expirationDate || '-',
                    p.inventionTitle || '-',
                    p.claimCount || '-',
                    calculatedData.previousPaymentMonth || '-',
                    calculatedData.dueDate || '-',
                    calculatedData.annualYear || '-',
                    calculatedData.annualFee || '-',
                    calculatedData.validityStatus || '-',
                    calculatedData.paymentStatus || '-',
                    calculatedData.latePaymentPeriod || '-',
                    calculatedData.recoveryPeriod || '-'
                ];
            });
        } else {
            // 출원특허 엑셀 생성
            headers = [
                '출원번호', '출원인', '출원일', 
                '공개일', '발명의명칭', '청구항수', 
                '심사상태', '진행상태', 'IPC코드'
            ];
            
            rows = data.map(p => [
                p.applicationNumber || '-',
                p.applicantName || '-',
                p.applicationDate || '-',
                p.publicationDate || '-',
                p.inventionTitle || '-',
                p.claimCount || '-',
                p.examStatus || '-',
                p.registrationStatus || '-',
                p.ipcCode || '-'
            ]);
        }
        
        // 워크북 생성
        const wb = XLSX.utils.book_new();
        
        // 워크시트 데이터 생성 (헤더 + 데이터 행들)
        const wsData = [headers, ...rows];
        
        // 워크시트 생성
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        
        // 컬럼 너비 설정
        const colWidths = headers.map(header => {
            if (header === '발명의명칭') return { width: 40 };
            if (header === '출원인' || header === '출원번호' || header === '등록번호') return { width: 20 };
            return { width: 15 };
        });
        ws['!cols'] = colWidths;
        
        // 워크시트를 워크북에 추가
        const sheetName = type === 'registered' ? '등록특허' : '출원특허';
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
        
        // 엑셀 파일 버퍼 생성
        return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    }

    // CSV 생성
    generateCSV(patents, type) {
        let headers = [];
        
        if (type === 'registered') {
            headers = [
                '출원번호', '등록번호', '출원인', '출원일', 
                '등록일', '존속기간 만료일', '발명의명칭', '청구항수',
                '직전년도 납부연월', '해당 연차료 납부마감일', '해당연차수', '해당연차료',
                '유효/불납', '차기년도 납부의뢰', '추납기간', '회복기간', '특허평가'
            ];
        } else {
            headers = [
                '출원번호', '출원인', '출원일', 
                '공개일', '발명의명칭', '청구항수', 
                '심사상태', '진행상태', 'IPC코드'
            ];
        }

        const rows = patents.map(p => {
            if (type === 'registered') {
                return [
                    p.applicationNumber,
                    p.registrationNumber,
                    p.applicantName,
                    p.applicationDate,
                    p.registrationDate,
                    p.expirationDate,
                    `"${p.inventionTitle}"`,
                    p.claimCount,
                    '-', // 직전년도 납부연월
                    '-', // 해당 연차료 납부마감일
                    '-', // 해당연차수
                    '-', // 해당연차료
                    '-', // 유효/불납
                    '-', // 차기년도 납부의뢰
                    '-', // 추납기간
                    '-', // 회복기간
                    '-'  // 특허평가
                ];
            } else {
                return [
                    p.applicationNumber,
                    p.applicantName,
                    p.applicationDate,
                    p.publicationDate,
                    `"${p.inventionTitle}"`,
                    p.claimCount,
                    p.examStatus,
                    p.registrationStatus,
                    p.ipcCode
                ];
            }
        });

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');

        return csvContent;
    }

    // 크롤링 기반 등록특허 검색 (Node.js Playwright 기반)
    async crawlRegisteredPatents(customerNumber) {
        try {
            console.log('🎭 Node.js Playwright 크롤링 시작:', customerNumber);
            
            // Node.js 크롤링 API 호출
            const crawlResult = await this.callCrawlAPI(customerNumber);
            
            if (!crawlResult.success) {
                throw new Error(crawlResult.error || '크롤링 API 호출 실패');
            }
            
            // 각 특허의 상세정보 크롤링 (연차료 정보 포함)
            const enhancedPatents = await this.enhancePatentsWithDetails(crawlResult.patents || []);
            
            console.log('✅ 크롤링 완료:', enhancedPatents.length, '건');

            // 최종권리자 추출
            const finalRightsHolder = crawlResult.finalRightsHolder || '';

            return {
                customerNumber,
                finalRightsHolder,
                totalCount: enhancedPatents.length,
                patents: enhancedPatents,
                crawlingMethod: 'KIPRIS 웹 크롤링 (Node.js Playwright)'
            };
            
        } catch (error) {
            console.error('❌ 크롤링 오류:', error);
            
            // 크롤링 실패 시 재시도 (최대 2회)
            console.log('🔄 크롤링 재시도 중...');
            
            try {
                console.log('🔄 두 번째 크롤링 시도');
                const retryResult = await this.callCrawlAPI(customerNumber);
                
                if (retryResult.success) {
                    const enhancedPatents = await this.enhancePatentsWithDetails(retryResult.patents || []);

                    const finalRightsHolder = retryResult.finalRightsHolder || '';

                    return {
                        customerNumber,
                        finalRightsHolder,
                        totalCount: enhancedPatents.length,
                        patents: enhancedPatents,
                        crawlingMethod: 'KIPRIS 웹 크롤링 (Node.js Playwright) - 재시도 성공'
                    };
                }
            } catch (retryError) {
                console.error('❌ 재시도 크롤링도 실패:', retryError);
            }
            
            // 모든 크롤링 시도 실패 시 오류 반환
            throw new Error(`실시간 크롤링이 실패했습니다. 잠시 후 다시 시도해주세요. 오류: ${error.message}`);
        }
    }

    // crawler.js를 직접 사용하는 크롤링 호출
    async callCrawlAPI(customerNumber) {
        try {
            console.log('🔄 crawler.js 직접 호출:', customerNumber);
            
            // crawler.js 함수 직접 호출
            const { crawlKiprisList } = require('../crawler');
            
            // TRH 형식으로 검색 쿼리 생성
            const searchQuery = `TRH=[${customerNumber}]`;
            console.log('🔍 검색 쿼리:', searchQuery);
            
            // KIPRIS 크롤링 실행
            const patents = await crawlKiprisList(searchQuery);
            
            console.log('✅ crawler.js 크롤링 완료:', patents.length, '건');

            // 최종권리자 추출 (첫 번째 특허의 최종권리자를 대표로 사용)
            const finalRightsHolder = patents.length > 0 && patents[0].finalRightsHolder
                ? patents[0].finalRightsHolder
                : '';

            // 기존 API 호환성을 위한 형식으로 변환
            const formattedPatents = patents.map(patent => ({
                제목: patent.title,
                출원번호: patent.appNo,
                출원일: patent.appDate,
                등록번호: patent.regNo,
                등록일: patent.regDate,
                출원인: patent.applicant,
                최종권리자: patent.finalRightsHolder
            }));

            return {
                success: true,
                customerNumber: customerNumber,
                finalRightsHolder: finalRightsHolder,
                patents: formattedPatents,
                count: formattedPatents.length,
                crawledAt: new Date().toISOString(),
                method: 'crawler.js 직접 호출'
            };
        } catch (error) {
            console.error('❌ crawler.js 호출 오류:', error);
            return {
                success: false,
                error: error.message || 'crawler.js 크롤링 중 오류가 발생했습니다.',
                customerNumber: customerNumber
            };
        }
    }

    // 특허 상세정보로 강화 (연차료 정보 포함)
    async enhancePatentsWithDetails(patents) {
        const enhancedPatents = [];
        
        for (const patent of patents) {
            try {
                console.log(`🔍 상세정보 크롤링: ${patent.등록번호 || patent.출원번호}`);
                
                // 기본 특허 정보 먼저 생성
                const basePatent = this.convertToStandardFormat(patent);
                
                // 등록번호가 있는 경우에만 상세정보 크롤링 시도
                if (patent.등록번호 && patent.등록번호 !== '-') {
                    try {
                        console.log(`📡 상세정보 API 호출: ${patent.등록번호}`);
                        const detailsResult = await this.callPatentDetailsAPI(patent.등록번호);
                        
                        if (detailsResult.success && detailsResult.patentDetails) {
                            console.log('✅ 상세정보 크롤링 성공:', detailsResult.patentDetails);
                            
                            // 상세정보와 기본 정보 병합 (크롤링 데이터 우선)
                            const enhancedPatent = {
                                ...basePatent,
                                
                                // 상세정보 (크롤링된 데이터 우선)
                                registrationStatus: detailsResult.patentDetails.registrationStatus || basePatent.registrationStatus,
                                claimCount: detailsResult.patentDetails.claimCount || basePatent.claimCount,
                                expirationDate: detailsResult.patentDetails.expirationDate || basePatent.expirationDate,
                                validityStatus: detailsResult.patentDetails.validityStatus || basePatent.validityStatus,
                                
                                // 연차료 관련 정보
                                currentAnnualInfo: detailsResult.patentDetails.currentAnnualInfo,
                                previousAnnualInfo: detailsResult.patentDetails.previousAnnualInfo,
                                annualRegistrationInfo: detailsResult.patentDetails.annualRegistrationInfo || []
                            };
                            
                            enhancedPatents.push(enhancedPatent);
                        } else {
                            console.log('⚠️ 상세정보 크롤링 실패, 기본 정보 사용:', detailsResult.error);
                            enhancedPatents.push(basePatent);
                        }
                    } catch (detailError) {
                        console.error(`❌ 상세정보 크롤링 오류 (${patent.등록번호}):`, detailError.message);
                        enhancedPatents.push(basePatent);
                    }
                } else {
                    console.log('ℹ️ 등록번호가 없어 기본 정보만 사용');
                    enhancedPatents.push(basePatent);
                }
                
                // API 호출 간격 조절 (서버 부하 방지)
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (error) {
                console.error(`❌ 상세정보 크롤링 오류 (${patent.등록번호}):`, error.message);
                // 오류 발생 시 기본 정보만 사용
                enhancedPatents.push(this.convertToStandardFormat(patent));
            }
        }
        
        return enhancedPatents;
    }

    // 특허 상세정보 크롤링 (crawler.js 사용)
    async callPatentDetailsAPI(registrationNumber) {
        const { crawlPatentgoDetails } = require('../crawler');
        
        try {
            console.log(`📡 상세정보 API 호출: ${registrationNumber}`);
            
            // crawler.js의 crawlPatentgoDetails 함수 사용
            const details = await crawlPatentgoDetails(registrationNumber);
            
            // crawler.js 응답 형식에 맞게 변환
            return {
                success: true,
                registrationNumber: registrationNumber,
                patentDetails: {
                    registrationStatus: details.registrationStatus,
                    claimCount: details.claimCount,
                    expirationDate: details.expireDate,
                    validityStatus: details.validityStatus,
                    currentAnnualInfo: details.lastRow ? {
                        annualYear: details.lastRow.year,
                        dueDate: details.lastRow.paidDate,
                        annualFee: details.lastRow.paidAmount
                    } : null,
                    previousAnnualInfo: details.prevRow ? {
                        annualYear: details.prevRow.year,
                        paymentDate: details.prevRow.paidDate,
                        paymentAmount: details.prevRow.paidAmount
                    } : null,
                    annualRegistrationInfo: []
                },
                method: 'crawler.js를 통한 특허청 크롤링'
            };
        } catch (error) {
            console.error('❌ 상세정보 크롤링 오류:', error);
            return {
                success: false,
                error: error.message || 'crawler.js 특허로 크롤링 중 오류가 발생했습니다.',
                registrationNumber: registrationNumber
            };
        }
    }

    // 크롤링 결과를 표준 포맷으로 변환 (기본 데이터 생성)
    convertToStandardFormat(patent) {
        console.log('🔄 기본 데이터 변환 중:', patent);
        
        // 등록일에서 존속기간 만료일 계산 (특허는 출원일로부터 20년)
        let calculatedExpirationDate = '-';
        if (patent.출원일 && patent.출원일 !== '-') {
            try {
                const appDate = new Date(patent.출원일);
                if (!isNaN(appDate.getTime())) {
                    appDate.setFullYear(appDate.getFullYear() + 20);
                    calculatedExpirationDate = appDate.toISOString().split('T')[0];
                }
            } catch (error) {
                console.log('⚠️ 존속기간 만료일 계산 실패:', error.message);
            }
        }
        
        // 디폴트 값 대신 빈값 사용 (크롤링 실패시 빈칸으로 표시)
        
        const standardFormat = {
            applicationNumber: patent.출원번호 || '-',
            registrationNumber: patent.등록번호 || '-',
            applicantName: patent.출원인 || '-',
            applicationDate: patent.출원일 || '-',
            registrationDate: patent.등록일 || '-',
            inventionTitle: patent.제목 || '-',
            // crawler.js 사용으로 최종권리자는 크롤링하지 않음 (키프리스에서 제외)
            finalRightsHolder: patent.출원인 || '-', // 출원인을 최종권리자로 사용
            
            // 상세정보 (크롤링된 값만 사용, 실패시 빈칸)
            registrationStatus: patent.registrationStatus || null,
            claimCount: patent.청구범위항수 || patent.claimCount || null,
            expirationDate: patent.expirationDate || calculatedExpirationDate,
            validityStatus: patent.validityStatus || null,
            
            // 연차료 관련 정보 (기본값)
            currentAnnualInfo: null,
            previousAnnualInfo: null,
            annualRegistrationInfo: [],
            
            // 기존 API 호환성을 위한 필드들
            publicationDate: patent.공개일 || '-',
            examStatus: '-',
            ipcCode: patent.IPC || '-',
            abstract: patent.요약 || '-'
        };
        
        console.log('✅ 표준 포맷 변환 완료:', {
            applicationNumber: standardFormat.applicationNumber,
            registrationNumber: standardFormat.registrationNumber,
            claimCount: standardFormat.claimCount,
            expirationDate: standardFormat.expirationDate,
            validityStatus: standardFormat.validityStatus
        });
        
        return standardFormat;
    }





}

module.exports = new PatentService();
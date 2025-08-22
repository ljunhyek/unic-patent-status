// services/patentService.js - 특허 서비스 로직
const axios = require('axios');
const xml2js = require('xml2js');
const XLSX = require('xlsx');

class PatentService {
    constructor() {
        // 환경변수 로딩 확인 및 기본값 설정
        require('dotenv').config();
        
        this.apiKey = process.env.KIPRIS_API_KEY;
        this.baseUrl = process.env.KIPRIS_API_BASE_URL;
        this.parser = new xml2js.Parser({ explicitArray: false });
        
        // 환경변수 검증
        if (!this.apiKey) {
            console.error('⚠️ KIPRIS_API_KEY가 설정되지 않았습니다.');
        }
        if (!this.baseUrl) {
            console.error('⚠️ KIPRIS_API_BASE_URL이 설정되지 않았습니다.');
        }
        
        console.log('🔧 PatentService 초기화:', {
            baseUrl: this.baseUrl,
            apiKeySet: !!this.apiKey
        });
    }

    // 등록특허 검색
    async searchRegisteredPatents(customerNumber) {
        try {
            const url = `${this.baseUrl}/patUtiModInfoSearchSevice/getWordSearch`;
            console.log('🌐 KIPRIS API 호출:', { url, customerNumber, hasApiKey: !!this.apiKey });
            
            const response = await axios.get(url, {
                params: {
                    word: customerNumber,
                    ServiceKey: this.apiKey
                },
                timeout: 10000
            });

            console.log('📡 KIPRIS API 응답 상태:', response.status);
            console.log('📊 KIPRIS API 응답 크기:', JSON.stringify(response.data).length, 'bytes');
            
            // 응답 데이터 파싱
            const allPatents = await this.parseResponse(response.data);
            console.log('📋 파싱된 전체 특허 수:', allPatents.length);
            
            // 등록번호가 실제 값이 있는 특허만 필터링
            const registeredPatents = allPatents.filter(p => 
                p.registrationNumber && 
                p.registrationNumber !== '-' && 
                p.registrationNumber.trim() !== ''
            );
            console.log('🔍 등록특허 필터링 결과:', registeredPatents.length);

            return {
                customerNumber,
                applicantName: registeredPatents[0]?.applicantName || '정보 없음',
                totalCount: registeredPatents.length,
                patents: registeredPatents
            };

        } catch (error) {
            console.error('등록특허 API 호출 오류:', error.message);
            throw error;
        }
    }

    // 출원특허 검색 (출원번호 기반 서지상세정보 조회)
    async searchApplicationPatents(customerNumber) {
        try {
            // 1단계: 기본 검색으로 출원번호 목록 가져오기
            const url = `${this.baseUrl}/patUtiModInfoSearchSevice/getWordSearch`;
            
            const response = await axios.get(url, {
                params: {
                    word: customerNumber,
                    ServiceKey: this.apiKey
                },
                timeout: 10000
            });

            // 응답 데이터 파싱
            const allPatents = await this.parseResponse(response.data);
            
            // 출원번호가 있는 모든 특허 필터링
            const basicPatents = allPatents.filter(p => 
                p.applicationNumber && 
                p.applicationNumber !== '-' && 
                p.applicationNumber.trim() !== ''
            );

            if (basicPatents.length === 0) {
                return {
                    customerNumber,
                    applicantName: '정보 없음',
                    totalCount: 0,
                    patents: []
                };
            }

            // 2단계: 각 출원번호별로 서지상세정보, 공개전문, 공고전문 URL 조회
            const detailedPatents = await Promise.all(
                basicPatents.map(async (basicPatent) => {
                    try {
                        // 서지상세정보 조회
                        const detailInfo = await this.getBibliographyDetailInfo(basicPatent.applicationNumber);
                        
                        // 공개전문과 공고전문 URL을 병렬로 조회
                        const [pubFullText, annFullText] = await Promise.all([
                            this.getPublicationFullTextUrl(basicPatent.applicationNumber),
                            this.getAnnouncementFullTextUrl(basicPatent.applicationNumber)
                        ]);
                        
                        console.log(`🔍 출원번호 ${basicPatent.applicationNumber}:`, {
                            publicationFullText: pubFullText?.path || '없음',
                            announcementFullText: annFullText?.path || '없음'
                        });
                        
                        // 기본 정보와 상세 정보 병합
                        return {
                            // 기본 정보
                            applicationNumber: basicPatent.applicationNumber,
                            registrationNumber: detailInfo?.registrationNumber || basicPatent.registrationNumber || '-',
                            applicantName: detailInfo?.applicantName || basicPatent.applicantName,
                            inventorName: detailInfo?.inventorName || basicPatent.inventorName,
                            applicationDate: this.formatDate(detailInfo?.applicationDate || basicPatent.applicationDate),
                            inventionTitle: detailInfo?.inventionTitle || basicPatent.inventionTitle,
                            
                            // 서지상세정보에서 가져온 추가 정보
                            priorityNumber: detailInfo?.priorityNumber || '-',
                            pctDeadline: this.formatDate(detailInfo?.pctDeadline) || '-',
                            opinionNotice: this.extractOpinionNotice(detailInfo?.legalStatusInfo) || '-',
                            currentStatus: detailInfo?.currentStatus || basicPatent.registrationStatus || '심사중',
                            
                            // 공개전문/공고전문 URL
                            publicationFullText: pubFullText?.path || '-',
                            publicationDocName: pubFullText?.docName || '-',
                            announcementFullText: annFullText?.path || '-',
                            announcementDocName: annFullText?.docName || '-',
                            
                            // PCT 출원번호, Family 특허번호 (API 응답에 따라 추가)
                            pctApplicationNumber: detailInfo?.pctApplicationNumber || '-',
                            familyPatentNumber: detailInfo?.familyPatentNumber || '-'
                        };
                    } catch (error) {
                        console.error(`출원번호 ${basicPatent.applicationNumber} 상세 정보 조회 실패:`, error.message);
                        // 오류가 있어도 기본 정보는 반환
                        return {
                            ...basicPatent,
                            priorityNumber: '-',
                            pctDeadline: '-',
                            opinionNotice: '-',
                            currentStatus: basicPatent.registrationStatus || '심사중',
                            publicationFullText: '-',
                            publicationDocName: '-',
                            announcementFullText: '-',
                            announcementDocName: '-',
                            pctApplicationNumber: '-',
                            familyPatentNumber: '-'
                        };
                    }
                })
            );

            return {
                customerNumber,
                applicantName: detailedPatents[0]?.applicantName || '정보 없음',
                totalCount: detailedPatents.length,
                patents: detailedPatents
            };

        } catch (error) {
            console.error('출원특허 API 호출 오류:', error.message);
            throw error;
        }
    }

    // 의견통지서 정보 추출 (legalStatusInfo에서)
    extractOpinionNotice(legalStatusInfo) {
        if (!legalStatusInfo || !Array.isArray(legalStatusInfo)) return '-';
        
        const opinionNotice = legalStatusInfo.find(info => 
            info.documentName && info.documentName.includes('의견제출통지서')
        );
        
        return opinionNotice ? this.formatDate(opinionNotice.receiptDate) : '-';
    }

    // API 응답 파싱
    async parseResponse(data) {
        try {
            // XML 응답인 경우
            if (typeof data === 'string' && data.includes('<?xml')) {
                return await this.parseXMLResponse(data);
            }
            
            // JSON 응답인 경우
            if (typeof data === 'object') {
                return this.parseJSONResponse(data);
            }
            
            return [];
        } catch (error) {
            console.error('응답 파싱 오류:', error);
            return [];
        }
    }

    // XML 응답 파싱
    async parseXMLResponse(xmlData) {
        return new Promise((resolve, reject) => {
            this.parser.parseString(xmlData, (err, result) => {
                if (err) {
                    reject(err);
                    return;
                }

                try {
                    const patents = [];
                    
                    // 일반 특허 검색 응답의 경우
                    if (result?.response?.body?.items?.item) {
                        const items = Array.isArray(result.response.body.items.item) 
                            ? result.response.body.items.item 
                            : [result.response.body.items.item];

                        items.forEach(item => {
                            patents.push(this.formatPatentData(item));
                        });
                    }
                    // 공개전문/공고전문 조회 응답의 경우 (items가 없는 구조)
                    else if (result?.response?.body?.item) {
                        const items = Array.isArray(result.response.body.item) 
                            ? result.response.body.item 
                            : [result.response.body.item];

                        items.forEach(item => {
                            // 공개전문/공고전문의 경우 간단한 구조로 반환
                            patents.push({
                                docName: this.getValue(item.docName),
                                path: this.getValue(item.path)
                            });
                        });
                    }

                    resolve(patents);
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    // JSON 응답 파싱
    parseJSONResponse(data) {
        const patents = [];
        
        if (data?.response?.body?.items?.item) {
            const items = Array.isArray(data.response.body.items.item) 
                ? data.response.body.items.item 
                : [data.response.body.items.item];

            items.forEach(item => {
                patents.push(this.formatPatentData(item));
            });
        }

        return patents;
    }

    // 특허 데이터 포맷팅
    formatPatentData(item) {
        return {
            applicationNumber: this.getValue(item.applicationNumber),
            registrationNumber: this.getValue(item.registerNumber), // registerNumber로 수정
            applicantName: this.getValue(item.applicantName),
            inventorName: this.getValue(item.inventorName),
            applicationDate: this.formatDate(this.getValue(item.applicationDate)),
            registrationDate: this.formatDate(this.getValue(item.registerDate)), // registerDate로 수정
            publicationDate: this.formatDate(this.getValue(item.publicationDate)),
            expirationDate: this.formatDate(this.getValue(item.rightDuration)),
            inventionTitle: this.getValue(item.inventionTitle),
            claimCount: this.getValue(item.claimCount),
            registrationStatus: this.getValue(item.registerStatus) || '심사중',
            examStatus: this.getValue(item.examStatus),
            ipcCode: this.getValue(item.ipcCode),
            abstract: this.getValue(item.abstract),
            // 새로운 필드들 추가
            priorityNumber: this.getValue(item.priorityNumber),
            pctDeadline: this.formatDate(this.getValue(item.pctDeadline)),
            opinionNotice: this.getValue(item.opinionNotice),
            publicationFullText: this.getValue(item.publicationFullText),
            announcementFullText: this.getValue(item.announcementFullText),
            pctApplicationNumber: this.getValue(item.pctApplicationNumber),
            familyPatentNumber: this.getValue(item.familyPatentNumber)
        };
    }

    // 값 추출 헬퍼
    getValue(value) {
        if (value === undefined || value === null) return '-';
        if (typeof value === 'object' && value._) return value._;
        return String(value);
    }

    // 날짜 포맷팅
    formatDate(dateStr) {
        if (!dateStr || dateStr === '-') return '-';
        
        // YYYYMMDD -> YYYY-MM-DD
        if (dateStr.length === 8) {
            return `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
        }
        
        return dateStr;
    }


    // 서지상세정보 조회 (출원번호 기반)
    async getBibliographyDetailInfo(applicationNumber) {
        try {
            const url = `${this.baseUrl}/patUtiModInfoSearchSevice/getBibliographyDetailInfoSearch`;
            
            const response = await axios.get(url, {
                params: {
                    applicationNumber: applicationNumber,
                    ServiceKey: this.apiKey
                },
                timeout: 10000
            });

            // 응답 데이터 파싱
            const result = await this.parseResponse(response.data);
            
            if (result && result.length > 0) {
                const patent = result[0];
                return {
                    applicationNumber: patent.applicationNumber,
                    registrationNumber: patent.registrationNumber,
                    applicantName: patent.applicantName,
                    inventorName: patent.inventorName,
                    applicationDate: patent.applicationDate,
                    registrationDate: patent.registrationDate,
                    inventionTitle: patent.inventionTitle,
                    // 서지상세정보에서 추가로 가져올 필드들
                    priorityNumber: patent.priorityNumber || patent.priorityApplicationNumber,
                    pctDeadline: patent.pctDeadline || patent.pctFilingDate,
                    opinionNotice: patent.opinionNotice,
                    currentStatus: patent.currentStatus || patent.registrationStatus,
                    ipcCode: patent.ipcCode,
                    // 의견통지서 정보 (legalStatusInfo에서 추출)
                    legalStatusInfo: patent.legalStatusInfo
                };
            }
            
            return null;

        } catch (error) {
            console.error(`출원번호 ${applicationNumber} 서지상세정보 조회 오류:`, error.message);
            throw error;
        }
    }

    // 공개전문 파일 URL 조회
    async getPublicationFullTextUrl(applicationNumber) {
        try {
            const url = `${this.baseUrl}/patUtiModInfoSearchSevice/getPubFullTextInfoSearch`;
            
            const response = await axios.get(url, {
                params: {
                    applicationNumber: applicationNumber,
                    ServiceKey: this.apiKey
                },
                timeout: 10000
            });

            // XML 응답 처리
            if (typeof response.data === 'string' && response.data.includes('<?xml')) {
                const result = await this.parseXMLResponse(response.data);
                
                if (result && result.length > 0) {
                    const item = result[0];
                    const docName = this.getValue(item.docName);
                    const path = this.getValue(item.path);
                    
                    console.log(`📄 공개전문 조회 성공 - ${applicationNumber}:`, { docName, path });
                    
                    if (path && path !== '-') {
                        return {
                            docName: docName || '-',
                            path: path
                        };
                    }
                }
            }
            
            return null;

        } catch (error) {
            console.error(`출원번호 ${applicationNumber} 공개전문 URL 조회 오류:`, error.message);
            return null;
        }
    }

    // 공고전문 파일 URL 조회 (새로 추가)
    async getAnnouncementFullTextUrl(applicationNumber) {
        try {
            // 공고전문은 등록특허에 대해서만 존재하므로 먼저 등록 상태 확인
            const url = `${this.baseUrl}/patUtiModInfoSearchSevice/getAdvancedSearch`;
            
            const response = await axios.get(url, {
                params: {
                    applicationNumber: applicationNumber,
                    ServiceKey: this.apiKey
                },
                timeout: 10000
            });

            const result = await this.parseResponse(response.data);
            
            if (result && result.length > 0) {
                const patent = result[0];
                const registrationNumber = this.getValue(patent.registrationNumber || patent.registerNumber);
                
                // 등록번호가 있는 경우에만 공고전문 조회 시도
                if (registrationNumber && registrationNumber !== '-') {
                    // 공고전문 URL은 일반적으로 등록번호 기반으로 구성
                    return {
                        docName: `${registrationNumber}.pdf`,
                        path: `http://plus.kipris.or.kr/kiprisplusws/fileToss.jsp?arg=${registrationNumber}_announcement`
                    };
                }
            }
            
            return null;

        } catch (error) {
            console.error(`출원번호 ${applicationNumber} 공고전문 URL 조회 오류:`, error.message);
            return null;
        }
    }


    // CSV 생성
    generateCSV(patents, type) {
        let headers = [];
        
        if (type === 'registered') {
            headers = [
                '출원번호', '등록번호', '출원인', '발명자', '출원일', 
                '등록일', '존속기간 만료일', '발명의명칭', '청구항수',
                '직전년도 납부연월', '해당 연차료 납부마감일', '해당연차수', '해당연차료',
                '유효/불납', '차기년도 납부의뢰', '추납기간', '회복기간', '특허평가'
            ];
        } else {
            headers = [
                '출원번호', '등록번호', '출원인', '발명자', '출원일', 
                '우선권 출원번호', 'PCT마감일', '발명의 명칭', '의견통지서', '현재상태',
                '공개전문', '공고전문', 'PCT출원번호', 'Family특허번호'
            ];
        }

        const rows = patents.map(p => {
            if (type === 'registered') {
                return [
                    p.applicationNumber,
                    p.registrationNumber,
                    p.applicantName,
                    p.inventorName,
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
                    p.registrationNumber || '-',
                    p.applicantName,
                    p.inventorName,
                    p.applicationDate,
                    p.priorityNumber || '-',
                    p.pctDeadline || '-',
                    `"${p.inventionTitle}"`,
                    p.opinionNotice || '-',
                    p.registrationStatus,
                    p.publicationFullText || '-',
                    p.announcementFullText || '-',
                    p.pctApplicationNumber || '-',
                    p.familyPatentNumber || '-'
                ];
            }
        });

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');

        return csvContent;
    }

    // Excel 생성
    generateExcel(patents, type) {
        let headers = [];
        
        if (type === 'registered') {
            headers = [
                '출원번호', '등록번호', '출원인', '발명자', '출원일', 
                '등록일', '존속기간 만료일', '발명의명칭', '청구항수',
                '직전년도 납부연월', '해당 연차료 납부마감일', '해당연차수', '해당연차료',
                '유효/불납', '차기년도 납부의뢰', '추납기간', '회복기간', '특허평가'
            ];
        } else {
            headers = [
                '출원번호', '등록번호', '출원인', '발명자', '출원일', 
                '우선권 출원번호', 'PCT마감일', '발명의 명칭', '의견통지서', '현재상태',
                '공개전문', '공고전문', 'PCT출원번호', 'Family특허번호'
            ];
        }

        const data = patents.map(p => {
            if (type === 'registered') {
                return [
                    p.applicationNumber,
                    p.registrationNumber,
                    p.applicantName,
                    p.inventorName,
                    p.applicationDate,
                    p.registrationDate,
                    p.expirationDate,
                    p.inventionTitle,
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
                    p.registrationNumber || '-',
                    p.applicantName,
                    p.inventorName,
                    p.applicationDate,
                    p.priorityNumber || '-',
                    p.pctDeadline || '-',
                    p.inventionTitle,
                    p.opinionNotice || '-',
                    p.registrationStatus,
                    p.publicationFullText || '-',
                    p.announcementFullText || '-',
                    p.pctApplicationNumber || '-',
                    p.familyPatentNumber || '-'
                ];
            }
        });

        // 워크시트 생성
        const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
        
        // 열 너비 자동 조정
        const range = XLSX.utils.decode_range(ws['!ref']);
        const wscols = [];
        
        for (let C = range.s.c; C <= range.e.c; ++C) {
            let maxWidth = 10; // 최소 너비
            
            // 헤더 길이 확인
            if (headers[C]) {
                maxWidth = Math.max(maxWidth, headers[C].length + 2);
            }
            
            // 데이터 길이 확인 (상위 10개 행만 체크)
            for (let R = 1; R <= Math.min(10, range.e.r); ++R) {
                const cellAddress = XLSX.utils.encode_cell({r: R, c: C});
                const cell = ws[cellAddress];
                if (cell && cell.v) {
                    const cellLength = String(cell.v).length;
                    maxWidth = Math.max(maxWidth, cellLength + 2);
                }
            }
            
            // 최대 너비 제한 (너무 넓어지지 않도록)
            maxWidth = Math.min(maxWidth, 50);
            
            wscols.push({wch: maxWidth});
        }
        
        ws['!cols'] = wscols;
        
        // 워크북 생성
        const wb = XLSX.utils.book_new();
        const sheetName = type === 'registered' ? '등록특허현황' : '출원특허현황';
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
        
        // Excel 버퍼 생성
        return XLSX.write(wb, {type: 'buffer', bookType: 'xlsx'});
    }

    // 출원번호별 특허 상세 정보 조회 (등록특허 페이지용)
    async getPatentDetailsByApplicationNumber(applicationNumber) {
        try {
            // 서지상세정보 조회를 통해 등록번호, 등록일, 존속기간만료일, 청구항수 등을 가져옴
            return await this.getBibliographyDetailInfo(applicationNumber);
        } catch (error) {
            console.error(`출원번호 ${applicationNumber} 상세 정보 조회 오류:`, error.message);
            throw error;
        }
    }
}

module.exports = new PatentService();
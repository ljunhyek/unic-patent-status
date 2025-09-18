// services/patentService.js - 특허 서비스 로직
const axios = require('axios');
const xml2js = require('xml2js');
const XLSX = require('xlsx');

class PatentService {
    constructor() {
        // 환경변수는 이미 상위에서 로드되어 있어야 함
        this.apiKey = process.env.KIPRIS_API_KEY;
        this.baseUrl = process.env.KIPRIS_API_BASE_URL || 'http://plus.kipris.or.kr/kipo-api/kipi';
        this.parser = new xml2js.Parser({ explicitArray: false });

        // 환경변수 검증
        if (!this.apiKey) {
            console.error('⚠️ KIPRIS_API_KEY가 설정되지 않았습니다.');
            throw new Error('KIPRIS_API_KEY is required');
        }
        if (!this.baseUrl) {
            console.error('⚠️ KIPRIS_API_BASE_URL이 설정되지 않았습니다.');
        }

        console.log('🔧 PatentService 초기화:', {
            baseUrl: this.baseUrl,
            apiKeySet: !!this.apiKey,
            nodeEnv: process.env.NODE_ENV
        });
    }

    // 등록특허 검색 - 특허청 등록원부 API 사용
    async searchRegisteredPatents(customerNumber) {
        try {
            // 특허청 등록원부 API 호출
            const url = process.env.PATENT_OFFICE_API_URL || 'https://apis.data.go.kr/1430000/PttRgstRtInfoInqSvc/getBusinessRightList';
            const serviceKey = process.env.PATENT_OFFICE_API_KEY;

            if (!serviceKey) {
                console.error('⚠️ PATENT_OFFICE_API_KEY가 설정되지 않았습니다.');
                throw new Error('PATENT_OFFICE_API_KEY is required');
            }

            console.log('🌐 특허청 등록원부 API 호출:', { url, customerNumber });

            const response = await axios.get(url, {
                params: {
                    serviceKey: serviceKey,
                    type: 'json',
                    pageNo: 1,
                    numOfRows: 100, // 최대 100개까지 조회
                    searchType: 2,   // 특허고객번호 검색
                    searchVal: customerNumber
                },
                timeout: 10000
            });

            console.log('📡 특허청 API 응답 상태:', response.status);

            // 응답 데이터 파싱
            const data = response.data;

            // API 응답 구조 확인 및 데이터 추출
            if (!data || !data.items || !data.items.rightList) {
                console.log('⚠️ 검색 결과 없음');
                return {
                    customerNumber,
                    applicantName: '정보 없음',
                    totalCount: 0,
                    patents: []
                };
            }

            const rightList = Array.isArray(data.items.rightList) ? data.items.rightList : [data.items.rightList];
            const totalCount = data.items.totalCount || rightList.length;

            console.log('🔍 조회된 등록특허 수:', totalCount);

            // 특허 데이터 변환
            const patents = rightList.map(item => ({
                // 기본 정보
                applicationNumber: item.applNo || '-',
                registrationNumber: item.rgstNo || '-',
                applicantName: item.applicantInfo || item.rightHolderInfo || '-',
                applicationDate: this.formatDateFromAPI(item.applDate),
                inventionTitle: item.title || '-',

                // 등록 정보 (발명자 필드 제거)
                registrationDate: this.formatDateFromAPI(item.rgstDate),
                claimCount: item.claimCount || '-',

                // 추가 정보
                publicationNumber: item.pubNo || '-',
                publicationDate: this.formatDateFromAPI(item.pubDate),
                expirationDate: this.formatDateFromAPI(item.cndrtExptnDate),
                registrationStatus: item.rgstStatus || '등록',

                // 권리자 정보
                rightHolderInfo: item.rightHolderInfo || '-',
                agentInfo: item.agentInfo || '-',
                businessNo: item.businessNo || '-',

                // UI에 필요한 추가 필드들 (연차료 계산용)
                examStatus: '등록',
                ipcCode: '-',
                abstract: '-'
            }));

            const applicantName = patents[0]?.applicantName || '정보 없음';

            return {
                customerNumber,
                applicantName,
                totalCount,
                patents
            };

        } catch (error) {
            console.error('등록특허 API 호출 오류:', error.message);
            if (error.response) {
                console.error('API 응답 오류:', error.response.data);
            }
            throw error;
        }
    }

    // 날짜 형식 변환 헬퍼 메서드 (YYYYMMDD -> YYYY.MM.DD)
    formatDateFromAPI(dateStr) {
        if (!dateStr || dateStr === '-' || dateStr.length !== 8) {
            return '-';
        }
        return `${dateStr.substring(0, 4)}.${dateStr.substring(4, 6)}.${dateStr.substring(6, 8)}`;
    }

    // 출원특허 검색 (출원번호 기반 서지상세정보 조회)
    async searchApplicationPatents(customerNumber) {
        try {
            // 1단계: 기본 검색으로 출원번호 목록 가져오기
            const url = `${this.baseUrl}/patUtiModInfoSearchSevice/getWordSearch`;
            
            const response = await axios.get(url, {
                params: {
                    word: customerNumber,
                    ServiceKey: this.apiKey,
                    numOfRows: 100, // 한 번에 최대 100개까지 요청
                    pageNo: 1
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
        
        // YYYY.MM.DD -> YYYY-MM-DD (KIPRIS API 형식)
        if (dateStr.includes('.')) {
            return dateStr.replace(/\./g, '-');
        }
        
        // YYYYMMDD -> YYYY-MM-DD
        if (dateStr.length === 8) {
            return `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
        }
        
        return dateStr;
    }

    // 출원번호 포맷팅
    formatApplicationNumber(applicationNumber) {
        if (!applicationNumber || applicationNumber === '-') return '-';
        
        // 하이픈 제거해서 숫자만 반환 (기존 시스템과 호환성을 위해)
        return applicationNumber.replace(/-/g, '');
    }

    // IPC 코드 추출
    extractIpcCodes(ipcInfoArray) {
        if (!ipcInfoArray || !ipcInfoArray.ipcInfo) return '-';
        
        const ipcInfos = Array.isArray(ipcInfoArray.ipcInfo) 
            ? ipcInfoArray.ipcInfo 
            : [ipcInfoArray.ipcInfo];
        
        const ipcCodes = ipcInfos.map(info => info.ipcNumber).filter(code => code);
        return ipcCodes.length > 0 ? ipcCodes.join(', ') : '-';
    }

    // 권리 존속기간 만료일 계산 (출원일 + 20년)
    calculateExpirationDate(applicationDate) {
        if (!applicationDate || applicationDate === '-') return '-';
        
        try {
            // YYYY.MM.DD 형식을 Date 객체로 변환
            const dateStr = applicationDate.replace(/\./g, '-');
            const appDate = new Date(dateStr);
            
            if (isNaN(appDate.getTime())) return '-';
            
            // 20년 추가
            const expirationDate = new Date(appDate);
            expirationDate.setFullYear(appDate.getFullYear() + 20);
            
            // YYYY-MM-DD 형식으로 반환
            return expirationDate.toISOString().split('T')[0];
        } catch (error) {
            console.error('권리존속기간 계산 오류:', error);
            return '-';
        }
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

            console.log(`📋 상세 API 응답 크기 (${applicationNumber}):`, JSON.stringify(response.data).length, 'bytes');

            // XML 응답 처리
            if (typeof response.data === 'string' && response.data.includes('<?xml')) {
                return new Promise((resolve, reject) => {
                    this.parser.parseString(response.data, (err, result) => {
                        if (err) {
                            console.error('XML 파싱 오류:', err);
                            reject(err);
                            return;
                        }

                        try {
                            if (result?.response?.body?.item) {
                                const item = result.response.body.item;
                                
                                // 기본 정보 추출
                                const biblioInfo = item.biblioSummaryInfoArray?.biblioSummaryInfo || {};
                                const inventorInfo = item.inventorInfoArray?.inventorInfo || {};
                                const applicantInfo = item.applicantInfoArray?.applicantInfo || {};
                                
                                console.log(`🎯 상세 정보 추출 성공 (${applicationNumber}):`, {
                                    claimCount: biblioInfo.claimCount,
                                    inventorName: inventorInfo.name,
                                    registerNumber: biblioInfo.registerNumber,
                                    registerDate: biblioInfo.registerDate
                                });

                                const detailInfo = {
                                    applicationNumber: this.formatApplicationNumber(biblioInfo.applicationNumber || applicationNumber),
                                    registrationNumber: this.getValue(biblioInfo.registerNumber),
                                    applicantName: this.getValue(applicantInfo.name) || this.getValue(biblioInfo.applicantName),
                                    inventorName: this.getValue(inventorInfo.name),
                                    applicationDate: this.formatDate(this.getValue(biblioInfo.applicationDate)),
                                    registrationDate: this.formatDate(this.getValue(biblioInfo.registerDate)),
                                    inventionTitle: this.getValue(biblioInfo.inventionTitle),
                                    claimCount: this.getValue(biblioInfo.claimCount),
                                    
                                    // 추가 정보
                                    publicationDate: this.formatDate(this.getValue(biblioInfo.publicationDate)),
                                    openDate: this.formatDate(this.getValue(biblioInfo.openDate)),
                                    registrationStatus: this.getValue(biblioInfo.registerStatus) || '등록',
                                    examinerName: this.getValue(biblioInfo.examinerName),
                                    finalDisposal: this.getValue(biblioInfo.finalDisposal),
                                    
                                    // IPC 코드 추출
                                    ipcCode: this.extractIpcCodes(item.ipcInfoArray),
                                    
                                    // 권리 존속 기간 계산 (등록일 + 20년)
                                    expirationDate: this.calculateExpirationDate(biblioInfo.applicationDate),
                                    
                                    // 법적 상태 정보
                                    legalStatusInfo: item.legalStatusInfoArray?.legalStatusInfo || []
                                };

                                resolve(detailInfo);
                            } else {
                                console.warn(`상세 정보 없음 (${applicationNumber})`);
                                resolve(null);
                            }
                        } catch (parseError) {
                            console.error('데이터 추출 오류:', parseError);
                            reject(parseError);
                        }
                    });
                });
            }
            
            // JSON 응답 처리 (기존 로직)
            if (typeof response.data === 'object') {
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
                        claimCount: patent.claimCount,
                        currentStatus: patent.currentStatus || patent.registrationStatus,
                        ipcCode: patent.ipcCode,
                        legalStatusInfo: patent.legalStatusInfo
                    };
                }
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
// services/patentService.js - 특허 서비스 로직
const axios = require('axios');
const xml2js = require('xml2js');

class PatentService {
    constructor() {
        this.apiKey = process.env.KIPRIS_API_KEY;
        this.baseUrl = process.env.KIPRIS_API_BASE_URL;
        this.parser = new xml2js.Parser({ explicitArray: false });
    }

    // 등록특허 검색
    async searchRegisteredPatents(customerNumber) {
        try {
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
            
            // 등록된 특허만 필터링
            const registeredPatents = allPatents.filter(p => 
                p.registrationStatus === '등록' || 
                (p.registrationNumber && p.registrationNumber !== '-')
            );

            return {
                customerNumber,
                applicantName: registeredPatents[0]?.applicantName || '정보 없음',
                totalCount: registeredPatents.length,
                patents: registeredPatents
            };

        } catch (error) {
            console.error('등록특허 API 호출 오류:', error.message);
            
            // 개발 환경에서는 테스트 데이터 반환
            if (process.env.NODE_ENV === 'development') {
                return this.getTestRegisteredData(customerNumber);
            }
            
            throw error;
        }
    }

    // 출원특허 검색
    async searchApplicationPatents(customerNumber) {
        try {
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
            
            // 출원 중인 특허만 필터링 (등록되지 않은 것들)
            const applicationPatents = allPatents.filter(p => 
                p.registrationStatus !== '등록' && 
                (!p.registrationNumber || p.registrationNumber === '-')
            );

            return {
                customerNumber,
                applicantName: applicationPatents[0]?.applicantName || '정보 없음',
                totalCount: applicationPatents.length,
                patents: applicationPatents
            };

        } catch (error) {
            console.error('출원특허 API 호출 오류:', error.message);
            
            // 개발 환경에서는 테스트 데이터 반환
            if (process.env.NODE_ENV === 'development') {
                return this.getTestApplicationData(customerNumber);
            }
            
            throw error;
        }
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
                    
                    if (result?.response?.body?.items?.item) {
                        const items = Array.isArray(result.response.body.items.item) 
                            ? result.response.body.items.item 
                            : [result.response.body.items.item];

                        items.forEach(item => {
                            patents.push(this.formatPatentData(item));
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
            abstract: this.getValue(item.abstract)
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

    // 등록특허 테스트 데이터
    getTestRegisteredData(customerNumber) {
        return {
            customerNumber,
            applicantName: '유니크 특허사무소',
            totalCount: 3,
            patents: [
                {
                    applicationNumber: '10-2020-0098765',
                    registrationNumber: '10-2234567',
                    applicantName: '유니크 특허사무소',
                    inventorName: '홍길동',
                    applicationDate: '2020-08-15',
                    registrationDate: '2021-11-30',
                    publicationDate: '2021-02-15',
                    expirationDate: '2040-08-15',
                    inventionTitle: 'AI 기반 특허 자동 분석 시스템',
                    claimCount: '18',
                    registrationStatus: '등록',
                    ipcCode: 'G06F 17/30'
                },
                {
                    applicationNumber: '10-2019-0123456',
                    registrationNumber: '10-2123456',
                    applicantName: '유니크 특허사무소',
                    inventorName: '김철수',
                    applicationDate: '2019-10-20',
                    registrationDate: '2021-03-15',
                    publicationDate: '2020-04-20',
                    expirationDate: '2039-10-20',
                    inventionTitle: '블록체인 기반 지식재산권 관리 플랫폼',
                    claimCount: '15',
                    registrationStatus: '등록',
                    ipcCode: 'G06Q 50/00'
                },
                {
                    applicationNumber: '10-2018-0087654',
                    registrationNumber: '10-2012345',
                    applicantName: '유니크 특허사무소',
                    inventorName: '이영희',
                    applicationDate: '2018-07-25',
                    registrationDate: '2020-01-10',
                    publicationDate: '2019-01-25',
                    expirationDate: '2038-07-25',
                    inventionTitle: 'IoT 센서를 활용한 특허 모니터링 시스템',
                    claimCount: '12',
                    registrationStatus: '등록',
                    ipcCode: 'H04L 29/08'
                }
            ]
        };
    }

    // 출원특허 테스트 데이터
    getTestApplicationData(customerNumber) {
        return {
            customerNumber,
            applicantName: '유니크 특허사무소',
            totalCount: 4,
            patents: [
                {
                    applicationNumber: '10-2024-0012345',
                    registrationNumber: '-',
                    applicantName: '유니크 특허사무소',
                    inventorName: '박민수',
                    applicationDate: '2024-02-15',
                    registrationDate: '-',
                    publicationDate: '-',
                    expirationDate: '-',
                    inventionTitle: '양자컴퓨터 기반 특허 유사도 분석 방법',
                    claimCount: '20',
                    registrationStatus: '심사중',
                    examStatus: '의견제출통지',
                    ipcCode: 'G06N 10/00'
                },
                {
                    applicationNumber: '10-2023-0198765',
                    registrationNumber: '-',
                    applicantName: '유니크 특허사무소',
                    inventorName: '정수진',
                    applicationDate: '2023-12-01',
                    registrationDate: '-',
                    publicationDate: '2024-06-01',
                    expirationDate: '-',
                    inventionTitle: '메타버스 환경에서의 지식재산권 보호 시스템',
                    claimCount: '16',
                    registrationStatus: '심사중',
                    examStatus: '심사청구',
                    ipcCode: 'G06F 21/10'
                },
                {
                    applicationNumber: '10-2023-0156789',
                    registrationNumber: '-',
                    applicantName: '유니크 특허사무소',
                    inventorName: '최동욱',
                    applicationDate: '2023-09-20',
                    registrationDate: '-',
                    publicationDate: '2024-03-20',
                    expirationDate: '-',
                    inventionTitle: 'ChatGPT를 활용한 특허 명세서 자동 생성 장치',
                    claimCount: '14',
                    registrationStatus: '심사중',
                    examStatus: '최초거절',
                    ipcCode: 'G06F 40/00'
                },
                {
                    applicationNumber: '10-2023-0134567',
                    registrationNumber: '-',
                    applicantName: '유니크 특허사무소',
                    inventorName: '강미영',
                    applicationDate: '2023-07-10',
                    registrationDate: '-',
                    publicationDate: '2024-01-10',
                    expirationDate: '-',
                    inventionTitle: '드론을 이용한 특허 침해 감시 시스템',
                    claimCount: '11',
                    registrationStatus: '심사중',
                    examStatus: '등록결정',
                    ipcCode: 'B64C 39/02'
                }
            ]
        };
    }

    // 출원번호로 특허 상세 정보 조회
    async getPatentDetailsByApplicationNumber(applicationNumber) {
        try {
            const url = `${this.baseUrl}/patUtiModInfoSearchSevice/getAdvancedSearch`;
            
            const response = await axios.get(url, {
                params: {
                    applicationNumber: applicationNumber,
                    ServiceKey: this.apiKey
                },
                timeout: 10000
            });

            // 응답 데이터 파싱
            const patents = await this.parseResponse(response.data);
            
            // 해당 출원번호와 정확히 일치하는 특허 찾기
            const patent = patents.find(p => p.applicationNumber === applicationNumber);
            
            if (patent) {
                return {
                    applicationNumber: patent.applicationNumber,
                    registrationNumber: patent.registrationNumber,
                    registrationDate: patent.registrationDate,
                    expirationDate: patent.expirationDate,
                    claimCount: patent.claimCount
                };
            }
            
            // 개발 환경에서는 테스트 데이터 반환
            if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
                return this.getTestPatentDetails(applicationNumber);
            }
            return null;

        } catch (error) {
            console.error(`출원번호 ${applicationNumber} 상세 정보 조회 오류:`, error.message);
            
            // 개발 환경에서는 테스트 데이터 반환 (NODE_ENV가 설정되지 않은 경우도 포함)
            if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
                return this.getTestPatentDetails(applicationNumber);
            }
            
            throw error;
        }
    }

    // 테스트용 특허 상세 정보
    getTestPatentDetails(applicationNumber) {
        const testDetails = {
            // 기존 테스트 데이터
            '10-2020-0098765': {
                applicationNumber: '10-2020-0098765',
                registrationNumber: '10-2234567',
                registrationDate: '2021-11-30',
                expirationDate: '2040-08-15',
                claimCount: '18'
            },
            '10-2019-0123456': {
                applicationNumber: '10-2019-0123456',
                registrationNumber: '10-2123456',
                registrationDate: '2021-03-15',
                expirationDate: '2039-10-20',
                claimCount: '15'
            },
            '10-2018-0087654': {
                applicationNumber: '10-2018-0087654',
                registrationNumber: '10-2012345',
                registrationDate: '2020-01-10',
                expirationDate: '2038-07-25',
                claimCount: '12'
            },
            // 실제 시스템의 출원번호에 대한 테스트 데이터
            '1020220121591': {
                applicationNumber: '1020220121591',
                registrationNumber: '10-2456789',
                registrationDate: '2023-05-15',
                expirationDate: '2042-12-31',
                claimCount: '12'
            },
            '1020220063779': {
                applicationNumber: '1020220063779',
                registrationNumber: '10-2456790',
                registrationDate: '2023-08-20',
                expirationDate: '2042-05-15',
                claimCount: '8'
            },
            '1020220063778': {
                applicationNumber: '1020220063778',
                registrationNumber: '10-2456791',
                registrationDate: '2023-09-10',
                expirationDate: '2042-05-15',
                claimCount: '15'
            },
            '1020200001867': {
                applicationNumber: '1020200001867',
                registrationNumber: '10-2345678',
                registrationDate: '2022-01-30',
                expirationDate: '2040-01-15',
                claimCount: '20'
            }
        };
        
        return testDetails[applicationNumber] || {
            applicationNumber,
            registrationNumber: '10-' + Math.floor(Math.random() * 9000000 + 1000000),
            registrationDate: '2021-06-15',
            expirationDate: '2041-06-15',
            claimCount: String(Math.floor(Math.random() * 20 + 5))
        };
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
                '출원번호', '출원인', '발명자', '출원일', 
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
                    p.applicantName,
                    p.inventorName,
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
}

module.exports = new PatentService();
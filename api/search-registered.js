// Vercel Serverless Function: 등록특허 검색 API
const { crawlKiprisList, crawlPatentgoDetails } = require('../crawler');

module.exports = async (req, res) => {
    // CORS 설정
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({
            success: false,
            error: 'POST 메서드만 지원합니다.'
        });
    }

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

        console.log(`📋 등록특허 크롤링 시작: 고객번호 ${cleanedNumber}`);

        // KIPRIS 크롤링으로 등록특허 정보 조회
        const patents = await crawlKiprisList(cleanedNumber);

        // 첫 번째 특허의 출원인명을 전체 대표 출원인으로 사용
        const applicantName = (patents.length > 0 && patents[0].applicant) ?
            patents[0].applicant : '조회된 특허 없음';

        // 첫 번째 특허의 최종권리자를 전체 대표 최종권리자로 사용
        const finalRightsHolder = (patents.length > 0 && patents[0].finalRightsHolder) ?
            patents[0].finalRightsHolder : applicantName;

        console.log(`✅ 등록특허 크롤링 완료: ${patents.length}건`);

        // 각 특허의 상세정보 크롤링 (연차료 정보 포함)
        const enhancedPatents = [];
        for (const patent of patents) {
            try {
                if (patent.regNo && patent.regNo !== '-') {
                    console.log(`🔍 상세정보 크롤링: ${patent.regNo}`);
                    const details = await crawlPatentgoDetails(patent.regNo);

                    enhancedPatents.push({
                        applicationNumber: patent.appNo || '-',
                        registrationNumber: patent.regNo || '-',
                        applicantName: patent.applicant || '-',
                        finalRightsHolder: patent.finalRightsHolder || patent.applicant || '-',
                        applicationDate: patent.appDate || '-',
                        registrationDate: patent.regDate || '-',
                        inventionTitle: patent.title || '-',
                        registrationStatus: details.registrationStatus || '등록',
                        claimCount: details.claimCount || '-',
                        expirationDate: details.expireDate || '-',
                        validityStatus: details.validityStatus || '-',
                        currentAnnualInfo: details.lastRow ? {
                            annualYear: details.lastRow.year,
                            dueDate: details.lastRow.paidDate,
                            annualFee: details.lastRow.paidAmount
                        } : null,
                        previousAnnualInfo: details.prevRow ? {
                            annualYear: details.prevRow.year,
                            paymentDate: details.prevRow.paidDate,
                            paymentAmount: details.prevRow.paidAmount
                        } : null
                    });
                } else {
                    enhancedPatents.push({
                        applicationNumber: patent.appNo || '-',
                        registrationNumber: patent.regNo || '-',
                        applicantName: patent.applicant || '-',
                        finalRightsHolder: patent.finalRightsHolder || patent.applicant || '-',
                        applicationDate: patent.appDate || '-',
                        registrationDate: patent.regDate || '-',
                        inventionTitle: patent.title || '-',
                        registrationStatus: '등록',
                        claimCount: '-',
                        expirationDate: '-',
                        validityStatus: '-',
                        currentAnnualInfo: null,
                        previousAnnualInfo: null
                    });
                }

                // API 호출 간격 조절
                await new Promise(resolve => setTimeout(resolve, 1000));

            } catch (error) {
                console.error(`❌ 상세정보 크롤링 오류 (${patent.regNo}):`, error.message);
                enhancedPatents.push({
                    applicationNumber: patent.appNo || '-',
                    registrationNumber: patent.regNo || '-',
                    applicantName: patent.applicant || '-',
                    finalRightsHolder: patent.finalRightsHolder || patent.applicant || '-',
                    applicationDate: patent.appDate || '-',
                    registrationDate: patent.regDate || '-',
                    inventionTitle: patent.title || '-',
                    registrationStatus: '등록',
                    claimCount: '-',
                    expirationDate: '-',
                    validityStatus: '-',
                    currentAnnualInfo: null,
                    previousAnnualInfo: null
                });
            }
        }

        res.json({
            success: true,
            customerNumber: cleanedNumber,
            applicantName: applicantName,
            finalRightsHolder: finalRightsHolder,
            totalCount: enhancedPatents.length,
            patents: enhancedPatents
        });

    } catch (error) {
        console.error('등록특허 검색 오류:', error);

        res.status(500).json({
            success: false,
            error: '특허 정보를 조회하는 중 오류가 발생했습니다.'
        });
    }
};
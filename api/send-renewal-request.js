// Vercel Serverless Function: 연차료 납부의뢰 API
const nodemailer = require('nodemailer');

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
        const { customerNumber, applicantName, patents, requestType } = req.body;

        if (!customerNumber || !applicantName || !patents || !Array.isArray(patents)) {
            return res.status(400).json({
                success: false,
                error: '필수 정보가 누락되었습니다.'
            });
        }

        console.log(`📧 연차료 납부의뢰 메일 발송 시작: ${applicantName} (${customerNumber}), ${patents.length}건`);

        // 메일 내용 생성
        const patentList = patents.map((patent, index) => {
            const currentInfo = patent.currentAnnualInfo || {};
            return `${index + 1}. ${patent.inventionTitle || '-'}
   - 출원번호: ${patent.applicationNumber || '-'}
   - 등록번호: ${patent.registrationNumber || '-'}
   - 해당연차수: ${currentInfo.annualYear || '-'}
   - 해당연차료: ${currentInfo.annualFee || '-'}
   - 납부마감일: ${currentInfo.dueDate || '-'}`;
        }).join('\n\n');

        const emailContent = `
[연차료 납부 의뢰서]

고객정보:
- 고객번호: ${customerNumber}
- 출원인명: ${applicantName}
- 의뢰일시: ${new Date().toLocaleString('ko-KR')}
- 의뢰유형: ${requestType === 'renewal' ? '연차료 납부의뢰' : 'PCT 납부의뢰'}

특허 목록 (총 ${patents.length}건):
${patentList}

※ 본 메일은 자동으로 생성된 연차료 납부 의뢰서입니다.
※ 정확한 납부를 위해 담당자가 재검토 후 처리할 예정입니다.

--
유니크 특허법률사무소
특허관리시스템
        `;

        // 메일 발송 (실제 환경에서는 SMTP 설정 필요)
        console.log('📧 메일 내용:', emailContent);

        // 실제 메일 발송 로직은 환경에 따라 구현
        // 현재는 로그만 출력하고 성공 응답 반환
        console.log(`✅ 연차료 납부의뢰 처리 완료: ${patents.length}건`);

        res.json({
            success: true,
            message: '연차료 납부의뢰가 정상적으로 접수되었습니다.',
            customerNumber: customerNumber,
            applicantName: applicantName,
            patentCount: patents.length,
            requestType: requestType,
            requestId: `REQ_${Date.now()}`,
            requestDate: new Date().toISOString()
        });

    } catch (error) {
        console.error('연차료 납부의뢰 처리 오류:', error);

        res.status(500).json({
            success: false,
            error: '연차료 납부의뢰 처리 중 오류가 발생했습니다.'
        });
    }
};
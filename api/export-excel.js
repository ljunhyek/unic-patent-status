// Vercel Serverless Function: 엑셀 다운로드 API
const patentService = require('../services/patentService');

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
        const { patents, type } = req.body;

        if (!patents || !Array.isArray(patents)) {
            return res.status(400).json({
                success: false,
                error: '특허 데이터가 필요합니다.'
            });
        }

        if (!type || !['registered', 'application'].includes(type)) {
            return res.status(400).json({
                success: false,
                error: '올바른 타입을 지정해주세요. (registered 또는 application)'
            });
        }

        console.log(`📊 엑셀 생성 시작: ${type} 타입, ${patents.length}건`);

        // 엑셀 파일 생성
        const excelBuffer = patentService.generateExcel(patents, type);

        // 현재 날짜로 파일명 생성
        const today = new Date().toISOString().split('T')[0];
        const filename = type === 'registered' ?
            `등록특허_${today}.xlsx` :
            `출원특허_${today}.xlsx`;

        // 응답 헤더 설정
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
        res.setHeader('Content-Length', excelBuffer.length);

        console.log(`✅ 엑셀 파일 생성 완료: ${filename} (${excelBuffer.length} bytes)`);

        // 엑셀 버퍼 전송
        res.send(excelBuffer);

    } catch (error) {
        console.error('엑셀 생성 오류:', error);

        res.status(500).json({
            success: false,
            error: '엑셀 파일 생성 중 오류가 발생했습니다.'
        });
    }
};
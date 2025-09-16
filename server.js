// server.js : Express 서버
const express = require('express');
const path = require('path');
const { crawlKiprisList, crawlPatentgoDetails } = require('./crawler');

const app = express();

// 미들웨어 설정
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// 뷰 엔진 설정
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// API 라우터 연결
const apiRoutes = require('./routes/api');
app.use('/api', apiRoutes);

app.get('/registered', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).send('검색어(q)가 필요합니다. 예: /registered?q=삼성');

    const list = await crawlKiprisList(q);
    const results = [];

    for (const it of list) {
      const one = { ...it };
      if (one.regNo) {
        const det = await crawlPatentgoDetails(one.regNo);
        one.regStatus = det.regStatus;
        one.claimCount = det.claimCount;
        one.expireDate = det.expireDate;
        if (!det.isValid) {
          one.validity = '불납';
        } else {
          one.validity = '유효';
          if (det.lastRow) {
            one.currYear = det.lastRow.year;
            one.currDueDate = det.lastRow.paidDate;
            one.currFee = det.lastRow.paidAmount;
          }
          if (det.prevRow) {
            const prev = det.prevRow;
            one.prevPaid = `${prev.paidDate} (${prev.year}, ${prev.paidAmount})`;
          }
        }
      }
      results.push(one);
    }

    res.render('registered', { items: results, query: q });
  } catch (e) {
    console.error(e);
    res.status(500).send('에러: ' + e.message);
  }
});

// 연차료 납부의뢰 감사 페이지
app.get('/e_thanks', (req, res) => {
  res.render('e_thanks');
});

app.listen(3000, () => {
  console.log('서버 실행: http://localhost:3000/registered?q=검색어');
});

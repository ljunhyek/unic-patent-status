# 이 셀은 크롤링 스크립트를 파일로 저장만 합니다. (실행은 사용 환경에서 해주세요)
script_path = "/mnt/data/크롤링_파일_v2.py"
code = r'''
# -*- coding: utf-8 -*-
"""
KIPRIS 크롤러 (확장 버전)
- 결과 화면을 '서지정보보기(data-view-option="seoji")'로 전환
- 메인 검색결과에서 출원번호/출원일/제목/등록번호/등록일/출원인/발명자 추출
- 상세 → '등록사항' 탭에서 청구범위의 항수, 존속기간(예정)만료일, 등록료 테이블의 마지막 행(분기/금액/납부일/상태) 추출
- result_add.csv로 저장
"""
import re
import csv
from typing import List, Dict, Optional, Tuple

from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

RESULT_CSV = "result_add.csv"
DEFAULT_INPUT = "input_data.csv"

def clean_text(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()

def process_customer_number(raw_number: str) -> Optional[str]:
    numbers_only = re.sub(r"[^\d]", "", str(raw_number))
    if len(numbers_only) == 12:
        return numbers_only
    return None

def split_number_date(text: str) -> Tuple[str, str]:
    """
    '1016842200000(2016-12-01)' -> ('1016842200000', '2016-12-01')
    '1020160042595(2016-04-07)' -> ('1020160042595', '2016-04-07')
    """
    text = clean_text(text)
    m = re.match(r"^(\d{10,16})\s*\((\d{4}-\d{2}-\d{2})\)$", text)
    if m:
        return m.group(1), m.group(2)
    # fallback
    num = re.search(r"\d{10,16}", text)
    date = re.search(r"\d{4}-\d{2}-\d{2}", text)
    return (num.group(0) if num else ""), (date.group(0) if date else "")

def ensure_seoji_view(page) -> None:
    """결과 화면에서 '서지정보보기' 버튼 활성화"""
    try:
        btn = page.locator("button.btn-view[data-view-option='seoji']")
        btn.wait_for(state="visible", timeout=4000)
        class_attr = btn.get_attribute("class") or ""
        if "active" not in class_attr:
            btn.click()
            page.wait_for_timeout(600)
    except PlaywrightTimeoutError:
        pass

def extract_main_item(article) -> Dict[str, str]:
    """메인 검색결과 한 항목(article.result-item)에서 필요한 필드 추출"""
    data = {
        "title": "",
        "appl_no": "",
        "appl_date": "",
        "reg_no": "",
        "reg_date": "",
        "applicant": "",
        "inventor": "",
    }
    # 제목
    try:
        raw_title = article.locator("h1.title").inner_text()
        raw_title = clean_text(raw_title)
        data["title"] = re.sub(r"^\[\d+\]\s*", "", raw_title)
    except Exception:
        pass

    # 리스트 영역
    lis = article.locator("ul.list > li")
    count = lis.count()
    for i in range(count):
        li = lis.nth(i)
        try:
            label = clean_text(li.locator("em.tit").inner_text())
        except Exception:
            continue
        # 출원번호(일자)
        if "출원번호" in label:
            txt = clean_text(li.locator(".link-wrap").inner_text())
            no_, dt_ = split_number_date(txt)
            data["appl_no"] = no_
            data["appl_date"] = dt_
        # 등록번호(일자)
        elif "등록번호" in label:
            txt = clean_text(li.locator(".link-wrap").inner_text())
            no_, dt_ = split_number_date(txt)
            data["reg_no"] = no_
            data["reg_date"] = dt_
        # 출원인
        elif "출원인" in label:
            names = []
            btns = li.locator(".link-wrap button.link, .link-wrap .link")
            for j in range(btns.count()):
                names.append(clean_text(btns.nth(j).inner_text()))
            if not names:
                names_txt = clean_text(li.locator(".link-wrap").inner_text())
                if names_txt:
                    names.append(names_txt)
            data["applicant"] = ";".join(names)
        # 발명자
        elif "발명자" in label:
            names = []
            btns = li.locator(".link-wrap button.link, .link-wrap .link")
            for j in range(btns.count()):
                names.append(clean_text(btns.nth(j).inner_text()))
            if not names:
                names_txt = clean_text(li.locator(".link-wrap").inner_text())
                if names_txt:
                    names.append(names_txt)
            data["inventor"] = ";".join(names)

    return data

def open_detail_then_regtab(context, page, article) -> Optional[object]:
    """제목 클릭 후 상세 페이지(또는 팝업)로 이동하고 '등록사항' 탭 클릭"""
    title_btn = article.locator("h1.title button.link")
    try:
        title_btn.wait_for(state="visible", timeout=4000)
    except PlaywrightTimeoutError:
        return None

    new_page = None
    try:
        with context.expect_page() as p_info:
            title_btn.click()
        new_page = p_info.value
        new_page.wait_for_load_state("domcontentloaded", timeout=10000)
    except Exception:
        try:
            title_btn.click()
            page.wait_for_load_state("domcontentloaded", timeout=8000)
            new_page = page
        except Exception:
            return None

    # '등록사항' 탭 클릭
    try:
        tab_btn = new_page.locator("button.btn-tab[data-tab-id='detail07']")
        tab_btn.wait_for(state="visible", timeout=8000)
        tab_btn.click()
        new_page.wait_for_timeout(800)
    except Exception:
        return new_page

    return new_page

def extract_reg_info(detail_page) -> Dict[str, str]:
    """등록사항 탭에서 청구항수/만료일/등록료(마지막행) 추출"""
    info = {
        "claims_count": "",
        "expiry_date": "",
        "last_fee_quarter": "",
        "last_fee_amount": "",
        "last_fee_paydate": "",
        "last_fee_status": "",
    }
    # ul.regist-list 내 라벨/값
    try:
        items = detail_page.locator("ul.regist-list > li")
        for i in range(items.count()):
            li = items.nth(i)
            try:
                k = clean_text(li.locator("em.tit").inner_text())
                v = clean_text(li.locator("span").inner_text())
            except Exception:
                continue
            if "청구범위의항수" in k:
                info["claims_count"] = v
            elif "존속기간(예정)만료일" in k or "존속기간" in k:
                info["expiry_date"] = v
    except Exception:
        pass

    # 등록료 테이블의 마지막 행 (휴리스틱)
    try:
        reg_fee_anchor = detail_page.locator("text=등록료").first
        if reg_fee_anchor:
            table = reg_fee_anchor.locator("xpath=ancestor-or-self::*[self::section or self::div][1]//table").first
            if not table or table.count() == 0:
                table = detail_page.locator("table").last
            last_tr = table.locator("tbody tr").last
            tds = last_tr.locator("td")
            if tds.count() >= 4:
                info["last_fee_quarter"] = clean_text(tds.nth(0).inner_text())
                info["last_fee_amount"] = clean_text(tds.nth(1).inner_text())
                info["last_fee_paydate"] = clean_text(tds.nth(2).inner_text())
                info["last_fee_status"] = clean_text(tds.nth(3).inner_text())
    except Exception:
        pass

    return info

def search_and_collect(customer_number: str) -> List[Dict[str, str]]:
    """고객번호로 검색하여 결과 항목별로 메인/등록사항 정보를 결합해서 반환"""
    results: List[Dict[str, str]] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        try:
            # 1) 메인 진입 & 검색
            page.goto("https://www.kipris.or.kr/khome/main.do", wait_until="networkidle")
            q = f"TRH=[{customer_number}]"
            search_input = page.wait_for_selector("#inputQuery", timeout=10000)
            search_input.fill(q)
            search_input.press("Enter")
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(1200)

            # seoji로 전환
            ensure_seoji_view(page)

            # 검색 결과의 각 article
            articles = page.locator("article.result-item")
            n = articles.count()
            for i in range(n):
                article = articles.nth(i)
                main_data = extract_main_item(article)

                # 상세-등록사항
                detail = open_detail_then_regtab(context, page, article)
                reginfo = {}
                if detail:
                    reginfo = extract_reg_info(detail)
                    # 팝업이면 닫기
                    try:
                        if detail != page:
                            detail.close()
                    except Exception:
                        pass

                row = {
                    "customer_no": customer_number,
                    "appl_no": main_data.get("appl_no", ""),
                    "reg_no": main_data.get("reg_no", ""),
                    "applicant": main_data.get("applicant", ""),
                    "inventor": main_data.get("inventor", ""),
                    "appl_date": main_data.get("appl_date", ""),
                    "reg_date": main_data.get("reg_date", ""),
                    "title": main_data.get("title", ""),
                    "claims_count": reginfo.get("claims_count", ""),
                    "expiry_date": reginfo.get("expiry_date", ""),
                    "last_fee_info": " / ".join(
                        [reginfo.get("last_fee_quarter", ""), reginfo.get("last_fee_amount", ""),
                         reginfo.get("last_fee_paydate", ""), reginfo.get("last_fee_status", "")]
                    ).strip(" / "),
                }
                results.append(row)

        finally:
            browser.close()
    return results

def run(input_csv: str = DEFAULT_INPUT):
    # 입력 CSV: 첫 컬럼에 고객번호
    try:
        with open(input_csv, "r", encoding="utf-8-sig") as f:
            reader = csv.reader(f)
            rows = list(reader)
    except FileNotFoundError:
        print(f"입력 파일을 찾을 수 없습니다: {input_csv}")
        return

    # 헤더 스킵 여부
    if rows and not re.sub(r"[^\d]", "", rows[0][0]).isdigit():
        data_rows = rows[1:]
    else:
        data_rows = rows

    all_results: List[Dict[str, str]] = []
    for r in data_rows:
        if not r:
            continue
        raw = r[0]
        cn = process_customer_number(raw)
        if not cn:
            print(f"무효 고객번호 스킵: {raw}")
            continue
        print(f"수집 시작 - 고객번호: {cn}")
        part = search_and_collect(cn)
        all_results.extend(part)

    # CSV 저장
    if all_results:
        with open(RESULT_CSV, "w", newline="", encoding="utf-8-sig") as f:
            w = csv.writer(f)
            w.writerow([
                "고객번호","출원번호","등록번호","출원인","발명자",
                "출원일","등록일","발명의명칭","청구항수","존속기간 만료일","직전년도 납부정보"
            ])
            for d in all_results:
                w.writerow([
                    d.get("customer_no",""),
                    d.get("appl_no",""),
                    d.get("reg_no",""),
                    d.get("applicant",""),
                    d.get("inventor",""),
                    d.get("appl_date",""),
                    d.get("reg_date",""),
                    d.get("title",""),
                    d.get("claims_count",""),
                    d.get("expiry_date",""),
                    d.get("last_fee_info",""),
                ])
        print(f"저장 완료: {RESULT_CSV} (총 {len(all_results)}건)")
    else:
        print("수집 결과가 없어 저장하지 않았습니다.")

if __name__ == "__main__":
    run(DEFAULT_INPUT)
'''
with open(script_path, "w", encoding="utf-8") as f:
    f.write(code)

script_path
